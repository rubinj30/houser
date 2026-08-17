begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  default_currency text not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_memberships (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'contributor', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

create index account_memberships_user_id_idx on public.account_memberships(user_id);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  property_type text not null default 'residence',
  address_line1 text,
  city text,
  region text,
  postal_code text,
  timezone text not null default 'America/New_York',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_account_id_idx on public.properties(account_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  icon_key text,
  color_key text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_scope_slug_idx on public.categories(coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index categories_account_id_idx on public.categories(account_id);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  parent_area_id uuid references public.areas(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  area_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, name)
);

create index areas_property_id_idx on public.areas(property_id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  asset_type text not null default 'other',
  manufacturer text,
  model text,
  serial_number text,
  installed_on date,
  installed_on_precision text check (installed_on_precision is null or installed_on_precision in ('day', 'month', 'year', 'approximate', 'unknown')),
  expected_life_months integer check (expected_life_months is null or expected_life_months > 0),
  expected_life_source text,
  condition text not null default 'unknown' check (condition in ('unknown', 'good', 'fair', 'poor', 'failed')),
  status text not null default 'active' check (status in ('active', 'removed', 'replaced')),
  replacement_asset_id uuid references public.assets(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_property_id_idx on public.assets(property_id);
create index assets_category_id_idx on public.assets(category_id);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  source_key text,
  title text not null check (length(trim(title)) between 1 and 240),
  description text,
  work_type text not null default 'other' check (work_type in ('inspect', 'maintain', 'repair', 'replace', 'improve', 'monitor', 'other')),
  status text not null default 'inbox' check (status in ('inbox', 'planned', 'scheduled', 'in_progress', 'completed', 'deferred', 'rejected', 'canceled')),
  priority text not null default 'routine' check (priority in ('emergency', 'urgent', 'important', 'routine', 'informational')),
  safety_flags text[] not null default '{}',
  target_start_on date,
  target_end_on date,
  target_basis text,
  manual_target_override boolean not null default false,
  estimated_cost_minor bigint check (estimated_cost_minor is null or estimated_cost_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  source_type text not null default 'manual',
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_end_on is null or target_start_on is null or target_end_on >= target_start_on),
  unique (property_id, source_key)
);

create index work_items_property_id_idx on public.work_items(property_id);
create index work_items_status_idx on public.work_items(property_id, status);
create index work_items_asset_id_idx on public.work_items(asset_id);

create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  work_item_id uuid references public.work_items(id) on delete set null,
  service_type text not null default 'other' check (service_type in ('inspection', 'maintenance', 'repair', 'replacement', 'installation', 'other')),
  performed_on date not null,
  description text not null check (length(trim(description)) > 0),
  vendor_name text,
  cost_minor bigint check (cost_minor is null or cost_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  warranty_ends_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index service_records_property_id_idx on public.service_records(property_id);
create index service_records_work_item_id_idx on public.service_records(work_item_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  document_type text not null default 'other' check (document_type in ('inspection', 'invoice', 'work_order', 'receipt', 'warranty', 'manual', 'permit', 'photo', 'other')),
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  storage_key text not null unique,
  sha256 text,
  document_date date,
  status text not null default 'uploaded' check (status in ('uploaded', 'queued', 'processing', 'review_ready', 'accepted', 'failed')),
  processing_error_code text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_property_id_idx on public.documents(property_id);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  work_item_id uuid references public.work_items(id) on delete cascade,
  event_type text not null check (event_type in ('status_change', 'note', 'created', 'edited', 'document_attached', 'service_recorded')),
  status_from text,
  status_to text,
  note text,
  metadata jsonb not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index activity_events_property_id_idx on public.activity_events(property_id);
create index activity_events_work_item_id_idx on public.activity_events(work_item_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_set_updated_at before update on public.accounts for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.account_memberships for each row execute function private.set_updated_at();
create trigger properties_set_updated_at before update on public.properties for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function private.set_updated_at();
create trigger areas_set_updated_at before update on public.areas for each row execute function private.set_updated_at();
create trigger assets_set_updated_at before update on public.assets for each row execute function private.set_updated_at();
create trigger work_items_set_updated_at before update on public.work_items for each row execute function private.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function private.set_updated_at();

create or replace function private.is_account_member(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_memberships membership
    where membership.account_id = target_account_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.can_manage_account(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_memberships membership
    where membership.account_id = target_account_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'manager')
  );
$$;

create or replace function private.is_account_owner(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_memberships membership
    where membership.account_id = target_account_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = 'owner'
  );
$$;

create or replace function private.account_id_for_property(target_property_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select property.account_id
  from public.properties property
  where property.id = target_property_id;
$$;

create or replace function private.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_account_member(private.account_id_for_property(target_property_id));
$$;

create or replace function private.can_manage_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_account(private.account_id_for_property(target_property_id));
$$;

create or replace function public.bootstrap_account(account_name text default 'Houser')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_account_id uuid;
  created_account_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select membership.account_id into existing_account_id
  from public.account_memberships membership
  where membership.user_id = current_user_id
    and membership.status = 'active'
  order by membership.created_at
  limit 1;

  if existing_account_id is not null then
    return existing_account_id;
  end if;

  insert into public.accounts (name)
  values (coalesce(nullif(trim(account_name), ''), 'Houser'))
  returning id into created_account_id;

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  insert into public.account_memberships (account_id, user_id, role, status)
  values (created_account_id, current_user_id, 'owner', 'active');

  return created_account_id;
end;
$$;

revoke all on function public.bootstrap_account(text) from public, anon;
grant execute on function public.bootstrap_account(text) to authenticated;

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.account_memberships enable row level security;
alter table public.properties enable row level security;
alter table public.categories enable row level security;
alter table public.areas enable row level security;
alter table public.assets enable row level security;
alter table public.work_items enable row level security;
alter table public.service_records enable row level security;
alter table public.documents enable row level security;
alter table public.activity_events enable row level security;

create policy accounts_select_members on public.accounts for select to authenticated using (private.is_account_member(id));
create policy accounts_update_managers on public.accounts for update to authenticated using (private.can_manage_account(id)) with check (private.can_manage_account(id));

create policy profiles_select_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy memberships_select_members on public.account_memberships for select to authenticated using (private.is_account_member(account_id));
create policy memberships_insert_owners on public.account_memberships for insert to authenticated with check (private.is_account_owner(account_id));
create policy memberships_update_owners on public.account_memberships for update to authenticated using (private.is_account_owner(account_id)) with check (private.is_account_owner(account_id));
create policy memberships_delete_owners on public.account_memberships for delete to authenticated using (private.is_account_owner(account_id));

create policy properties_select_members on public.properties for select to authenticated using (private.is_account_member(account_id));
create policy properties_insert_managers on public.properties for insert to authenticated with check (private.can_manage_account(account_id));
create policy properties_update_managers on public.properties for update to authenticated using (private.can_manage_account(account_id)) with check (private.can_manage_account(account_id));
create policy properties_delete_managers on public.properties for delete to authenticated using (private.can_manage_account(account_id));

create policy categories_select_available on public.categories for select to authenticated using (account_id is null or private.is_account_member(account_id));
create policy categories_insert_managers on public.categories for insert to authenticated with check (account_id is not null and private.can_manage_account(account_id));
create policy categories_update_managers on public.categories for update to authenticated using (account_id is not null and private.can_manage_account(account_id)) with check (account_id is not null and private.can_manage_account(account_id));
create policy categories_delete_managers on public.categories for delete to authenticated using (account_id is not null and private.can_manage_account(account_id));

create policy areas_select_members on public.areas for select to authenticated using (private.can_access_property(property_id));
create policy areas_insert_managers on public.areas for insert to authenticated with check (private.can_manage_property(property_id));
create policy areas_update_managers on public.areas for update to authenticated using (private.can_manage_property(property_id)) with check (private.can_manage_property(property_id));
create policy areas_delete_managers on public.areas for delete to authenticated using (private.can_manage_property(property_id));

create policy assets_select_members on public.assets for select to authenticated using (private.can_access_property(property_id));
create policy assets_insert_managers on public.assets for insert to authenticated with check (private.can_manage_property(property_id));
create policy assets_update_managers on public.assets for update to authenticated using (private.can_manage_property(property_id)) with check (private.can_manage_property(property_id));
create policy assets_delete_managers on public.assets for delete to authenticated using (private.can_manage_property(property_id));

create policy work_items_select_members on public.work_items for select to authenticated using (private.can_access_property(property_id));
create policy work_items_insert_managers on public.work_items for insert to authenticated with check (private.can_manage_property(property_id));
create policy work_items_update_managers on public.work_items for update to authenticated using (private.can_manage_property(property_id)) with check (private.can_manage_property(property_id));
create policy work_items_delete_managers on public.work_items for delete to authenticated using (private.can_manage_property(property_id));

create policy service_records_select_members on public.service_records for select to authenticated using (private.can_access_property(property_id));
create policy service_records_insert_managers on public.service_records for insert to authenticated with check (private.can_manage_property(property_id));

create policy documents_select_members on public.documents for select to authenticated using (private.can_access_property(property_id));
create policy documents_insert_managers on public.documents for insert to authenticated with check (private.can_manage_property(property_id));
create policy documents_update_managers on public.documents for update to authenticated using (private.can_manage_property(property_id)) with check (private.can_manage_property(property_id));
create policy documents_delete_managers on public.documents for delete to authenticated using (private.can_manage_property(property_id));

create policy activity_events_select_members on public.activity_events for select to authenticated using (private.can_access_property(property_id));
create policy activity_events_insert_members on public.activity_events for insert to authenticated with check (private.can_access_property(property_id) and created_by = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, update on public.accounts to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.account_memberships to authenticated;
grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.areas to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.work_items to authenticated;
grant select, insert on public.service_records to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert on public.activity_events to authenticated;

insert into public.categories (name, slug, icon_key, is_system)
values
  ('Roof and Drainage', 'roof-and-drainage', 'roof', true),
  ('HVAC and Ventilation', 'hvac-and-ventilation', 'flame', true),
  ('Plumbing and Water', 'plumbing-and-water', 'wrench', true),
  ('Electrical', 'electrical', 'plug', true),
  ('Structure and Foundation', 'structure-and-foundation', 'layers', true),
  ('Exterior', 'exterior', 'house', true),
  ('Interior and Finishes', 'interior-and-finishes', 'paintbrush', true),
  ('Appliances', 'appliances', 'refrigerator', true),
  ('Safety and Security', 'safety-and-security', 'shield', true),
  ('Pool and Spa', 'pool-and-spa', 'waves', true),
  ('Landscaping and Grounds', 'landscaping-and-grounds', 'trees', true),
  ('Pest and Moisture Control', 'pest-and-moisture-control', 'bug', true),
  ('Utilities and Resilience', 'utilities-and-resilience', 'battery', true),
  ('General', 'general', 'wrench', true);

commit;
