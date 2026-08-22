begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '31000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'evidence-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'evidence-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.accounts (id, name)
values
  ('ca000000-0000-0000-0000-000000000001', 'Evidence Account A'),
  ('cb000000-0000-0000-0000-000000000002', 'Evidence Account B');

insert into public.account_memberships (account_id, user_id, role, status)
values
  ('ca000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('cb000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000002', 'owner', 'active');

insert into public.properties (id, account_id, display_name)
values
  ('ca100000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Evidence Property A'),
  ('cb200000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000002', 'Evidence Property B');

insert into public.documents (id, property_id, original_filename, mime_type, byte_size, storage_key)
values
  ('da100000-0000-0000-0000-000000000001', 'ca100000-0000-0000-0000-000000000001', 'a.pdf', 'application/pdf', 100, 'ca100000-0000-0000-0000-000000000001/a.pdf'),
  ('db200000-0000-0000-0000-000000000002', 'cb200000-0000-0000-0000-000000000002', 'b.pdf', 'application/pdf', 100, 'cb200000-0000-0000-0000-000000000002/b.pdf');

insert into public.document_pages (document_id, page_number, preview_storage_key)
values
  ('da100000-0000-0000-0000-000000000001', 1, 'ca100000-0000-0000-0000-000000000001/a/1.jpg'),
  ('db200000-0000-0000-0000-000000000002', 1, 'cb200000-0000-0000-0000-000000000002/b/1.jpg');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select preview_storage_key from public.document_pages order by preview_storage_key $$,
  array['ca100000-0000-0000-0000-000000000001/a/1.jpg'::text],
  'a member only sees page previews for their properties'
);

select lives_ok(
  $$ insert into public.document_pages (document_id, page_number, preview_storage_key) values ('da100000-0000-0000-0000-000000000001', 2, 'ca100000-0000-0000-0000-000000000001/a/2.jpg') $$,
  'an owner can add a page preview to their document'
);

select throws_ok(
  $$ insert into public.document_pages (document_id, page_number, preview_storage_key) values ('db200000-0000-0000-0000-000000000002', 2, 'cb200000-0000-0000-0000-000000000002/b/2.jpg') $$,
  '42501',
  null,
  'an owner cannot add a page preview to another account'
);

reset role;

select ok(
  private.storage_object_property_id('ca100000-0000-0000-0000-000000000001/doc/report.pdf') = 'ca100000-0000-0000-0000-000000000001'::uuid,
  'storage paths expose their property scope safely'
);

select is(
  private.storage_object_property_id('not-a-property/doc/report.pdf'),
  null,
  'invalid storage paths do not bypass authorization'
);

select * from finish();
rollback;
