begin;

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  relationship text not null check (relationship in ('source', 'supporting')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (document_id, work_item_id)
);

create index document_links_property_id_idx on public.document_links(property_id);
create index document_links_work_item_id_idx on public.document_links(work_item_id);

create or replace function private.validate_document_link_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_property_id uuid;
  work_property_id uuid;
begin
  select property_id into document_property_id from public.documents where id = new.document_id;
  select property_id into work_property_id from public.work_items where id = new.work_item_id;
  if document_property_id is null or work_property_id is null
    or document_property_id <> work_property_id
    or new.property_id <> document_property_id then
    raise exception 'Document and work item must belong to the same property';
  end if;
  return new;
end;
$$;

create trigger document_links_validate_property
before insert or update on public.document_links
for each row execute function private.validate_document_link_property();

alter table public.document_links enable row level security;

create policy document_links_select_members
on public.document_links for select to authenticated
using (private.can_access_property(property_id));

create policy document_links_insert_managers
on public.document_links for insert to authenticated
with check (private.can_manage_property(property_id) and created_by = (select auth.uid()));

create policy document_links_delete_managers
on public.document_links for delete to authenticated
using (private.can_manage_property(property_id));

grant select, insert, delete on public.document_links to authenticated;

create or replace function public.link_document_to_work_item(
  target_document_id uuid,
  target_work_item_id uuid default null,
  new_title text default null,
  new_category_name text default null,
  new_area_name text default null,
  new_description text default null,
  new_work_type text default 'other',
  new_estimated_cost_minor bigint default null,
  new_currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  source_document public.documents;
  linked_work public.work_items;
  property_account_id uuid;
  category_id_value uuid;
  area_id_value uuid;
  resulting_work_item_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  select * into source_document from public.documents where id = target_document_id;
  if source_document.id is null or not private.can_manage_property(source_document.property_id) then
    raise exception 'Not authorized to link this document';
  end if;

  if target_work_item_id is not null then
    select * into linked_work from public.work_items where id = target_work_item_id and archived_at is null;
    if linked_work.id is null or linked_work.property_id <> source_document.property_id then
      raise exception 'Work item is not available for this document';
    end if;
    resulting_work_item_id := linked_work.id;
  else
    if new_title is null or length(trim(new_title)) = 0 then raise exception 'A work item title is required'; end if;
    if new_work_type not in ('inspect', 'maintain', 'repair', 'replace', 'improve', 'monitor', 'other') then
      raise exception 'Unsupported work type';
    end if;
    if new_estimated_cost_minor is not null and new_estimated_cost_minor < 0 then raise exception 'Invalid estimated cost'; end if;
    if new_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;

    select account_id into property_account_id from public.properties where id = source_document.property_id;
    select id into category_id_value
    from public.categories
    where name = new_category_name and (account_id is null or account_id = property_account_id)
    order by (account_id is not null) desc
    limit 1;
    select id into area_id_value
    from public.areas
    where property_id = source_document.property_id and name = new_area_name
    limit 1;

    insert into public.work_items (
      property_id, category_id, area_id, source_key, title, description, work_type,
      status, priority, estimated_cost_minor, currency, source_type, source_document_id,
      source_location, created_by, updated_by
    ) values (
      source_document.property_id, category_id_value, area_id_value,
      'document:' || source_document.id::text,
      trim(new_title), nullif(trim(new_description), ''), new_work_type,
      'inbox', 'routine', new_estimated_cost_minor, new_currency,
      source_document.document_type, source_document.id,
      new_area_name, current_user_id, current_user_id
    ) returning id into resulting_work_item_id;
  end if;

  insert into public.document_links (
    property_id, document_id, work_item_id, relationship, created_by
  ) values (
    source_document.property_id, source_document.id, resulting_work_item_id,
    case when target_work_item_id is null then 'source' else 'supporting' end,
    current_user_id
  ) on conflict (document_id, work_item_id) do nothing;

  update public.documents set status = 'accepted' where id = source_document.id;

  insert into public.activity_events (
    property_id, work_item_id, event_type, note, metadata, created_by
  ) values (
    source_document.property_id, resulting_work_item_id, 'document_attached',
    case when target_work_item_id is null then 'Created from uploaded ' else 'Attached uploaded ' end || source_document.document_type,
    jsonb_build_object('document_id', source_document.id, 'document_type', source_document.document_type),
    current_user_id
  );

  return resulting_work_item_id;
end;
$$;

revoke all on function public.link_document_to_work_item(uuid, uuid, text, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.link_document_to_work_item(uuid, uuid, text, text, text, text, text, bigint, text) to authenticated;

commit;
