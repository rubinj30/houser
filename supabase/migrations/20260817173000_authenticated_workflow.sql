begin;

alter table public.assets
  add column source_key text,
  add column source_page_numbers integer[] not null default '{}';

create unique index assets_property_source_key_idx
  on public.assets(property_id, source_key);

alter table public.work_items
  add column source_location text,
  add column source_page_numbers integer[] not null default '{}',
  add column source_document_name text,
  add column source_document_date date;

alter table public.assets
  add constraint assets_source_page_numbers_positive
  check (0 < all(source_page_numbers));

alter table public.work_items
  add constraint work_items_source_page_numbers_positive
  check (0 < all(source_page_numbers));

create or replace function public.record_work_item_review(
  target_work_item_id uuid,
  next_status text,
  review_note text default null
)
returns public.work_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_item public.work_items;
  updated_item public.work_items;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if next_status not in ('inbox', 'planned', 'completed', 'deferred', 'rejected') then
    raise exception 'Unsupported review status: %', next_status;
  end if;

  select item.* into current_item
  from public.work_items item
  where item.id = target_work_item_id
  for update;

  if current_item.id is null then
    raise exception 'Work item not found';
  end if;

  if not private.can_manage_property(current_item.property_id) then
    raise exception 'Not authorized to update this work item';
  end if;

  update public.work_items item
  set status = next_status,
      completed_at = case when next_status = 'completed' then coalesce(item.completed_at, now()) else null end,
      updated_by = current_user_id
  where item.id = target_work_item_id
  returning item.* into updated_item;

  insert into public.activity_events (
    property_id,
    work_item_id,
    event_type,
    status_from,
    status_to,
    note,
    created_by
  ) values (
    current_item.property_id,
    current_item.id,
    'status_change',
    current_item.status,
    next_status,
    nullif(trim(review_note), ''),
    current_user_id
  );

  return updated_item;
end;
$$;

revoke all on function public.record_work_item_review(uuid, text, text) from public, anon;
grant execute on function public.record_work_item_review(uuid, text, text) to authenticated;

commit;
