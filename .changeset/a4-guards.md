---
"agent-maturity-compass": patch
---

Internal guard wiring for the A4 Forge preview; nothing changes at runtime. `npm run check:no-fabrication` now scans `src/a4/` as a guarded root, `npm run check:gates` classifies `src/a4/a4Store.ts` as the only module allowed to emit the `A4_STATE` audit type (governance bookkeeping, never maturity evidence), the threat model's `studio` channel names the native admission and A4 identity symbols, and agent mode blocks the sixteen owner-gated `a4 …` command paths before any of those commands exist.
