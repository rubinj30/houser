begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-documents',
  'inspection-documents',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.work_items
  add column if not exists source_document_id uuid
    references public.documents(id) on delete set null;

create index if not exists work_items_source_document_id_idx
  on public.work_items(source_document_id);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  preview_storage_key text not null unique,
  pixel_width integer check (pixel_width is null or pixel_width > 0),
  pixel_height integer check (pixel_height is null or pixel_height > 0),
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);

create index if not exists document_pages_document_id_idx
  on public.document_pages(document_id);

alter table public.document_pages enable row level security;

drop policy if exists document_pages_select_members on public.document_pages;
create policy document_pages_select_members
on public.document_pages for select to authenticated
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_pages.document_id
      and private.can_access_property(document.property_id)
  )
);

drop policy if exists document_pages_insert_managers on public.document_pages;
create policy document_pages_insert_managers
on public.document_pages for insert to authenticated
with check (
  exists (
    select 1
    from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

drop policy if exists document_pages_update_managers on public.document_pages;
create policy document_pages_update_managers
on public.document_pages for update to authenticated
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
)
with check (
  exists (
    select 1
    from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

drop policy if exists document_pages_delete_managers on public.document_pages;
create policy document_pages_delete_managers
on public.document_pages for delete to authenticated
using (
  exists (
    select 1
    from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

grant select, insert, update, delete on public.document_pages to authenticated;

create or replace function private.storage_object_property_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

drop policy if exists inspection_documents_select_members on storage.objects;
create policy inspection_documents_select_members
on storage.objects for select to authenticated
using (
  bucket_id = 'inspection-documents'
  and private.can_access_property(private.storage_object_property_id(name))
);

drop policy if exists inspection_documents_insert_managers on storage.objects;
create policy inspection_documents_insert_managers
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.storage_object_property_id(name))
);

drop policy if exists inspection_documents_update_managers on storage.objects;
create policy inspection_documents_update_managers
on storage.objects for update to authenticated
using (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.storage_object_property_id(name))
)
with check (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.storage_object_property_id(name))
);

drop policy if exists inspection_documents_delete_managers on storage.objects;
create policy inspection_documents_delete_managers
on storage.objects for delete to authenticated
using (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.storage_object_property_id(name))
);

commit;
