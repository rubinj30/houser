<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Houser project rules

- Treat `docs/PRODUCT_OUTLINE.md` and `docs/TECH_SPEC.md` as the product and architecture baselines.
- Keep real inspection PDFs, invoices, screenshots, and credentials out of Git.
- Preserve source document and page references for imported findings.
- Historical inspection findings require owner verification before becoming active work.
- Design and test critical workflows from a 360 CSS-pixel viewport upward.
- Use SQL migrations as the database schema source of truth.
- Test row-level security for every tenant-scoped table before connecting production-like data.
