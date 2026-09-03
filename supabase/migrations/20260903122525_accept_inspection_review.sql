begin;

create or replace function public.accept_inspection_review(
  target_property_id uuid,
  review_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  accepted_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if review_mode not in ('reviewed_report', 'skip_detailed_review') then
    raise exception 'Unsupported inspection review mode';
  end if;

  if target_property_id is null or not private.can_manage_property(target_property_id) then
    raise exception 'That property is not available';
  end if;

  with remaining as materialized (
    select item.id, item.property_id, item.status
    from public.work_items item
    join public.documents document on document.id = item.source_document_id
    where item.property_id = target_property_id
      and document.property_id = target_property_id
      and document.document_type = 'inspection'
      and item.status = 'inbox'
      and item.archived_at is null
    for update of item
  ), updated as (
    update public.work_items item
    set status = 'planned',
        completed_at = null,
        updated_by = current_user_id
    from remaining
    where item.id = remaining.id
    returning item.id, item.property_id
  ), events as (
    insert into public.activity_events (
      property_id,
      work_item_id,
      event_type,
      status_from,
      status_to,
      note,
      metadata,
      created_by
    )
    select
      updated.property_id,
      updated.id,
      'status_change',
      'inbox',
      'planned',
      case review_mode
        when 'reviewed_report' then 'Owner acknowledged reviewing the inspection report.'
        else 'Owner skipped the detailed finding-by-finding review.'
      end,
      jsonb_build_object('source', 'inspection_review', 'reviewMode', review_mode),
      current_user_id
    from updated
    returning work_item_id
  )
  select coalesce(array_agg(work_item_id), array[]::uuid[])
  into accepted_ids
  from events;

  return jsonb_build_object(
    'acceptedCount', cardinality(accepted_ids),
    'workItemIds', to_jsonb(accepted_ids)
  );
end;
$$;

revoke all on function public.accept_inspection_review(uuid, text) from public, anon;
grant execute on function public.accept_inspection_review(uuid, text) to authenticated;

commit;
