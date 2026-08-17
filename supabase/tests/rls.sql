begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.accounts (id, name)
values
  ('a0000000-0000-0000-0000-000000000001', 'Account A'),
  ('b0000000-0000-0000-0000-000000000002', 'Account B');

insert into public.account_memberships (account_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner', 'active');

insert into public.properties (id, account_id, display_name)
values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Property A'),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Property B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select display_name from public.properties order by display_name $$,
  array['Property A'::text],
  'a member only sees properties in their account'
);

select lives_ok(
  $$ insert into public.work_items (id, property_id, title, created_by) values ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Allowed work', '10000000-0000-0000-0000-000000000001') $$,
  'an owner can create work in their property'
);

select throws_ok(
  $$ insert into public.work_items (property_id, title, created_by) values ('b2000000-0000-0000-0000-000000000002', 'Blocked work', '10000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'a user cannot create work in another account'
);

select lives_ok(
  $$ insert into public.activity_events (property_id, event_type, note, created_by) values ('a1000000-0000-0000-0000-000000000001', 'note', 'Allowed note', '10000000-0000-0000-0000-000000000001') $$,
  'a member can add their own activity event'
);

select throws_ok(
  $$ insert into public.activity_events (property_id, event_type, note, created_by) values ('a1000000-0000-0000-0000-000000000001', 'note', 'Forged note', '20000000-0000-0000-0000-000000000002') $$,
  '42501',
  null,
  'a member cannot forge another author'
);

select results_eq(
  $$ select count(*)::bigint from public.categories where account_id is null $$,
  array[14::bigint],
  'authenticated users can read system categories'
);

select lives_ok(
  $$ select public.record_work_item_review('a1100000-0000-0000-0000-000000000001', 'planned', 'Called electrician') $$,
  'an owner can atomically review their work item'
);

select results_eq(
  $$ select status from public.work_items where id = 'a1100000-0000-0000-0000-000000000001' $$,
  array['planned'::text],
  'the review function updates work status'
);

select results_eq(
  $$ select note from public.activity_events where work_item_id = 'a1100000-0000-0000-0000-000000000001' order by created_at desc limit 1 $$,
  array['Called electrician'::text],
  'the review function writes matching activity history'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select results_eq(
  $$ select display_name from public.properties order by display_name $$,
  array['Property B'::text],
  'the second account is isolated from the first'
);

select throws_ok(
  $$ select public.record_work_item_review('a1100000-0000-0000-0000-000000000001', 'completed', 'Forged completion') $$,
  'P0001',
  null,
  'another account cannot review the first account work item'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.properties $$,
  '42501',
  null,
  'anonymous requests cannot read property data'
);

select * from finish();
rollback;
