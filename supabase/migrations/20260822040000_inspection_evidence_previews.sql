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

alter table public.documents
  add column if not exists storage_bucket text not null default 'documents'
    check (storage_bucket in ('documents', 'inspection-documents'));

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

-- Evidence created by the earlier preview workflow lives in this legacy bucket.
update public.documents document
set storage_bucket = 'inspection-documents'
where exists (
  select 1 from public.document_pages page where page.document_id = document.id
);

alter table public.document_pages enable row level security;

drop policy if exists document_pages_select_members on public.document_pages;
create policy document_pages_select_members
on public.document_pages for select to authenticated
using (
  exists (
    select 1 from public.documents document
    where document.id = document_pages.document_id
      and private.can_access_property(document.property_id)
  )
);

drop policy if exists document_pages_insert_managers on public.document_pages;
create policy document_pages_insert_managers
on public.document_pages for insert to authenticated
with check (
  exists (
    select 1 from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

drop policy if exists document_pages_update_managers on public.document_pages;
create policy document_pages_update_managers
on public.document_pages for update to authenticated
using (
  exists (
    select 1 from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
)
with check (
  exists (
    select 1 from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

drop policy if exists document_pages_delete_managers on public.document_pages;
create policy document_pages_delete_managers
on public.document_pages for delete to authenticated
using (
  exists (
    select 1 from public.documents document
    where document.id = document_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

grant select, insert, update, delete on public.document_pages to authenticated;

drop policy if exists inspection_documents_select_members on storage.objects;
create policy inspection_documents_select_members
on storage.objects for select to authenticated
using (
  bucket_id = 'inspection-documents'
  and private.can_access_property(private.property_id_from_storage_name(name))
);

drop policy if exists inspection_documents_insert_managers on storage.objects;
create policy inspection_documents_insert_managers
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
);

drop policy if exists inspection_documents_update_managers on storage.objects;
create policy inspection_documents_update_managers
on storage.objects for update to authenticated
using (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
)
with check (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
);

drop policy if exists inspection_documents_delete_managers on storage.objects;
create policy inspection_documents_delete_managers
on storage.objects for delete to authenticated
using (
  bucket_id = 'inspection-documents'
  and private.can_manage_property(private.property_id_from_storage_name(name))
);

commit;
