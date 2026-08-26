begin;

create table public.document_text_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  content text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, page_number)
);

create index document_text_pages_document_id_idx
  on public.document_text_pages(document_id, page_number);

create index document_text_pages_search_vector_idx
  on public.document_text_pages using gin(search_vector);

create trigger document_text_pages_set_updated_at
before update on public.document_text_pages
for each row execute function private.set_updated_at();

alter table public.document_text_pages enable row level security;

create policy document_text_pages_select_members
on public.document_text_pages for select to authenticated
using (
  exists (
    select 1 from public.documents document
    where document.id = document_text_pages.document_id
      and private.can_access_property(document.property_id)
  )
);

create policy document_text_pages_insert_managers
on public.document_text_pages for insert to authenticated
with check (
  exists (
    select 1 from public.documents document
    where document.id = document_text_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

create policy document_text_pages_update_managers
on public.document_text_pages for update to authenticated
using (
  exists (
    select 1 from public.documents document
    where document.id = document_text_pages.document_id
      and private.can_manage_property(document.property_id)
  )
)
with check (
  exists (
    select 1 from public.documents document
    where document.id = document_text_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

create policy document_text_pages_delete_managers
on public.document_text_pages for delete to authenticated
using (
  exists (
    select 1 from public.documents document
    where document.id = document_text_pages.document_id
      and private.can_manage_property(document.property_id)
  )
);

grant select, insert, update, delete on public.document_text_pages to authenticated;

commit;
