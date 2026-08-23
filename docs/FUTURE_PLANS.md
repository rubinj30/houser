# Houser Future Plans

This document tracks intentional follow-up work that is outside the current POC slice. It complements `PRODUCT_OUTLINE.md`, `TECH_SPEC.md`, and `POC_EXECUTION.md`; those documents remain the product and architecture baselines.

## Next practical improvements

- Add complete work-item editing, including a user-entered target date or honest date range.
- Add asset creation/editing and connect repairs, replacements, condition changes, warranties, and service history to assets.
- Add a Documents view for inspection reports, quotes, invoices, warranties, manuals, and extraction-review status.
- Let owners link a quote to proposed work and link an invoice to completed work or a service record.
- Finish photo and screenshot uploads for work items, with before/after labels and private storage.
- Add the rental property setup and a reliable property-wide switcher.
- Add reminder preferences and in-app/email reminders for due and overdue work.
- Add search and filters across documents, vendors, service history, assets, and dates.
- Add data export, backup, restore, retention, and account-deletion procedures.
- Complete mobile accessibility, keyboard navigation, empty/error states, observability, and background-job retry handling.

## Calendar integrations

### Implemented POC: individual calendar handoff

Scheduled work can open a prefilled Google Calendar event or download a portable `.ics` file. This is deliberately user-confirmed and one-way: Houser does not store calendar credentials, and later edits in Houser do not update an event that was already added.

### Future option 1: connected Google Calendar

- Add Google OAuth from Settings.
- Default to creating a dedicated calendar such as **Houser – Sample Home**, with an option to use another writable calendar.
- Let the owner choose automatic sync or confirmation per event.
- Store a durable mapping between each Houser occurrence and its Google event ID to prevent duplicates.
- Treat Houser as the source of truth initially; push schedule changes and cancellations to Google.
- Encrypt refresh tokens and use the narrowest practical Google Calendar scopes.
- Show sync state, last successful sync, retry controls, and a direct link to the Google event.
- Consider two-way changes only after one-way synchronization is reliable and conflict rules are explicit.

### Future option 2: subscribable calendar feed

- Provide a revocable, private iCalendar subscription URL per property or user.
- Include upcoming scheduled work and recurring maintenance occurrences.
- Make the feed read-only and explain that Google, Apple, and Outlook control refresh timing.
- Allow token rotation and immediate revocation if a feed URL is exposed.
- Let users choose which statuses, properties, and time horizon appear in the feed.

## Document intelligence

- Expand the current OpenAI extraction review into editable, field-level approval.
- Add duplicate detection across inspection findings, manual work, quotes, invoices, and assets.
- Compare multiple quotes by normalized scope, exclusions, warranties, equipment, and total cost.
- Convert an approved quote into linked work without losing the original proposal.
- Convert an approved invoice into a service record, vendor history, warranty data, and next-service recommendation.
- Add support for receipts, work orders, warranties, permits, manuals, and common image formats.
- Add an email-to-property inbox for forwarding service documents.

## Stable personal version

- Household invitations and property-level roles: owner, manager, contributor, and read-only.
- Vendor directory with contact information, quotes, invoices, and service history.
- Saved views, bulk edit/archive, annual maintenance planning, and actual-versus-estimated costs.
- Reliable recurring-maintenance rules based on the actual completion date.
- Offline-tolerant mobile drafts for notes and photos.
- Rental-oriented yearly expense reporting with an explicit non-tax-advice disclaimer.

## Longer-term possibilities

- Tenant issue submission with owner approval and privacy boundaries.
- Vendor access to assigned work, scheduling, estimates, and completion evidence.
- Natural-language questions across the property record.
- Condition trends from repeated inspections and photos.
- Cost forecasting, capital planning, and optional smart-home or utility integrations.
- Multi-property portfolio and commercial account support.
