begin;

-- Avoid the SQL-standard CURRENT_ROLE keyword when evaluating membership roles.
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

commit;
