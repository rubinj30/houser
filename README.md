# Houser

Houser is a mobile-first home maintenance and work-history application for a primary residence and a rental property. It turns inspection findings, manually entered needs, invoices, and completed work into one organized record for each property.

## Current POC

The first runnable product shell is implemented with real, privacy-reduced Sample Home inspection data. It includes responsive dashboard, work, timeline, and asset views plus a local-only quick-add interaction.

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
- [Sample Home inspection seed notes](docs/INSPECTION_SEED_NOTES.md)
- [Document ingestion and normalization](docs/DOCUMENT_INGESTION.md)
- [POC execution status](docs/POC_EXECUTION.md)

The next milestone adds Supabase persistence and authentication. Hosting remains intentionally undecided because the original hosting sentence was incomplete.
