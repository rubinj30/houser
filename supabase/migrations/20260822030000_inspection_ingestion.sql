begin;

alter table public.documents
  add column if not exists page_count integer check (page_count is null or page_count > 0);

alter table public.work_items
  add column if not exists source_document_id uuid references public.documents(id) on delete set null,
  add column if not exists source_section text,
  add column if not exists source_category text,
  add column if not exists source_severity text
    check (source_severity is null or source_severity in ('maintenance_item', 'recommendation', 'safety_hazard')),
  add column if not exists source_excerpt text;

create index if not exists work_items_source_document_id_idx on public.work_items(source_document_id);
create index if not exists work_items_property_source_section_idx on public.work_items(property_id, source_section);

create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  extractor_name text not null default 'openai_responses',
  model text not null,
  schema_version integer not null default 1,
  status text not null default 'processing'
    check (status in ('processing', 'review_ready', 'accepted', 'failed')),
  result jsonb,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  error_code text,
  error_message text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index extraction_runs_document_id_idx on public.extraction_runs(document_id, created_at desc);
create index extraction_runs_property_id_idx on public.extraction_runs(property_id, created_at desc);

create trigger extraction_runs_set_updated_at
before update on public.extraction_runs
for each row execute function private.set_updated_at();

alter table public.extraction_runs enable row level security;

create policy extraction_runs_select_members
on public.extraction_runs for select to authenticated
using (private.can_access_property(property_id));

create policy extraction_runs_insert_managers
on public.extraction_runs for insert to authenticated
with check (private.can_manage_property(property_id) and created_by = (select auth.uid()));

create policy extraction_runs_update_managers
on public.extraction_runs for update to authenticated
using (private.can_manage_property(property_id))
with check (private.can_manage_property(property_id));

grant select, insert, update on public.extraction_runs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.property_id_from_storage_name(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy documents_storage_select_members
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and private.can_access_property(private.property_id_from_storage_name(name))
);

create policy documents_storage_insert_managers
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
);

create policy documents_storage_update_managers
on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
)
with check (
  bucket_id = 'documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
);

create policy documents_storage_delete_managers
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
);

create or replace function public.accept_inspection_extraction(
  target_run_id uuid,
  replace_existing boolean default false,
  preserve_section text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  extraction public.extraction_runs;
  source_document public.documents;
  finding jsonb;
  existing_item_id uuid;
  category_id_value uuid;
  area_id_value uuid;
  source_section_value text;
  category_name_value text;
  system_category_name text;
  area_name_value text;
  page_numbers integer[];
  imported_count integer := 0;
  removed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select run.* into extraction
  from public.extraction_runs run
  where run.id = target_run_id
  for update;

  if extraction.id is null then
    raise exception 'Extraction run not found';
  end if;

  if not private.can_manage_property(extraction.property_id) then
    raise exception 'Not authorized to import this inspection';
  end if;

  if extraction.status not in ('review_ready', 'accepted') or extraction.result is null then
    raise exception 'Extraction is not ready for import';
  end if;

  select document.* into source_document
  from public.documents document
  where document.id = extraction.document_id
    and document.property_id = extraction.property_id;

  if source_document.id is null then
    raise exception 'Source document not found';
  end if;

  if replace_existing then
    delete from public.work_items item
    where item.property_id = extraction.property_id
      and item.source_type = 'inspection'
      and (
        preserve_section is null
        or coalesce(item.source_section, item.source_key) <> preserve_section
      );
    get diagnostics removed_count = row_count;
  end if;

  if preserve_section is not null then
    update public.work_items item
    set source_document_id = source_document.id,
        source_section = preserve_section,
        source_key = 'inspection:' || source_document.id::text || ':' || preserve_section,
        source_document_name = source_document.original_filename,
        source_document_date = source_document.document_date,
        updated_by = current_user_id
    where item.property_id = extraction.property_id
      and item.source_type = 'inspection'
      and coalesce(item.source_section, item.source_key) = preserve_section;
  end if;

  for finding in
    select value from jsonb_array_elements(extraction.result -> 'findings')
  loop
    source_section_value := nullif(trim(finding ->> 'sourceSection'), '');
    category_name_value := nullif(trim(finding ->> 'category'), '');
    area_name_value := coalesce(nullif(trim(finding ->> 'area'), ''), 'General');

    if source_section_value is null then
      raise exception 'Every imported finding requires a source section';
    end if;

    select coalesce(array_agg(page::integer order by page::integer), '{}') into page_numbers
    from jsonb_array_elements_text(finding -> 'sourcePages') as page;

    if cardinality(page_numbers) = 0 or 0 >= any(page_numbers) then
      raise exception 'Finding % requires positive source pages', source_section_value;
    end if;

    system_category_name := case category_name_value
      when 'HVAC' then 'HVAC and Ventilation'
      when 'Plumbing' then 'Plumbing and Water'
      when 'Interior' then 'Interior and Finishes'
      when 'Structure and Water Management' then 'Structure and Foundation'
      when 'Garage' then 'General'
      else category_name_value
    end;

    select category.id into category_id_value
    from public.categories category
    where category.account_id is null
      and category.name = system_category_name
    limit 1;

    if category_id_value is null then
      select category.id into category_id_value
      from public.categories category
      where category.account_id is null and category.name = 'General'
      limit 1;
    end if;

    insert into public.areas (property_id, name)
    values (extraction.property_id, area_name_value)
    on conflict (property_id, name) do update set name = excluded.name
    returning id into area_id_value;

    select item.id into existing_item_id
    from public.work_items item
    where item.property_id = extraction.property_id
      and item.source_type = 'inspection'
      and coalesce(item.source_section, item.source_key) = source_section_value
    order by item.created_at
    limit 1
    for update;

    if existing_item_id is null then
      insert into public.work_items (
        property_id,
        category_id,
        area_id,
        source_key,
        title,
        description,
        work_type,
        status,
        priority,
        safety_flags,
        source_type,
        source_location,
        source_page_numbers,
        source_document_name,
        source_document_date,
        source_document_id,
        source_section,
        source_category,
        source_severity,
        source_excerpt,
        created_by,
        updated_by
      ) values (
        extraction.property_id,
        category_id_value,
        area_id_value,
        'inspection:' || source_document.id::text || ':' || source_section_value,
        finding ->> 'title',
        finding ->> 'recommendation',
        finding ->> 'workType',
        'inbox',
        finding ->> 'priority',
        case when finding ->> 'severity' = 'safety_hazard' then array['life_safety'] else '{}' end,
        'inspection',
        finding ->> 'location',
        page_numbers,
        source_document.original_filename,
        source_document.document_date,
        source_document.id,
        source_section_value,
        category_name_value,
        finding ->> 'severity',
        finding ->> 'sourceExcerpt',
        current_user_id,
        current_user_id
      );
    else
      update public.work_items item
      set category_id = category_id_value,
          area_id = area_id_value,
          source_key = 'inspection:' || source_document.id::text || ':' || source_section_value,
          title = finding ->> 'title',
          description = finding ->> 'recommendation',
          work_type = finding ->> 'workType',
          priority = finding ->> 'priority',
          safety_flags = case when finding ->> 'severity' = 'safety_hazard' then array['life_safety'] else '{}' end,
          source_location = finding ->> 'location',
          source_page_numbers = page_numbers,
          source_document_name = source_document.original_filename,
          source_document_date = source_document.document_date,
          source_document_id = source_document.id,
          source_section = source_section_value,
          source_category = category_name_value,
          source_severity = finding ->> 'severity',
          source_excerpt = finding ->> 'sourceExcerpt',
          updated_by = current_user_id
      where item.id = existing_item_id;
    end if;

    imported_count := imported_count + 1;
    existing_item_id := null;
    category_id_value := null;
    area_id_value := null;
  end loop;

  update public.extraction_runs
  set status = 'accepted'
  where id = extraction.id;

  update public.documents
  set status = 'accepted', processing_error_code = null
  where id = source_document.id;

  insert into public.activity_events (
    property_id,
    event_type,
    note,
    metadata,
    created_by
  ) values (
    extraction.property_id,
    'document_attached',
    'Imported inspection findings from ' || source_document.original_filename,
    jsonb_build_object(
      'document_id', source_document.id,
      'extraction_run_id', extraction.id,
      'imported_count', imported_count,
      'removed_count', removed_count,
      'preserved_section', preserve_section
    ),
    current_user_id
  );

  return jsonb_build_object(
    'document_id', source_document.id,
    'imported_count', imported_count,
    'removed_count', removed_count,
    'preserved_section', preserve_section
  );
end;
$$;

revoke all on function public.accept_inspection_extraction(uuid, boolean, text) from public, anon;
grant execute on function public.accept_inspection_extraction(uuid, boolean, text) to authenticated;

commit;
