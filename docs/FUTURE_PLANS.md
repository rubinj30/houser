# Houser Future Plans

This document tracks intentional follow-up work that is outside the current POC slice. It complements `PRODUCT_OUTLINE.md`, `TECH_SPEC.md`, and `POC_EXECUTION.md`; those documents remain the product and architecture baselines.

## Next practical improvements

- Add complete work-item planning and editing: status, target date or honest date range, recurrence, assignee, estimated cost, and notes. This is the recommended next implementation because it makes the timeline and existing calendar handoff genuinely useful.
- Add asset creation/editing and connect repairs, replacements, condition changes, warranties, and service history to assets.
- Add a Documents view for inspection reports, quotes, invoices, warranties, manuals, and extraction-review status.
- Let owners link a quote to proposed work and link an invoice to completed work or a service record.
- Finish photo and screenshot uploads for work items, with before/after labels and private storage.
- Add the rental property setup and a reliable property-wide switcher.
- Add reminder preferences and in-app/email reminders for due and overdue work.
- Add search and filters across documents, vendors, service history, assets, and dates.
- Add data export, backup, restore, retention, and account-deletion procedures.
- Complete mobile accessibility, keyboard navigation, empty/error states, observability, and background-job retry handling.

## Potential Features to Review

Competitive research was reviewed on August 22, 2026 from the products' published materials. This is a positioning and feature comparison, not a hands-on quality assessment.

### Potential competitors

| Product | Relevant positioning | Implication for Houser |
| --- | --- | --- |
| [HomeZada](https://www.homezada.com/) | Broad home-management suite spanning inventory, maintenance, projects, finances, documents, AI guidance, and multiple properties. | The most direct broad-suite competitor. Houser should stay more focused on turning source evidence into trustworthy work and history instead of racing to match every module. |
| [Homer](https://homer.co/) | Digital home binder for inventory, projects, tasks, expenses, documents, contacts, and a chronological home timeline. | Validates the durable home-record concept. Houser can differentiate with source-page evidence, explicit owner review, and stronger document-to-work workflows. |
| [Latch](https://www.latchsolutions.com/) | AI-first "virtual property manager" combining photographed inventory, custom maintenance, providers, spending, and contextual guidance. | Strong signal for low-friction asset capture and property-aware assistance. A generic chat interface should wait until Houser's underlying records are complete and reliable. |
| [Haven](https://havenhome.app/) | Maintenance and inventory product with persistent reminders, warranties, exact replacement parts, cost trends, and photo-based item detection. | Exact parts, consumables, and warranty deadlines are practical extensions of Houser's asset records and have clearer value than broad AI chat. |
| [Dwellin](https://www.dwellin.com/app/how-it-works) | Digital home profile for maintenance, appliances, documents, receipts, improvements, household participation, and rewards. | Household collaboration is valuable for the current two-person use case. Rewards and gamification are not important to Houser's core job. |
| [HomeQueue](https://www.homequeue.app/) | Shared household job backlog that ranks work by cost, effort, and importance and supports assignments, reminders, and planning. | Prioritization and shared ownership are meaningful gaps in Houser once basic editing and scheduling are complete. |

### Evaluated feature candidates

| Candidate | Value to Houser | Recommendation |
| --- | --- | --- |
| Complete work-item planning editor | Converts imported findings and manual entries into real plans; unlocks date-based timeline views, reminders, and calendar export. | **Build next.** Include date/range, recurrence, assignee, estimate, status, and note editing in one clean flow. |
| Documents inbox and record linking | Makes uploaded inspections, quotes, and invoices findable after extraction and connects each source to proposed work, completed work, assets, and vendors. | **Build immediately after planning.** This reinforces Houser's strongest differentiation. |
| Household assignments and digest | Lets two owners divide responsibility and receive one useful weekly summary instead of many notifications. | **High priority.** Start with assignee, watchers, and an email/in-app digest; defer granular roles until invitations are implemented. |
| Explainable work prioritization | Ranks work using safety, urgency, consequence of delay, estimate, effort, due window, and evidence confidence. | **High priority after scheduling.** Always show why an item ranks highly and let the owner override it; avoid an opaque AI score. |
| Vendor and cost history | Connects quotes, invoices, contacts, systems serviced, warranties, and actual spend so future hiring and budgeting decisions use prior evidence. | **High priority.** Build on normalized quote and invoice extraction rather than creating a separate contact silo. |
| Guided asset onboarding | Uses a photo, nameplate, document, or manual to propose manufacturer, model, serial, warranty, parts, and maintenance intervals for approval. | **High-value review candidate.** Begin with one asset at a time and preserve the source and confidence of every extracted field. |
| Parts and consumables registry | Stores HVAC filter sizes, bulbs, batteries, paint colors, pool supplies, and other exact replacement items, including quantity on hand and reorder links. | **Useful medium-term feature.** Start with part number and last-used product; stock alerts can follow later. |
| Capital replacement forecast | Estimates replacement windows and reserve needs for roofs, HVAC, water heaters, appliances, pool equipment, and other major assets. | **Medium-term.** Only forecast from owner-confirmed installation age, condition, lifespan range, and cost assumptions; show uncertainty rather than false precision. |
| Property history and handoff report | Produces a chronological record of inspections, improvements, service, costs, warranties, and open work for insurance, a future buyer, or a new property manager. | **Medium-term and strategically aligned.** Add private, selective export controls before any shareable link. |
| Photo-assisted room or asset capture | Identifies several systems or appliances from photos and proposes assets or work without requiring repetitive typing. | **Review after asset editing is stable.** Require confirmation, account for API cost, and avoid retaining unnecessary imagery. |
| Property-specific seasonal plan | Suggests recurring work based on installed assets, property features, climate, and actual completion history. | **Review later.** Use transparent rules and vetted sources for safety-sensitive guidance; never silently activate generated tasks. |
| Project and quote-comparison mode | Groups multiple work items, alternatives, quotes, phases, budgets, decisions, and final invoices for a renovation or major replacement. | **Medium-term.** First deliver reliable quote-to-work linking; add full project management only when real usage demands it. |
| Insurance inventory and floor plans | Catalogs personal property, values, receipts, and room layouts for claims. | **Low priority.** It expands Houser beyond building care and competes with mature inventory products; revisit after the core maintenance record is dependable. |
| Generic property AI chat | Answers free-form questions across the property record. | **Defer as a headline feature.** Add only after documents, assets, work, and history are sufficiently complete, with citations back to Houser records. |
| Rewards, contractor marketplace, and booking | Gamifies maintenance or intermediates service-provider discovery and transactions. | **Do not prioritize.** These add operational and business-model complexity without improving the personal POC's central loop. |

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
