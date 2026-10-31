---
"agent-maturity-compass": patch
---

Clear the nine production dependency advisories `pnpm audit --prod` reported (2 high, 5 moderate, 2 low), so the release gate's runtime dependency audit and the nightly dependency audit pass again. `zod` moves from 4.4.3 to 4.6.7 (range `^4.6.6`, GHSA-mrhx-c7xc-m3w5). `@modelcontextprotocol/sdk` stays at 1.32.1, and pnpm overrides lift the packages it pulls in: `body-parser` 2.3.0 to 2.4.0 (GHSA-27r3-jxmh-p828), `qs` 6.16.0 to 6.17.1, `fast-uri` 3.1.8 to 3.1.9 (four advisories), `@hono/node-server` 2.1.1 to 2.1.5 and `ip-address` 10.7.2 to 10.7.5.

zod 4.5 made `z.iso.datetime()` require seconds. The published schemas keep their time rules (seconds optional): the schemas under `spec/schemas/`, every record the standalone verifier checks, and the AEP 0.1 event schema the hook bridge publishes (`website/schemas/observed-aep-action-event-0.1.schema.json`, where a time may also carry an offset). AMC's other time fields (its own state files, request bodies, catalog and configuration inputs) now take RFC 3339 times only, so a time without seconds such as `2026-10-15T09:00Z` is refused there. The regenerated schemas change only in form: a union of bare types is now a `type` array, and the AEP email pattern is rewritten without lookaheads and accepts the same addresses.

zod 4.5 also counts string length bounds in Unicode code points, as JSON Schema's `minLength` and `maxLength` do, instead of UTF-16 units. The standalone verifier now counts the same way, so it still accepts exactly what AMC's contracts accept; the external evidence profile, which both check by hand, still counts UTF-16 units. A strict object now refuses an own `__proto__` key instead of dropping it.
