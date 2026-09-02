begin;

create or replace function public.plan_work_item(
  target_work_item_id uuid default null,
  target_property_id uuid default null,
  expected_updated_at timestamptz default null,
  new_source_type text default 'manual',
  new_title text default null,
  new_description text default null,
  new_category_name text default null,
  new_area_name text default null,
  new_work_type text default null,
  new_status text default null,
  new_priority text default null,
  new_target_start_on date default null,
  new_target_end_on date default null,
  activity_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_item public.work_items;
  saved_item public.work_items;
  property_account_id uuid;
  category_id_value uuid;
  area_id_value uuid;
  category_name_value text;
  area_name_value text;
  is_create boolean := target_work_item_id is null;
  status_changed boolean;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  if is_create then
    if target_property_id is null or not private.can_manage_property(target_property_id) then
      raise exception 'That property is not available';
    end if;
    if new_title is null or length(trim(new_title)) not between 1 and 240 then
      raise exception 'A Work item title is required';
    end if;
    if coalesce(new_work_type, 'other') not in ('inspect', 'maintain', 'repair', 'replace', 'improve', 'monitor', 'other') then
      raise exception 'Unsupported work type';
    end if;
    if coalesce(new_status, 'inbox') not in ('inbox', 'planned', 'scheduled', 'in_progress', 'completed', 'deferred', 'rejected', 'canceled') then
      raise exception 'Unsupported Work status';
    end if;
    if coalesce(new_priority, 'routine') not in ('emergency', 'urgent', 'important', 'routine', 'informational') then
      raise exception 'Unsupported Work priority';
    end if;
  else
    select item.* into current_item
    from public.work_items item
    where item.id = target_work_item_id and item.archived_at is null
    for update;

    if current_item.id is null or not private.can_manage_property(current_item.property_id) then
      raise exception 'That Work item is no longer available';
    end if;
    if expected_updated_at is null or current_item.updated_at <> expected_updated_at then
      raise exception 'That Work item changed since this proposal was prepared. Ask Houser to review it again.';
    end if;
    target_property_id := current_item.property_id;
  end if;

  select property.account_id into property_account_id
  from public.properties property
  where property.id = target_property_id;

  if new_category_name is not null then
    select category.id, category.name into category_id_value, category_name_value
    from public.categories category
    where category.name = new_category_name
      and (category.account_id is null or category.account_id = property_account_id)
    order by (category.account_id is not null) desc
    limit 1;
  elsif not is_create then
    category_id_value := current_item.category_id;
  end if;

  if new_area_name is not null then
    select area.id, area.name into area_id_value, area_name_value
    from public.areas area
    where area.property_id = target_property_id and area.name = new_area_name
    limit 1;
    if area_id_value is null then
      insert into public.areas (property_id, name)
      values (target_property_id, trim(new_area_name))
      returning id, name into area_id_value, area_name_value;
    end if;
  elsif not is_create then
    area_id_value := current_item.area_id;
  end if;

  if is_create then
    insert into public.work_items (
      property_id, category_id, area_id, source_key, title, description, work_type,
      status, priority, target_start_on, target_end_on, source_type, source_location,
      completed_at, created_by, updated_by
    ) values (
      target_property_id, category_id_value, area_id_value,
      coalesce(nullif(trim(new_source_type), ''), 'manual') || '-' || gen_random_uuid()::text,
      trim(new_title), nullif(trim(new_description), ''), coalesce(new_work_type, 'other'),
      coalesce(new_status, 'inbox'), coalesce(new_priority, 'routine'),
      new_target_start_on, new_target_end_on, coalesce(nullif(trim(new_source_type), ''), 'manual'),
      nullif(trim(new_area_name), ''),
      case when new_status = 'completed' then now() else null end,
      current_user_id, current_user_id
    ) returning * into saved_item;
  else
    update public.work_items item
    set title = coalesce(nullif(trim(new_title), ''), item.title),
        description = case when new_description is null then item.description else nullif(trim(new_description), '') end,
        category_id = case when new_category_name is null then item.category_id else category_id_value end,
        area_id = case when new_area_name is null then item.area_id else area_id_value end,
        source_location = case when new_area_name is null then item.source_location else nullif(trim(new_area_name), '') end,
        work_type = coalesce(new_work_type, item.work_type),
        status = coalesce(new_status, item.status),
        priority = coalesce(new_priority, item.priority),
        target_start_on = coalesce(new_target_start_on, item.target_start_on),
        target_end_on = coalesce(new_target_end_on, item.target_end_on),
        completed_at = case
          when new_status = 'completed' then coalesce(item.completed_at, now())
          when new_status is not null then null
          else item.completed_at
        end,
        updated_by = current_user_id
    where item.id = current_item.id and item.updated_at = expected_updated_at
    returning item.* into saved_item;
    if saved_item.id is null then
      raise exception 'That Work item changed before the update was saved. Ask Houser to try again.';
    end if;
  end if;

  status_changed := not is_create and new_status is not null and new_status is distinct from current_item.status;
  insert into public.activity_events (
    property_id, work_item_id, event_type, status_from, status_to, note, metadata, created_by
  ) values (
    saved_item.property_id,
    saved_item.id,
    case when is_create then 'created' when status_changed then 'status_change' else 'edited' end,
    case when status_changed then current_item.status else null end,
    case when is_create or status_changed then saved_item.status else null end,
    nullif(trim(activity_note), ''),
    jsonb_build_object('source', coalesce(nullif(trim(new_source_type), ''), case when is_create then 'manual' else 'chat' end)),
    current_user_id
  );

  if category_name_value is null and saved_item.category_id is not null then
    select category.name into category_name_value from public.categories category where category.id = saved_item.category_id;
  end if;
  if area_name_value is null and saved_item.area_id is not null then
    select area.name into area_name_value from public.areas area where area.id = saved_item.area_id;
  end if;

  return jsonb_build_object(
    'id', saved_item.id,
    'propertyId', saved_item.property_id,
    'reference', coalesce(saved_item.source_section, saved_item.source_key, saved_item.id::text),
    'title', saved_item.title,
    'description', saved_item.description,
    'category', category_name_value,
    'area', area_name_value,
    'status', saved_item.status,
    'priority', saved_item.priority,
    'workType', saved_item.work_type,
    'targetStartOn', saved_item.target_start_on,
    'targetEndOn', saved_item.target_end_on,
    'updatedAt', saved_item.updated_at
  );
end;
$$;

revoke all on function public.plan_work_item(uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.plan_work_item(uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, date, date, text) to authenticated;

commit;
