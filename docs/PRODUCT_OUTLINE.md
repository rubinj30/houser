# Houser Product Outline

Status: Initial product definition
Audience: Owner, designer, and implementation team
Initial deployment: One owner, two houses; designed so more properties and users can be added later

## 1. Product idea

Houser is the durable record of what each house contains, what needs attention, what has been done, what it cost, and what is likely to be needed next.

The product should answer four questions quickly:

1. What needs attention now or soon?
2. What is the condition and history of a particular part of a house?
3. What work was completed, when, by whom, and at what cost?
4. What expenses and maintenance should be anticipated over the next several years?

The core product distinction is between:

- **Property:** A house or other managed location.
- **Area:** A physical location such as kitchen, attic, exterior, or pool area.
- **System/category:** A type of infrastructure or work such as HVAC, plumbing, electrical, roof, or landscaping.
- **Asset:** A maintainable thing such as an HVAC unit, water heater, roof surface, pool pump, or appliance.
- **Work item:** Something to inspect, repair, replace, or maintain.
- **Service record:** Work that actually happened, with its dates, cost, vendor, notes, and documents.

Separating assets from work items prevents an invoice or inspection finding from becoming an isolated to-do. Each item becomes part of a long-lived house history.

## 2. Suggested categories

Categories are configurable per property. The starter set should include:

- Roof and drainage
- HVAC and ventilation
- Plumbing and water
- Electrical
- Structure and foundation
- Exterior, siding, windows, and doors
- Interior and finishes
- Appliances
- Fire, smoke, carbon monoxide, and security
- Pool and spa
- Landscaping, irrigation, and trees
- Pest and moisture control
- Septic, sewer, well, or other utilities
- Solar, batteries, generator, and EV charging
- Accessibility and safety
- General or uncategorized

A property should only show relevant categories. For example, the rental may not have a pool today, but the category remains available for another property later.

## 3. Additional ideas by phase

### Initial proof of concept

The POC should prove the central loop: capture a need, organize it, complete it, preserve the evidence, and update what happens next.

- Two preconfigured properties with a clear property switcher
- Dashboard showing overdue, due soon, unscheduled, and recently completed work
- Manual creation and editing of assets and work items
- Configurable categories, areas, priorities, and statuses
- Inspection report upload, supporting PDF and common image formats
- Assisted inspection import that proposes findings for review before saving
- Each proposed finding includes source page, extracted wording, suggested property area, category, priority, and recommended action
- A mandatory human review screen for merging duplicates, correcting details, accepting, or rejecting findings
- Category view, timeline view, and property-wide list view
- Work item status flow: inbox, planned, scheduled, in progress, complete, deferred, not doing
- Due dates and approximate date ranges, because inspection language is often imprecise
- Asset installation date, expected lifespan, condition, and next-service date
- Invoice or work-order upload attached to a completed service record
- Service record fields for vendor, completion date, cost, notes, warranty, and document
- Completion workflow that asks whether the work changes the asset's installation date, condition, warranty, expected replacement date, or recurring maintenance schedule
- Search and filters across property, category, status, priority, vendor, and date
- Mobile camera/file upload and thumb-friendly forms
- Simple CSV export and document download so the owner's data is portable
- Basic reminders in the app; email reminders can wait until the stable release unless easy to add

POC exclusions:

- Tenant access
- Vendor portal
- Automated quote collection
- Accounting or tax integrations
- Fully autonomous document decisions
- Native iOS or Android apps
- Complex budgeting and forecasting

### Stable personal version

The stable release should make the product dependable enough to become the permanent system of record.

- Multiple users with owner, manager, contributor, and read-only roles
- Invitations and property-level access
- Reliable email and/or push-style web notifications
- Recurring maintenance rules, such as filter changes every three months
- Calendar view and optional calendar feed
- Annual and multi-year maintenance budget forecast
- Actual versus estimated cost reporting
- Vendor directory with contact information and service history
- Warranties, permits, manuals, photos, and before/after documentation
- Versioned audit history for important changes
- Duplicate detection across inspection findings, existing work, and assets
- Bulk edit, archive, and import tools
- Saved filters such as “rental work this quarter”
- Offline-tolerant mobile drafts for notes and photos
- Better reporting for the rental: work by year, vendor, category, and potentially deductible classification, with an explicit disclaimer that the app does not provide tax advice
- Backup, restore, retention, and account deletion procedures
- Accessibility review and keyboard navigation
- Observability, error reporting, background-job retries, and document-processing status

### Stretch goals

- Tenant issue submission with owner approval and privacy boundaries
- Vendor access to assigned work orders, scheduling, estimates, and completion evidence
- Multiple quotes and bid comparison
- Email-to-property inbox for forwarding invoices and service messages
- AI-assisted extraction from manuals, warranties, permits, and receipts
- Condition trend detection from photos and repeated inspections
- Cost forecasting using the owner's history and local market data
- Home value or capital-plan scenarios
- Smart-home and utility integrations for runtime, leaks, energy, or air quality
- Home inventory and insurance documentation
- Natural-language queries such as “show every plumbing repair at the rental since 2024”
- Portfolio support for many properties, ownership entities, and property managers
- White-label or commercial SaaS version

## 4. Product structure

### Primary navigation

On mobile, use a compact bottom navigation:

1. **Home:** Property health summary and urgent work
2. **Work:** All work items, filters, and saved views
3. **Add:** Fast action for a work item, document, photo, or service record
4. **Timeline:** Upcoming and completed work by time
5. **More:** Assets, documents, vendors, categories, and settings

The selected property is persistent and visible at the top. An “All properties” choice supports portfolio-level planning.

### Main views

#### Dashboard

- Property condition summary
- Overdue and urgent work
- Due in 30, 90, and 365 days
- Unscheduled inspection findings
- Recent completed work
- Upcoming estimated costs
- Document imports that require review

#### Category view

- Category cards with counts for urgent, upcoming, and completed work
- Assets within each category
- Category history, documents, and total spending
- Optional grouping by area

#### Timeline view

- Past service records and future work on one time axis
- Time horizons: overdue, next 30 days, next 90 days, next year, 1–5 years, and unscheduled
- Filters for property, category, priority, status, and estimated cost
- Approximate dates displayed honestly as ranges rather than false precision

#### Asset detail

- Asset identity and property location
- Category, area, manufacturer, model, serial number, and photos
- Installed or manufactured date and confidence/source
- Current condition and expected lifespan
- Calculated expected replacement window
- Open work and completed service history
- Manuals, warranties, invoices, and inspection evidence

#### Work item detail

- Clear title, description, property, category, area, and linked asset
- Source: manual, inspection, recurring rule, or service follow-up
- Priority, safety flag, status, target date/range, and estimated cost
- Notes, photos, assignee, vendor, and documents
- Activity history
- Complete-work action that creates a service record

#### Import review

- Original document alongside proposed records
- Source-page citation for every proposal
- Confidence and warnings for uncertain fields
- Accept, edit, reject, merge, and bulk actions
- No imported proposal becomes active work without confirmation in the POC

## 5. Important workflows

### Inspection to actionable plan

1. Choose a property and upload the inspection report.
2. The system stores the original and begins background processing.
3. Text and images are extracted; proposed areas, assets, and findings are generated.
4. The owner reviews each proposal against the cited source page.
5. Accepted proposals create or link assets and create work items.
6. The dashboard and timeline update immediately.

### Complete work and revise the future

1. Open a work item and choose **Complete work**.
2. Enter the completion date, vendor, actual cost, notes, and attachments.
3. Record whether the work repaired, serviced, or replaced an asset.
4. If replaced, update the asset's installation date and expected lifespan.
5. If serviced, calculate its next service from a selected recurrence rule.
6. Preserve the original work item and add an immutable service-history event.

### Invoice first

1. Upload or photograph an invoice.
2. Extract vendor, dates, line items, totals, address, and likely category.
3. Review the extracted fields.
4. Link to an existing work item and asset, or create new ones.
5. Save a service record and update future maintenance if appropriate.

## 6. Prioritization and timeline rules

Priority and timing are related but separate:

- **Priority:** Emergency, urgent, important, routine, or informational
- **Status:** Where the item is in the work process
- **Target window:** Earliest and latest desired completion dates
- **Safety flag:** Independent flag for health, life-safety, code, water, or security risks

Initial due-date calculation:

- Explicit inspection date or phrase, when available
- Otherwise, asset installation date plus expected lifespan
- Otherwise, last service date plus recurrence interval
- Otherwise, user-entered date range
- Otherwise, unscheduled inbox

Every calculated date stores its basis and can be overridden. A user override is never silently replaced by a later calculation.

## 7. POC success criteria

The POC is successful when the owner can:

- Set up both houses and tell them apart at all times
- Upload a real inspection report and turn useful findings into reviewed work items
- Find the same work by property, category, area, time horizon, and search
- Complete work, attach an invoice, and see a permanent service record
- Replace or service an asset and see its future schedule update correctly
- Use every critical workflow comfortably on a phone
- Export the essential records and original documents

Suggested quality targets:

- No cross-property data leakage
- Every imported finding links back to its document and page
- No extraction result is committed without review
- Common screens become usable within two seconds on an ordinary mobile connection, excluding document processing
- Document processing is resumable and visibly reports queued, processing, ready for review, or failed

## 8. Product decisions still needed

These do not block the outline, but they affect implementation:

1. Intended hosting provider or environment—the original sentence ended at “I plan to hos”.
2. Whether the first release is private to one owner or should support a spouse/property manager immediately.
3. Preferred reminder channels: in-app only, email, SMS, calendar, or a combination.
4. Whether inspection and invoice extraction may use a third-party AI service and what privacy constraints apply.
5. Whether the rental needs tax-oriented expense labels in the POC.
6. A representative inspection report and invoice for testing extraction quality.

## 9. Recommended delivery sequence

1. Property, category, area, asset, and work-item model
2. Auth and property isolation
3. Manual work and asset workflows
4. Category, list, dashboard, and timeline views
5. Document storage and attachment flow
6. Inspection import and human-review workflow
7. Service completion, invoices, and future-date recalculation
8. Search, export, responsive polish, accessibility, and production hardening
