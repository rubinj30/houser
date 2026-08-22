# POC Execution Status

## Milestone 1 - Runnable product shell

Status: complete

- Next.js 16 App Router and strict TypeScript
- Mobile-first responsive application shell
- Desktop sidebar and mobile bottom navigation
- Sample Home property context plus a placeholder rental-property state
- Dashboard derived from the real inspection fixture
- Searchable and filterable inspection work inbox
- Timeline grouped by review horizon
- Asset catalog derived from the inspection
- Local-only quick-add work dialog
- Screenshot/page-reference affordances
- Fixture unit tests, lint, type checking, and production build
- Visual verification at 390 by 844 and 1440 by 1000 viewports

The quick-add flow intentionally resets on reload. It proves the interaction before database persistence is introduced.

## Milestone 2 - Database and authentication

Status: complete and deployed.

- Remote Supabase project configured on the free plan
- SQL migrations for the core property, work, document, service, and activity model
- Row-level security enabled on every tenant-scoped table
- Eighteen transactional pgTAP assertions covering tenant isolation, atomic review history, service records, and recurrence
- Cookie-based email magic-link authentication through the Next.js server
- Server-only household allowlist for sign-in requests
- Idempotent first-owner bootstrap for the Sample Home property, areas, assets, and 51 inspection findings
- Database-backed status notes, activity history, and manual work capture
- Source page, document name, date, location, and fixture key retained on imported records
- Production deployment on Vercel with Supabase authentication and persistence

The JSON inspection fixture remains the reproducible import source and extraction test oracle. The application joins imported database records to the fixture while document storage and generated page captures are still pending.

Docker is installed locally but was not running during Milestone 1. Start Docker Desktop before `supabase start` or `supabase db reset` in this milestone.

## Milestone 3 - Manual maintenance loop

Status: in progress.

Implemented in the first slice:

- Work-item details and status transitions
- Complete-work workflow with completion date and notes
- Durable service records with vendor, actual cost, and warranty date
- Optional recurring maintenance that creates the next scheduled work item
- Service and status activity history

Remaining:

- Asset creation and editing
- General work-item editing beyond status and completion
- Asset condition updates tied to service

Document storage and inspection screenshot generation follow only after the manual loop is reliable.
