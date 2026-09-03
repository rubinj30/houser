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
npm run test:e2e
npm run build
```

The Playwright suite runs critical Work-planning paths at mobile and desktop sizes. Configure the test-only values from `.env.example`, then run `npm run test:e2e:provision` once to create or reset the disposable Supabase test household. The provisioning command requires the server-only service-role key; it never exposes that key to Playwright or browser code. Authenticated tests skip when the dedicated email and password are absent.

Planning documents:

- [Product outline](docs/PRODUCT_OUTLINE.md)
- [Technical specification](docs/TECH_SPEC.md)
- [Document ingestion and normalization](docs/DOCUMENT_INGESTION.md)
- [POC execution status](docs/POC_EXECUTION.md)

Work-item mutations now share one Work-planning module and an atomic database function across quick capture and Ask Houser. Private document storage, extraction, inspection evidence, attachments, household collaboration, and grounded chat are connected in the current POC.
