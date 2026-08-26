begin;

alter table public.profiles
  add column if not exists email text;

create unique index if not exists profiles_email_idx
  on public.profiles (lower(email))
  where email is not null;

insert into public.profiles (id, display_name, email)
select
  auth_user.id,
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
  ),
  lower(auth_user.email)
from auth.users auth_user
on conflict (id) do update
set email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

create table public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text not null check (role in ('owner', 'contributor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_invitations_account_id_idx on public.account_invitations(account_id, created_at desc);
create index account_invitations_email_idx on public.account_invitations(lower(email), status);
create index account_invitations_invited_by_idx on public.account_invitations(invited_by);
create index account_invitations_accepted_by_idx on public.account_invitations(accepted_by) where accepted_by is not null;
create unique index account_invitations_pending_email_idx
  on public.account_invitations(account_id, lower(email))
  where status = 'pending';

create trigger account_invitations_set_updated_at
before update on public.account_invitations
for each row execute function private.set_updated_at();

create table public.account_activity_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  event_type text not null check (event_type in ('member_invited', 'invitation_revoked', 'invitation_accepted', 'member_role_changed', 'member_removed')),
  subject_user_id uuid references auth.users(id) on delete set null,
  subject_email text,
  metadata jsonb not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index account_activity_events_account_id_idx on public.account_activity_events(account_id, created_at desc);
create index account_activity_events_subject_user_id_idx on public.account_activity_events(subject_user_id);
create index account_activity_events_created_by_idx on public.account_activity_events(created_by);

create or replace function private.can_edit_account_content(target_account_id uuid)
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
      and membership.role in ('owner', 'manager', 'contributor')
  );
$$;

create or replace function private.can_manage_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_account_content(private.account_id_for_property(target_property_id));
$$;

create or replace function private.shares_account_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_memberships mine
    join public.account_memberships theirs
      on theirs.account_id = mine.account_id
     and theirs.user_id = target_user_id
     and theirs.status = 'active'
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
  );
$$;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_household_members
on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.shares_account_with(id));

drop policy if exists memberships_insert_owners on public.account_memberships;
drop policy if exists memberships_update_owners on public.account_memberships;
drop policy if exists memberships_delete_owners on public.account_memberships;

alter table public.account_invitations enable row level security;
alter table public.account_activity_events enable row level security;

create policy account_invitations_select_owners
on public.account_invitations for select to authenticated
using (private.is_account_owner(account_id));

create policy account_activity_events_select_owners
on public.account_activity_events for select to authenticated
using (private.is_account_owner(account_id));

grant select on public.account_invitations to authenticated;
grant select on public.account_activity_events to authenticated;
revoke insert, update, delete on public.account_memberships from authenticated;

create or replace function public.create_account_invitation(
  target_account_id uuid,
  invite_email text,
  invite_role text default 'contributor'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_email text := lower(trim(invite_email));
  invitation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not private.is_account_owner(target_account_id) then
    raise exception 'Only household owners can invite members';
  end if;
  if invite_role not in ('owner', 'contributor', 'viewer') then
    raise exception 'Invalid household role';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if exists (
    select 1
    from public.account_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.account_id = target_account_id
      and membership.status = 'active'
      and lower(profile.email) = normalized_email
  ) then
    raise exception 'This person is already a household member';
  end if;

  update public.account_invitations invitation
  set status = 'expired'
  where invitation.account_id = target_account_id
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  insert into public.account_invitations (account_id, email, role, invited_by)
  values (target_account_id, normalized_email, invite_role, current_user_id)
  on conflict (account_id, (lower(email))) where status = 'pending'
  do update set
    role = excluded.role,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now()
  returning id into invitation_id;

  insert into public.account_activity_events (
    account_id, event_type, subject_email, metadata, created_by
  ) values (
    target_account_id, 'member_invited', normalized_email,
    jsonb_build_object('role', invite_role, 'invitation_id', invitation_id), current_user_id
  );

  return invitation_id;
end;
$$;

create or replace function public.accept_account_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(trim(coalesce((select auth.jwt() ->> 'email'), '')));
  accepted_count integer := 0;
  accepted_invitation record;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Authentication with a verified email is required';
  end if;

  insert into public.profiles (id, email)
  values (current_user_id, current_email)
  on conflict (id) do update set email = excluded.email;

  for accepted_invitation in
    update public.account_invitations invitation
    set status = 'accepted',
        accepted_by = current_user_id,
        accepted_at = now(),
        updated_at = now()
    where invitation.email = current_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
    returning invitation.account_id, invitation.role, invitation.id
  loop
    insert into public.account_memberships (account_id, user_id, role, status)
    values (accepted_invitation.account_id, current_user_id, accepted_invitation.role, 'active')
    on conflict (account_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now();

    insert into public.account_activity_events (
      account_id, event_type, subject_user_id, subject_email, metadata, created_by
    ) values (
      accepted_invitation.account_id, 'invitation_accepted', current_user_id, current_email,
      jsonb_build_object('role', accepted_invitation.role, 'invitation_id', accepted_invitation.id), current_user_id
    );
    accepted_count := accepted_count + 1;
  end loop;

  return accepted_count;
end;
$$;

create or replace function public.update_account_member_role(
  target_account_id uuid,
  target_user_id uuid,
  next_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  member_role text;
  owner_count integer;
  subject_email text;
begin
  if current_user_id is null or not private.is_account_owner(target_account_id) then
    raise exception 'Only household owners can change member roles';
  end if;
  if next_role not in ('owner', 'contributor', 'viewer') then
    raise exception 'Invalid household role';
  end if;

  select membership.role, profile.email
    into member_role, subject_email
  from public.account_memberships membership
  left join public.profiles profile on profile.id = membership.user_id
  where membership.account_id = target_account_id
    and membership.user_id = target_user_id
    and membership.status = 'active';

  if member_role is null then
    raise exception 'Household member not found';
  end if;
  if member_role = 'owner' and next_role <> 'owner' then
    select count(*) into owner_count
    from public.account_memberships membership
    where membership.account_id = target_account_id
      and membership.role = 'owner'
      and membership.status = 'active';
    if owner_count <= 1 then
      raise exception 'A household must keep at least one owner';
    end if;
  end if;

  update public.account_memberships
  set role = next_role, updated_at = now()
  where account_id = target_account_id and user_id = target_user_id;

  insert into public.account_activity_events (
    account_id, event_type, subject_user_id, subject_email, metadata, created_by
  ) values (
    target_account_id, 'member_role_changed', target_user_id, subject_email,
    jsonb_build_object('from', member_role, 'to', next_role), current_user_id
  );
end;
$$;

create or replace function public.remove_account_member(
  target_account_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  member_role text;
  owner_count integer;
  subject_email text;
begin
  if current_user_id is null or not private.is_account_owner(target_account_id) then
    raise exception 'Only household owners can remove members';
  end if;

  select membership.role, profile.email
    into member_role, subject_email
  from public.account_memberships membership
  left join public.profiles profile on profile.id = membership.user_id
  where membership.account_id = target_account_id
    and membership.user_id = target_user_id
    and membership.status = 'active';

  if member_role is null then
    raise exception 'Household member not found';
  end if;
  if member_role = 'owner' then
    select count(*) into owner_count
    from public.account_memberships membership
    where membership.account_id = target_account_id
      and membership.role = 'owner'
      and membership.status = 'active';
    if owner_count <= 1 then
      raise exception 'A household must keep at least one owner';
    end if;
  end if;

  update public.account_memberships
  set status = 'suspended', updated_at = now()
  where account_id = target_account_id and user_id = target_user_id;

  insert into public.account_activity_events (
    account_id, event_type, subject_user_id, subject_email, metadata, created_by
  ) values (
    target_account_id, 'member_removed', target_user_id, subject_email,
    jsonb_build_object('role', member_role), current_user_id
  );
end;
$$;

create or replace function public.revoke_account_invitation(
  target_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_account_id uuid;
  target_email text;
begin
  select invitation.account_id, invitation.email
    into target_account_id, target_email
  from public.account_invitations invitation
  where invitation.id = target_invitation_id
    and invitation.status = 'pending';

  if target_account_id is null then
    raise exception 'Pending invitation not found';
  end if;
  if current_user_id is null or not private.is_account_owner(target_account_id) then
    raise exception 'Only household owners can revoke invitations';
  end if;

  update public.account_invitations
  set status = 'revoked', updated_at = now()
  where id = target_invitation_id;

  insert into public.account_activity_events (
    account_id, event_type, subject_email, metadata, created_by
  ) values (
    target_account_id, 'invitation_revoked', target_email,
    jsonb_build_object('invitation_id', target_invitation_id), current_user_id
  );
end;
$$;

revoke all on function public.create_account_invitation(uuid, text, text) from public, anon;
revoke all on function public.accept_account_invitations() from public, anon;
revoke all on function public.update_account_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_account_member(uuid, uuid) from public, anon;
revoke all on function public.revoke_account_invitation(uuid) from public, anon;

grant execute on function public.create_account_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_account_invitations() to authenticated;
grant execute on function public.update_account_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_account_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_account_invitation(uuid) to authenticated;

commit;
