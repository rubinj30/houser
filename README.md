# Houser

Houser is a mobile-first home maintenance and work-history application for a primary residence and a rental property. It turns inspection findings, manually entered needs, invoices, and completed work into one organized record for each property.

## Current POC

The POC is live at [houser-flax.vercel.app](https://houser-flax.vercel.app). It uses Supabase authentication and persistence. The responsive dashboard includes work, timeline, and asset views; database-backed quick capture; review notes and activity history; and a completed-work flow for service date, vendor, actual cost, warranty, and recurring maintenance.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Planning documents:

- [Product outline](docs/PRODUCT_OUTLINE.md)
- [Technical specification](docs/TECH_SPEC.md)
- [Document ingestion and normalization](docs/DOCUMENT_INGESTION.md)
- [POC execution status](docs/POC_EXECUTION.md)

The current milestone is finishing the manual maintenance loop with asset editing and general work-item editing. Private document storage, extraction, and source-page captures follow after that loop is reliable.
