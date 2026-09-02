begin;

create index if not exists account_invitations_invited_by_idx
  on public.account_invitations(invited_by);
create index if not exists account_invitations_accepted_by_idx
  on public.account_invitations(accepted_by)
  where accepted_by is not null;
create index if not exists account_activity_events_created_by_idx
  on public.account_activity_events(created_by);

commit;
