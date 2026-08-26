begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'member-a@example.test', '', now(), '{}', '{}', now(), now());

insert into public.profiles (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'owner-b@example.test');

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

select lives_ok(
  $$ select public.complete_work_item('a1100000-0000-0000-0000-000000000001', current_date, 'Trusted HVAC', 18950, 'Completed annual service', current_date + 365, 12) $$,
  'an owner can atomically complete work and record service'
);

select results_eq(
  $$ select status from public.work_items where id = 'a1100000-0000-0000-0000-000000000001' $$,
  array['completed'::text],
  'completion closes the original work item'
);

select results_eq(
  $$ select vendor_name || ':' || cost_minor::text || ':' || recurrence_months::text from public.service_records where work_item_id = 'a1100000-0000-0000-0000-000000000001' $$,
  array['Trusted HVAC:18950:12'::text],
  'completion preserves uniform vendor cost and recurrence data'
);

select results_eq(
  $$ select status || ':' || recurrence_months::text from public.work_items where origin_service_record_id is not null $$,
  array['scheduled:12'::text],
  'recurring completion creates the next scheduled work item'
);

select results_eq(
  $$ select event_type from public.activity_events where work_item_id = 'a1100000-0000-0000-0000-000000000001' order by created_at desc limit 1 $$,
  array['service_recorded'::text],
  'completion writes an auditable service event'
);

select lives_ok(
  $$ insert into public.documents (id, property_id, document_type, original_filename, mime_type, byte_size, storage_key, status, uploaded_by) values ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'inspection', 'inspection.pdf', 'application/pdf', 1234, 'a1000000-0000-0000-0000-000000000001/2026/a3000000-0000-0000-0000-000000000003/original.pdf', 'review_ready', '10000000-0000-0000-0000-000000000001') $$,
  'an owner can create a private inspection document'
);

insert into public.documents (id, property_id, document_type, original_filename, mime_type, byte_size, storage_key, status, uploaded_by)
values ('a3100000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'quote', 'quote.pdf', 'application/pdf', 5678, 'a1000000-0000-0000-0000-000000000001/2026/a3100000-0000-0000-0000-000000000003/original.pdf', 'review_ready', '10000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.link_document_to_work_item('a3000000-0000-0000-0000-000000000003', 'a1100000-0000-0000-0000-000000000001') $$,
  'an owner can attach a document to existing work'
);

select results_eq(
  $$ select count(*)::bigint from public.document_links where document_id = 'a3000000-0000-0000-0000-000000000003' $$,
  array[1::bigint],
  'the existing work attachment is retained'
);

select lives_ok(
  $$ select public.link_document_to_work_item('a3100000-0000-0000-0000-000000000003', null, 'Replace quoted HVAC system', 'HVAC and Ventilation', null, 'Review and schedule the quoted replacement.', 'replace', 900000, 'USD') $$,
  'an owner can generate new work from a quote'
);

select results_eq(
  $$ select source_type || ':' || estimated_cost_minor::text from public.work_items where source_key = 'document:a3100000-0000-0000-0000-000000000003' $$,
  array['quote:900000'::text],
  'generated work retains its quote source and estimated cost'
);

select lives_ok(
  $$ insert into public.extraction_runs (id, document_id, property_id, model, status, result, created_by) values ('a4000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'test-model', 'review_ready', '{"findings":[{"sourceSection":"10.4.1","title":"Clean fireplace flue","category":"Interior","area":"Living Room","location":"Fireplace","workType":"maintain","severity":"recommendation","priority":"important","recommendation":"Have the flue evaluated and cleaned.","sourcePages":[42],"sourceExcerpt":"Evaluate and clean before use."},{"sourceSection":"5.1.4","title":"Terminate loose wiring","category":"Electrical","area":"Kitchen","location":"Under kitchen sink","workType":"repair","severity":"safety_hazard","priority":"urgent","recommendation":"Use a proper junction box.","sourcePages":[17],"sourceExcerpt":"Loose wiring was observed."}]}', '10000000-0000-0000-0000-000000000001') $$,
  'an owner can stage a structured extraction'
);

select lives_ok(
  $$ insert into public.document_pages (document_id, page_number, preview_storage_key) values ('a3000000-0000-0000-0000-000000000003', 17, 'a1000000-0000-0000-0000-000000000001/2026/a3000000-0000-0000-0000-000000000003/pages/page-17.jpg') $$,
  'an owner can add a page preview to their inspection'
);

select results_eq(
  $$ select page_number from public.document_pages $$,
  array[17],
  'an owner can read page previews for their property'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('inspection-documents', 'a1000000-0000-0000-0000-000000000001/2026/a3000000-0000-0000-0000-000000000003/pages/page-17.jpg', '10000000-0000-0000-0000-000000000001') $$,
  'an owner can write an evidence preview within their property prefix'
);

select results_eq(
  $$ select count(*)::bigint from public.extraction_runs $$,
  array[1::bigint],
  'an owner can read their extraction run'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', 'a1000000-0000-0000-0000-000000000001/2026/a3000000-0000-0000-0000-000000000003/original.pdf', '10000000-0000-0000-0000-000000000001') $$,
  'an owner can write a PDF object within their property prefix'
);

insert into public.work_items (id, property_id, source_key, title, source_type, status, created_by)
values
  ('a5000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', '10.4.1', 'Preserved fireplace', 'inspection', 'planned', '10000000-0000-0000-0000-000000000001'),
  ('a6000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'old.1', 'Stale inspection finding', 'inspection', 'inbox', '10000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.accept_inspection_extraction('a4000000-0000-0000-0000-000000000004', true, '10.4.1') $$,
  'an owner can atomically accept an inspection extraction'
);

select results_eq(
  $$ select status from public.work_items where id = 'a5000000-0000-0000-0000-000000000005' $$,
  array['planned'::text],
  'the explicitly preserved finding keeps its review status'
);

select results_eq(
  $$ select count(*)::bigint from public.work_items where id = 'a6000000-0000-0000-0000-000000000006' $$,
  array[0::bigint],
  'replacement removes stale inspection findings'
);

select results_eq(
  $$ select status from public.work_items where source_section = '5.1.4' $$,
  array['inbox'::text],
  'newly extracted findings require owner review'
);

select results_eq(
  $$ select count(*)::bigint from public.work_items where id = 'a1100000-0000-0000-0000-000000000001' $$,
  array[1::bigint],
  'replacement does not remove manual work'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select results_eq(
  $$ select display_name from public.properties order by display_name $$,
  array['Property B'::text],
  'the second account is isolated from the first'
);

select results_eq(
  $$ select count(*)::bigint from public.extraction_runs $$,
  array[0::bigint],
  'another account cannot read inspection extraction results'
);

select results_eq(
  $$ select count(*)::bigint from public.document_links $$,
  array[0::bigint],
  'another account cannot read document links'
);

select throws_ok(
  $$ select public.link_document_to_work_item('a3000000-0000-0000-0000-000000000003', 'a1100000-0000-0000-0000-000000000001') $$,
  'P0001',
  null,
  'another account cannot attach the first account document'
);

select results_eq(
  $$ select count(*)::bigint from storage.objects where bucket_id = 'documents' $$,
  array[0::bigint],
  'another account cannot read private inspection objects'
);

select results_eq(
  $$ select count(*)::bigint from storage.objects where bucket_id = 'inspection-documents' $$,
  array[0::bigint],
  'another account cannot read private evidence previews'
);

select throws_ok(
  $$ select public.accept_inspection_extraction('a4000000-0000-0000-0000-000000000004', false, null) $$,
  'P0001',
  null,
  'another account cannot import the first account inspection'
);

select throws_ok(
  $$ select public.record_work_item_review('a1100000-0000-0000-0000-000000000001', 'completed', 'Forged completion') $$,
  'P0001',
  null,
  'another account cannot review the first account work item'
);

select throws_ok(
  $$ select public.complete_work_item('a1100000-0000-0000-0000-000000000001', current_date, null, null, 'Forged service', null, null) $$,
  'P0001',
  null,
  'another account cannot create a service record for the first account'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner-a@example.test"}', true);

select lives_ok(
  $$ select public.create_account_invitation('a0000000-0000-0000-0000-000000000001', 'member-a@example.test', 'contributor') $$,
  'an owner can invite a household member'
);

select results_eq(
  $$ select email from public.account_invitations where account_id = 'a0000000-0000-0000-0000-000000000001' and status = 'pending' $$,
  array['member-a@example.test'::text],
  'the owner can read the pending household invitation'
);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated","email":"member-a@example.test"}', true);

select results_eq(
  $$ select public.accept_account_invitations() $$,
  array[1],
  'an invited user can accept their matching email invitation'
);

select results_eq(
  $$ select role from public.account_memberships where account_id = 'a0000000-0000-0000-0000-000000000001' and user_id = '30000000-0000-0000-0000-000000000003' $$,
  array['contributor'::text],
  'invitation acceptance creates the requested membership role'
);

select results_eq(
  $$ select display_name from public.properties order by display_name $$,
  array['Property A'::text],
  'a household member can read every property in the account'
);

select lives_ok(
  $$ insert into public.work_items (property_id, title, created_by) values ('a1000000-0000-0000-0000-000000000001', 'Member-created work', '30000000-0000-0000-0000-000000000003') $$,
  'a contributor can create work in a household property'
);

select throws_ok(
  $$ select public.create_account_invitation('a0000000-0000-0000-0000-000000000001', 'other@example.test', 'viewer') $$,
  'P0001',
  null,
  'a contributor cannot invite another member'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner-a@example.test"}', true);

select lives_ok(
  $$ select public.update_account_member_role('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'viewer') $$,
  'an owner can change a household member role'
);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated","email":"member-a@example.test"}', true);

select throws_ok(
  $$ insert into public.work_items (property_id, title, created_by) values ('a1000000-0000-0000-0000-000000000001', 'Viewer-created work', '30000000-0000-0000-0000-000000000003') $$,
  '42501',
  null,
  'a viewer cannot create work'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner-a@example.test"}', true);

select lives_ok(
  $$ select public.remove_account_member('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003') $$,
  'an owner can remove a household member'
);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated","email":"member-a@example.test"}', true);

select results_eq(
  $$ select count(*)::bigint from public.properties $$,
  array[0::bigint],
  'a removed household member immediately loses property access'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"owner-a@example.test"}', true);

select throws_ok(
  $$ select public.remove_account_member('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001') $$,
  'P0001',
  null,
  'the final household owner cannot remove themselves'
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
