create table public.work_item_groups (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null default 'Related work' check (length(trim(label)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_item_groups_property_id_idx on public.work_item_groups(property_id);

create trigger work_item_groups_set_updated_at
before update on public.work_item_groups
for each row execute function private.set_updated_at();

create table public.work_item_group_members (
  group_id uuid not null references public.work_item_groups(id) on delete cascade,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (group_id, work_item_id),
  unique (work_item_id)
);

create or replace function private.enforce_work_item_group_property()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_property_id uuid;
  item_property_id uuid;
begin
  select property_id into group_property_id
  from public.work_item_groups
  where id = new.group_id;

  select property_id into item_property_id
  from public.work_items
  where id = new.work_item_id;

  if group_property_id is distinct from item_property_id then
    raise exception 'Related work items must belong to the same property';
  end if;

  return new;
end;
$$;

create trigger work_item_group_members_same_property
before insert or update on public.work_item_group_members
for each row execute function private.enforce_work_item_group_property();

alter table public.work_item_groups enable row level security;
alter table public.work_item_group_members enable row level security;

create policy work_item_groups_select_members
on public.work_item_groups for select to authenticated
using (private.can_access_property(property_id));

create policy work_item_groups_insert_managers
on public.work_item_groups for insert to authenticated
with check (private.can_manage_property(property_id) and created_by = (select auth.uid()));

create policy work_item_groups_update_managers
on public.work_item_groups for update to authenticated
using (private.can_manage_property(property_id))
with check (private.can_manage_property(property_id));

create policy work_item_groups_delete_managers
on public.work_item_groups for delete to authenticated
using (private.can_manage_property(property_id));

create policy work_item_group_members_select_members
on public.work_item_group_members for select to authenticated
using (
  exists (
    select 1
    from public.work_item_groups related_group
    where related_group.id = group_id
      and private.can_access_property(related_group.property_id)
  )
);

create policy work_item_group_members_insert_managers
on public.work_item_group_members for insert to authenticated
with check (
  added_by = (select auth.uid())
  and exists (
    select 1
    from public.work_item_groups related_group
    join public.work_items work_item on work_item.id = work_item_id
    where related_group.id = group_id
      and work_item.property_id = related_group.property_id
      and private.can_manage_property(related_group.property_id)
  )
);

create policy work_item_group_members_update_managers
on public.work_item_group_members for update to authenticated
using (
  exists (
    select 1
    from public.work_item_groups related_group
    where related_group.id = group_id
      and private.can_manage_property(related_group.property_id)
  )
)
with check (
  exists (
    select 1
    from public.work_item_groups related_group
    join public.work_items work_item on work_item.id = work_item_id
    where related_group.id = group_id
      and work_item.property_id = related_group.property_id
      and private.can_manage_property(related_group.property_id)
  )
);

create policy work_item_group_members_delete_managers
on public.work_item_group_members for delete to authenticated
using (
  exists (
    select 1
    from public.work_item_groups related_group
    where related_group.id = group_id
      and private.can_manage_property(related_group.property_id)
  )
);

grant select, insert, update, delete on public.work_item_groups to authenticated;
grant select, insert, update, delete on public.work_item_group_members to authenticated;
revoke all on public.work_item_groups from anon;
revoke all on public.work_item_group_members from anon;

create or replace function public.get_related_work_group(target_work_item_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  target_property_id uuid;
  related_group public.work_item_groups%rowtype;
  related_items jsonb;
begin
  select property_id into target_property_id
  from public.work_items
  where id = target_work_item_id;

  if target_property_id is null or not private.can_access_property(target_property_id) then
    raise exception 'Work item not found';
  end if;

  select related_group_row.* into related_group
  from public.work_item_groups related_group_row
  join public.work_item_group_members member on member.group_id = related_group_row.id
  where member.work_item_id = target_work_item_id;

  if related_group.id is null then
    return jsonb_build_object('group', null, 'relatedItems', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', work_item.id,
        'title', work_item.title,
        'sourceSection', work_item.source_section,
        'category', work_item.source_category,
        'status', work_item.status,
        'priority', work_item.priority
      ) order by work_item.title
    ),
    '[]'::jsonb
  ) into related_items
  from public.work_item_group_members member
  join public.work_items work_item on work_item.id = member.work_item_id
  where member.group_id = related_group.id
    and member.work_item_id <> target_work_item_id;

  return jsonb_build_object(
    'group', jsonb_build_object('id', related_group.id, 'label', related_group.label),
    'relatedItems', related_items
  );
end;
$$;

create or replace function public.set_related_work_group(
  target_work_item_id uuid,
  linked_work_item_ids uuid[],
  group_label text default 'Related work'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_property_id uuid;
  candidate_ids uuid[];
  candidate_count integer;
  visible_count integer;
  primary_group_id uuid;
  existing_group_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select property_id into target_property_id
  from public.work_items
  where id = target_work_item_id;

  if target_property_id is null or not private.can_manage_property(target_property_id) then
    raise exception 'Work item not found';
  end if;

  select array_agg(distinct candidate_id)
  into candidate_ids
  from unnest(array_append(coalesce(linked_work_item_ids, '{}'::uuid[]), target_work_item_id)) candidate_id
  where candidate_id is not null;

  candidate_count := coalesce(cardinality(candidate_ids), 0);
  if candidate_count < 2 then
    raise exception 'Choose at least one related work item';
  end if;

  select count(*) into visible_count
  from public.work_items
  where id = any(candidate_ids)
    and property_id = target_property_id;

  if visible_count <> candidate_count then
    raise exception 'Related work items must belong to the same property';
  end if;

  select related_group.id into primary_group_id
  from public.work_item_groups related_group
  join public.work_item_group_members member on member.group_id = related_group.id
  where member.work_item_id = any(candidate_ids)
  order by related_group.created_at, related_group.id
  limit 1;

  if primary_group_id is null then
    insert into public.work_item_groups (property_id, label, created_by)
    values (
      target_property_id,
      coalesce(nullif(trim(group_label), ''), 'Related work'),
      current_user_id
    )
    returning id into primary_group_id;
  else
    update public.work_item_groups
    set label = coalesce(nullif(trim(group_label), ''), label)
    where id = primary_group_id;

    for existing_group_id in
      select distinct member.group_id
      from public.work_item_group_members member
      where member.work_item_id = any(candidate_ids)
        and member.group_id <> primary_group_id
    loop
      update public.work_item_group_members
      set group_id = primary_group_id
      where group_id = existing_group_id;

      delete from public.work_item_groups where id = existing_group_id;
    end loop;
  end if;

  insert into public.work_item_group_members (group_id, work_item_id, added_by)
  select primary_group_id, candidate_id, current_user_id
  from unnest(candidate_ids) candidate_id
  on conflict (work_item_id) do update
  set group_id = excluded.group_id;

  return public.get_related_work_group(target_work_item_id);
end;
$$;

revoke all on function public.get_related_work_group(uuid) from public, anon;
grant execute on function public.get_related_work_group(uuid) to authenticated;
revoke all on function public.set_related_work_group(uuid, uuid[], text) from public, anon;
grant execute on function public.set_related_work_group(uuid, uuid[], text) to authenticated;
