begin;

alter table public.service_records
  add column recurrence_months integer
    check (recurrence_months is null or recurrence_months between 1 and 1200),
  add column next_service_on date;

alter table public.work_items
  add column recurrence_months integer
    check (recurrence_months is null or recurrence_months between 1 and 1200),
  add column origin_service_record_id uuid
    references public.service_records(id) on delete set null;

create index work_items_origin_service_record_id_idx
  on public.work_items(origin_service_record_id);

create or replace function public.complete_work_item(
  target_work_item_id uuid,
  service_performed_on date,
  service_vendor_name text default null,
  service_cost_minor bigint default null,
  service_note text default null,
  service_warranty_ends_on date default null,
  next_recurrence_months integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_item public.work_items;
  created_service public.service_records;
  created_next_item public.work_items;
  calculated_next_service_on date;
  normalized_note text := nullif(trim(service_note), '');
  normalized_vendor text := nullif(trim(service_vendor_name), '');
  mapped_service_type text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if service_performed_on is null then
    raise exception 'Completion date is required';
  end if;

  if service_performed_on > current_date then
    raise exception 'Completion date cannot be in the future';
  end if;

  if service_cost_minor is not null and service_cost_minor < 0 then
    raise exception 'Cost cannot be negative';
  end if;

  if service_warranty_ends_on is not null and service_warranty_ends_on < service_performed_on then
    raise exception 'Warranty end date cannot precede completion date';
  end if;

  if next_recurrence_months is not null and next_recurrence_months not between 1 and 1200 then
    raise exception 'Recurrence must be between 1 and 1200 months';
  end if;

  select item.* into current_item
  from public.work_items item
  where item.id = target_work_item_id
  for update;

  if current_item.id is null then
    raise exception 'Work item not found';
  end if;

  if not private.can_manage_property(current_item.property_id) then
    raise exception 'Not authorized to complete this work item';
  end if;

  mapped_service_type := case current_item.work_type
    when 'inspect' then 'inspection'
    when 'maintain' then 'maintenance'
    when 'repair' then 'repair'
    when 'replace' then 'replacement'
    else 'other'
  end;

  if next_recurrence_months is not null then
    calculated_next_service_on := (
      service_performed_on + make_interval(months => next_recurrence_months)
    )::date;
  end if;

  insert into public.service_records (
    property_id,
    category_id,
    asset_id,
    work_item_id,
    service_type,
    performed_on,
    description,
    vendor_name,
    cost_minor,
    currency,
    warranty_ends_on,
    recurrence_months,
    next_service_on,
    created_by
  ) values (
    current_item.property_id,
    current_item.category_id,
    current_item.asset_id,
    current_item.id,
    mapped_service_type,
    service_performed_on,
    coalesce(normalized_note, current_item.title),
    normalized_vendor,
    service_cost_minor,
    current_item.currency,
    service_warranty_ends_on,
    next_recurrence_months,
    calculated_next_service_on,
    current_user_id
  )
  returning * into created_service;

  update public.work_items item
  set status = 'completed',
      completed_at = service_performed_on::timestamp at time zone 'UTC',
      updated_by = current_user_id
  where item.id = current_item.id;

  insert into public.activity_events (
    property_id,
    work_item_id,
    event_type,
    status_from,
    status_to,
    note,
    metadata,
    created_by
  ) values (
    current_item.property_id,
    current_item.id,
    'service_recorded',
    current_item.status,
    'completed',
    normalized_note,
    jsonb_strip_nulls(jsonb_build_object(
      'service_record_id', created_service.id,
      'performed_on', service_performed_on,
      'vendor_name', normalized_vendor,
      'cost_minor', service_cost_minor,
      'currency', current_item.currency,
      'warranty_ends_on', service_warranty_ends_on,
      'recurrence_months', next_recurrence_months,
      'next_service_on', calculated_next_service_on
    )),
    current_user_id
  );

  if calculated_next_service_on is not null then
    insert into public.work_items (
      property_id,
      category_id,
      area_id,
      asset_id,
      source_key,
      title,
      description,
      work_type,
      status,
      priority,
      target_start_on,
      target_end_on,
      target_basis,
      recurrence_months,
      origin_service_record_id,
      source_type,
      source_location,
      created_by,
      updated_by
    ) values (
      current_item.property_id,
      current_item.category_id,
      current_item.area_id,
      current_item.asset_id,
      'recurring-' || created_service.id::text,
      current_item.title,
      'Recurring follow-up created from completed work: ' || current_item.title,
      current_item.work_type,
      'scheduled',
      'routine',
      calculated_next_service_on,
      calculated_next_service_on,
      'Recurring every ' || next_recurrence_months || ' months from service completed ' || service_performed_on,
      next_recurrence_months,
      created_service.id,
      'recurrence',
      current_item.source_location,
      current_user_id,
      current_user_id
    )
    returning * into created_next_item;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'service_record_id', created_service.id,
    'next_work_item_id', created_next_item.id,
    'next_service_on', calculated_next_service_on
  ));
end;
$$;

revoke all on function public.complete_work_item(uuid, date, text, bigint, text, date, integer) from public, anon;
grant execute on function public.complete_work_item(uuid, date, text, bigint, text, date, integer) to authenticated;

commit;
