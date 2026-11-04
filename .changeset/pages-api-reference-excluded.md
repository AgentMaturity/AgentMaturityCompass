---
"agent-maturity-compass": patch
---

The documentation site no longer publishes the generated TypeDoc package reference at `/api/` (D-12, AMC-1543): it was never reviewed and had broken links. `pnpm build:pages` leaves it out unless `AMC_PAGES_API_REFERENCE=1` is set, and the Docs top bar, `docs/PACKAGE_API_REFERENCE.md` and `docs/API_SURFACES.md` no longer link to it. `pnpm docs:api` still builds it locally.
