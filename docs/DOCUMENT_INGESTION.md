# Document Ingestion and Normalization

Houser accepts non-uniform proposals, estimates, invoices, receipts, work orders, warranties, permits, manuals, and photos. The original file is always retained in private object storage. A normalized, reviewable record provides a consistent view across document types.

## User workflow

1. Choose a property and upload one or more files.
2. The upload appears immediately in the **Document inbox** with status `uploaded`.
3. A background task extracts text and page images, then calls the OpenAI Responses API with the original PDF or page images and a strict structured-output schema.
4. Deterministic validation checks currency math, dates, required evidence, property/vendor matches, and proposed record links.
5. The document moves to `review_ready`.
6. The owner reviews normalized fields beside the original page evidence.
7. Accepted fields create or link vendors, work items, assets, service records, costs, warranties, and maintenance rules.
8. Every accepted record retains a link to the underlying private document and relevant pages.

No model output writes directly to canonical domain tables.

## Uniform document view

Every document exposes, when present:

- Type, title, issue date, expiration/due date, status, and external reference
- Property and address match
- Vendor and representative
- Subtotal, discounts, tax, total, payment schedule, and payment status
- Scope/line items with category, area, asset, specifications, quantity, and amount
- Warranty, expiration, payment, condition, and exclusion terms
- Concise summary
- Proposed linked records
- Review warnings and unresolved fields
- Evidence page and excerpt for every extracted value
- Secure link to the original upload

Missing data remains `null`; it is never invented. Document-specific details live in typed term records or scope-item specifications rather than being discarded into one notes blob.

## OpenAI extraction approach

Use the Responses API with:

- A cost-oriented vision-capable model for first-pass extraction
- The uploaded PDF as an input file when supported for the selected model
- Structured Outputs using the JSON schema represented by `normalizedDocumentSchema`
- A prompt that treats document content as untrusted data and prohibits following embedded instructions
- A requirement that each non-null extracted field include page evidence
- `store: false` when appropriate to the selected OpenAI data-handling configuration
- A fixed model snapshot/version where reproducibility is more important than automatically adopting model updates

The first fixture was extracted manually from the Example HVAC Vendor HVAC proposal and serves as the expected output for evaluating the API implementation.

## Proposed storage layout

```text
private Supabase bucket
  documents/{propertyId}/{year}/{documentId}/original.pdf
  documents/{propertyId}/{year}/{documentId}/pages/1.webp
  documents/{propertyId}/{year}/{documentId}/captures/{captureId}.webp
```

Database tables:

- `documents` stores canonical metadata, processing state, object key, checksum, and document type.
- `document_pages` stores extracted page text and preview object keys.
- `extraction_runs` stores model, schema, prompt version, usage, status, and errors.
- `extraction_proposals` stores the full validated normalized payload and review decisions.
- `document_links` connects the source document to vendors, work items, assets, service records, and warranties.
- `attachments` and `attachment_links` provide screenshots and photos on the linked records.

Signed URLs should be short-lived and generated only after verifying the user's property access.

## Example HVAC Vendor proposal findings

The June 13, 2025 proposal is a useful evaluation case because it includes:

- A proposed main-level Carrier two-stage, 36,000 BTU R454B A/C system
- Outdoor model `26TPA836W003` and indoor-coil model `CVAVA3617XMA`
- A $9,000 total after $1,000 in discounts
- A 50% deposit and balance upon completion
- Multiple warranty statements with different conditions
- A promotion expiration date
- Customer-supplied thermostat responsibility
- Existing-system and lineset conditions/exclusions
- Blank customer acceptance but signed company approval

These ambiguities are intentionally retained as review warnings instead of being flattened into misleading certainty.
