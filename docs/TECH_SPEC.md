# Houser Technical Specification

Status: Proposed architecture for POC
Related document: [Product outline](PRODUCT_OUTLINE.md)

## 1. Goals and constraints

Build a mobile-first web application that initially serves one owner and two properties, while enforcing an account/property data model suitable for future shared or commercial use.

The architecture must support:

- Structured records for properties, areas, categories, assets, work items, and service history
- Multiple views of the same underlying records without duplicating data
- Secure original-document storage
- Asynchronous document extraction and human approval
- Traceability from extracted fields to the source document and page
- Future schedule calculation without erasing historical facts or manual overrides
- Responsive browser use; no native mobile app is required for the POC
- Data export and recoverability

## 2. Proposed stack

### Application

- **TypeScript + Next.js App Router:** One responsive application and a server-side backend-for-frontend using Route Handlers and server-side modules.
- **React:** Interactive forms, filters, review tools, and timeline UI.
- **Utility CSS plus accessible component primitives:** Exact libraries can be selected during scaffolding; avoid binding the product model to the component framework.
- **Schema validation:** Validate all form, API, extraction, and environment input at runtime as well as at compile time.

### Data and platform services

- **PostgreSQL:** Canonical relational store. It is well suited to linked, auditable property records and supports native full-text search for the POC.
- **Supabase as the default managed backend:** Hosted Postgres, authentication, private object storage, and row-level security in one service. This is a recommendation, not a requirement.
- **Private object storage:** Inspection reports, invoices, images, warranties, and manuals. Store object metadata in PostgreSQL; never store large binaries in ordinary relational columns.
- **Background job runner:** Process uploads outside request/response. The exact service depends on hosting. Jobs must be idempotent and retryable.
- **Transactional email provider:** Add in the stable phase for invitations and reminders.

### Hosting

The application layer should remain deployable to any Node-compatible platform. A default combination would be a managed Next.js host plus Supabase, but final selection is deferred until the intended “I plan to hos…” requirement is completed.

Avoid provider-specific business logic. Wrap storage, extraction, job dispatch, and notifications behind narrow service interfaces.

## 3. Architecture

Use a modular monolith for the POC:

```text
Mobile/desktop browser
        |
        v
Next.js web application
  - authenticated pages
  - route handlers / server actions
  - domain services and validation
        |
        +--------------------+
        |                    |
        v                    v
PostgreSQL              Private object storage
        ^                    |
        |                    v
        +------------- Background worker
                         - text/OCR extraction
                         - structured proposals
                         - preview generation
                         - reminder scheduling
```

Module boundaries:

- Identity and authorization
- Properties and membership
- Taxonomy: categories and areas
- Assets and lifecycle estimates
- Work planning
- Service history and costs
- Documents and extraction
- Search and reporting
- Notifications

Do not split these into separate deployable services during the POC. The operational cost would exceed the benefit.

## 4. Data model

All primary keys are UUIDs. All mutable tables include `created_at`, `updated_at`, and where relevant `created_by`/`updated_by`. Monetary values use integer minor units plus an ISO currency code. Dates use `date` for homeowner-level dates and `timestamptz` for system events.

### Identity and tenancy

#### `accounts`

- `id`
- `name`
- `default_currency`
- `timezone`

An account is the security and ownership boundary. It may contain multiple properties.

#### `profiles`

- `id` matching the auth user ID
- `display_name`
- `email` or normalized reference to auth identity

#### `account_memberships`

- `account_id`
- `user_id`
- `role`: owner, manager, contributor, viewer
- `status`

POC may expose only the owner role, but authorization is account-based from day one.

#### `properties`

- `id`, `account_id`
- `display_name`
- Address fields stored separately
- `property_type`
- `timezone`
- `is_archived`

### Classification and assets

#### `categories`

- `id`
- `account_id`, nullable for system defaults
- `name`, `slug`, `icon_key`, `color_key`
- `is_system`, `is_active`

#### `property_categories`

- `property_id`, `category_id`
- `is_enabled`
- `sort_order`

#### `areas`

- `id`, `property_id`
- `name`
- `parent_area_id`, nullable
- `area_type`

Nested areas allow “Exterior > North elevation” without requiring them in the POC UI.

#### `assets`

- `id`, `property_id`, `category_id`, optional `area_id`
- `name`, `asset_type`
- `manufacturer`, `model`, `serial_number`
- `installed_on`, `installed_on_precision`
- `expected_life_months`, `expected_life_source`
- `condition`: unknown, good, fair, poor, failed
- `status`: active, removed, replaced
- `replacement_asset_id`, nullable
- `notes`

Date precision values (`day`, `month`, `year`, `approximate`, `unknown`) prevent false precision for an old roof or appliance.

### Work planning and history

#### `work_items`

- `id`, `property_id`, `category_id`
- Optional `area_id`, `asset_id`
- `title`, `description`
- `work_type`: inspect, maintain, repair, replace, improve, monitor, other
- `status`: inbox, planned, scheduled, in_progress, completed, deferred, rejected, canceled
- `priority`: emergency, urgent, important, routine, informational
- `safety_flags`: array or related table with life_safety, water, electrical, structural, security, code
- `target_start_on`, `target_end_on`
- `target_basis`: explicit, inspection, asset_lifespan, recurrence, manual
- `manual_target_override`: boolean
- `estimated_cost_minor`, `currency`
- `source_type`, optional `source_document_id`
- Optional `assigned_user_id`, `vendor_id`
- `completed_at`, nullable
- `archived_at`, nullable

`completed` remains a terminal historical state. Repeating work creates the next work item rather than reopening the previous one.

#### `maintenance_rules`

- `id`, `asset_id` or property/category scope
- `title`
- `interval_months` or structured recurrence rule
- `lead_time_days`
- `is_active`
- `last_generated_through`

#### `service_records`

- `id`, `property_id`, `category_id`
- Optional `asset_id`, `work_item_id`, `vendor_id`
- `service_type`: inspection, maintenance, repair, replacement, installation, other
- `performed_on`
- `description`
- `cost_minor`, `currency`
- `warranty_ends_on`
- `created_by`

Service records are historical facts and should not be casually edited or deleted. Corrections should produce audit events.

#### `vendors`

- `id`, `account_id`
- `name`, contact fields
- `notes`

### Documents and extraction

#### `documents`

- `id`, `property_id`
- Optional links to asset, work item, service record, or vendor via `document_links`
- `document_type`: inspection, quote, invoice, work_order, receipt, warranty, manual, permit, photo, other
- `original_filename`, `mime_type`, `byte_size`, `storage_key`
- `sha256` for duplicate detection and integrity
- `document_date`
- `status`: uploaded, queued, processing, review_ready, accepted, failed
- `processing_error_code`, nullable
- `uploaded_by`

#### `document_pages`

- `document_id`, `page_number`
- `extracted_text`
- `preview_storage_key`
- `extraction_metadata` JSONB

#### `attachments`

- `id`, `property_id`
- `source_type`: manual_upload, inspection_capture, document_page, generated_preview
- `storage_key`, `mime_type`, `byte_size`, `sha256`
- `caption`, optional `captured_at`
- Optional `source_document_id`, `source_page_start`, `source_page_end`
- Optional `crop_metadata` JSONB containing page-relative crop coordinates
- `generation_version`, nullable for manual uploads

Attachments link to assets, work items, service records, and inspection proposals through `attachment_links`. An inspection finding capture is derived evidence; the original private document remains canonical.

#### `extraction_runs`

- `id`, `document_id`
- `extractor_name`, `extractor_version`, `prompt_or_schema_version`
- `started_at`, `completed_at`, `status`
- `raw_result_storage_key` or JSONB for a size-limited response
- `input_tokens`, `output_tokens`, `estimated_cost_minor`

#### `extraction_proposals`

- `id`, `extraction_run_id`, `property_id`
- `proposal_type`: area, asset, work_item, vendor, service_record
- `proposed_data` JSONB validated against a versioned schema
- `source_page_numbers`
- `source_excerpt` limited to necessary evidence
- `confidence`
- `review_status`: pending, accepted, edited, rejected, merged
- `accepted_entity_type`, `accepted_entity_id`
- `reviewed_by`, `reviewed_at`

Proposals are staging records, not live work. This boundary is essential for safe document ingestion.

The normalized proposal schema must support shared document fields, financial totals, evidence-backed scope items, typed terms (payment, warranty, expiration, condition, and exclusion), proposed domain records, and unresolved-field warnings. See [`DOCUMENT_INGESTION.md`](DOCUMENT_INGESTION.md) and `src/lib/document-extraction.ts`.

### Supporting records

- `document_links`: many-to-many links between documents and domain entities
- `attachment_links`: many-to-many links between attachments and domain entities
- `comments`: notes and discussion on work items or assets
- `activity_events`: append-only audit and user-visible activity stream
- `tags` and `taggings`: optional flexible labeling; omit from the first migration unless needed
- `notifications`: delivery and read state

## 5. Derived dates and timeline behavior

Store inputs and derivations separately:

- Installation date + lifespan yields an estimated replacement window.
- Last service date + recurrence yields a next-service proposal.
- Inspection recommendation yields a proposed target window.
- A manual override wins until explicitly cleared.

The calculation service returns:

```ts
type ScheduleSuggestion = {
  earliestDate: string | null;
  latestDate: string | null;
  basis: 'inspection' | 'asset_lifespan' | 'recurrence' | 'none';
  explanation: string;
  confidence: 'low' | 'medium' | 'high';
};
```

Calculations should be deterministic, tested domain functions. AI may extract a claimed roof age or recommendation, but it does not own the final schedule calculation.

Timeline queries combine future work items and past service records into a read model. Start with a SQL view or `UNION ALL` query; introduce a materialized projection only if measurement shows it is needed.

## 6. API and server boundaries

Prefer server-rendered reads and server-side mutations. Use explicit Route Handlers for uploads, asynchronous callbacks, exports, and integrations.

Representative endpoints:

```text
POST   /api/properties/:propertyId/documents/upload-intent
POST   /api/properties/:propertyId/documents/:documentId/process
GET    /api/documents/:documentId/proposals
POST   /api/documents/:documentId/proposals/review
GET    /api/properties/:propertyId/timeline
POST   /api/work-items/:workItemId/complete
POST   /api/properties/:propertyId/exports
```

Rules:

- Verify membership and property access on every request.
- Never trust an account or property ID supplied by the browser without authorization.
- Use idempotency keys for document processing and work completion.
- Return stable machine-readable error codes plus human-readable messages.
- Paginate lists and timeline results with cursors.
- Validate upload MIME type, size, filename, and actual file signature.

## 7. Document processing pipeline

1. Browser requests an upload intent for a specific property.
2. Server creates a pending document record and a short-lived signed upload target.
3. Browser uploads directly to private object storage.
4. Server verifies object metadata, checksum, and ownership, then queues processing.
5. Worker performs malware scanning when available, text extraction/OCR, and page-preview generation.
6. A structured extractor creates versioned proposals with page evidence.
7. Deterministic validation rejects malformed categories, dates, currency, or cross-property links.
8. UI presents pending proposals for human review.
9. An acceptance transaction creates/links entities, records an activity event, and marks the proposal accepted.

Failure behavior:

- Retain the original upload unless it violates security policy.
- Display a recoverable failure state and allow retry.
- Never create duplicate accepted entities when a job retries.
- Keep raw extraction data private and apply a retention policy.
- Treat document text as untrusted input; it cannot instruct the application or worker to take unrelated actions.

## 8. Authentication and authorization

- Require authentication for all application pages and data APIs.
- Enforce account membership and role permissions in both server services and database row-level security.
- Scope storage objects under unguessable account/property paths and authorize access with short-lived signed URLs.
- Keep privileged service credentials server-only.
- Enable row-level security on every exposed tenant table and add indexes for columns used in policies.
- Record access-changing actions in `activity_events`.

Initial role matrix:

| Capability | Owner | Manager | Contributor | Viewer |
| --- | --- | --- | --- | --- |
| View assigned properties | Yes | Yes | Yes | Yes |
| Create/edit work and service records | Yes | Yes | Yes | No |
| Review document proposals | Yes | Yes | Optional | No |
| Manage members and property access | Yes | No | No | No |
| Delete/export account data | Yes | No | No | No |

Only owner is required in the first POC interface.

## 9. Mobile and accessibility requirements

- Design from a 360 CSS-pixel viewport upward.
- Minimum 44 by 44 CSS-pixel touch targets.
- Forms use correct input modes for date, phone, currency, and number fields.
- Upload supports camera capture where the browser exposes it, but always retains ordinary file selection.
- No critical action depends on hover, drag, or a wide table.
- Dense desktop tables become cards or progressive-detail lists on narrow screens.
- Persistent mobile property context prevents recording work against the wrong house.
- Meet WCAG 2.2 AA for color contrast, focus, labels, errors, and keyboard operation.
- Respect reduced-motion settings.

## 10. Search and filters

POC search uses PostgreSQL full-text search plus indexed exact filters. Searchable text includes work title/description, asset name/model, vendor name, and extracted document text where privacy policy allows.

Required filter indexes include common combinations of:

- `property_id`, `status`, `target_start_on`
- `property_id`, `category_id`, `status`
- `property_id`, `asset_id`
- `account_id` on membership-scoped records
- `sha256` on documents

Do not add a separate search service until the corpus or search-quality requirements justify it.

## 11. Observability, backup, and operations

- Structured logs with request/job correlation IDs; exclude extracted document text and secrets.
- Error reporting for browser, server, and worker failures.
- Job metrics: queue delay, runtime, retries, failure rate, and review yield.
- Database migration history committed to source control.
- Automated database backups and tested restore procedure before stable release.
- Object-storage retention and deletion workflow aligned with account deletion.
- Health endpoint checks application, database connectivity, and job dispatch without exposing details.

## 12. Testing strategy

### Unit tests

- Lifespan and recurrence schedule calculations
- Date precision and range behavior
- Status transitions
- Cost and currency handling
- Extraction proposal validation
- Permission predicates

### Integration tests

- Row-level security prevents access across accounts/properties
- Upload intent and signed download authorization
- Proposal acceptance transaction and retry idempotency
- Completing repair/service/replacement work updates the correct asset fields
- Search and timeline queries

### End-to-end tests

- Add both properties and switch safely between them
- Create, schedule, complete, and locate work on mobile viewport
- Upload inspection, review proposals, and verify source pages
- Upload invoice to completed work and revise next service
- Export core data

Use synthetic inspection and invoice fixtures in the repository. Keep real homeowner documents out of source control and non-production logs.

## 13. Performance targets

- Core page server response p75 under 500 ms under expected POC load, excluding network latency
- Core page usable within two seconds on a representative mobile connection and device
- User mutation acknowledgement under one second
- Upload progress visible immediately
- Document jobs queued immediately and processed asynchronously; do not promise a fixed completion time
- Paginate before any list exceeds 50 records in one response

These are engineering targets to validate with measurement, not contractual service levels.

## 14. Environments and delivery

- Local, preview/staging, and production environments
- Separate databases and storage buckets per environment
- Schema migrations run through CI/CD with a documented rollback or forward-fix strategy
- Seed data provides two fictional properties and representative categories
- Secrets stored in the host's secret manager, never committed
- Preview deployments use synthetic documents only

Recommended implementation milestones:

1. Project scaffold, authentication, schema, RLS, and seed data
2. Manual property/asset/work-item CRUD and responsive navigation
3. Dashboard, filters, category view, and combined timeline
4. Documents and direct private uploads
5. Background extraction plus import review
6. Work completion, service history, and schedule recalculation
7. Search, CSV export, accessibility, security review, and production readiness

## 15. Explicit non-goals for the POC

- Native applications
- Real-time chat
- Tenant/vendor self-service
- Automated financial, legal, tax, safety, or code-compliance advice
- Automatic approval of extracted recommendations
- Microservice architecture
- General-purpose project management

## 16. Open technical decisions

- Final hosting platform and its job/background-processing capabilities
- Authentication methods: passwordless email, password, social login, or a subset
- Document extraction provider and privacy/data-retention terms
- Maximum upload size and supported report complexity
- Reminder delivery channel
- Whether offline drafts are needed before the stable phase
- Required data residency or special handling for rental records

## 17. Reference documentation

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html)
