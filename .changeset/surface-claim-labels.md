---
"agent-maturity-compass": minor
---

MCP, API and Studio results now carry claim kinds and status dimensions; unknown pack ids such as `__proto__` are refused.

- MCP: every successful result of the ten tools adds a second text block with the claim line (for example `Claim: Self-reported · Result: not evaluated (…) · Evidence: incomplete · …`) and `Claim kinds: see docs/CLAIM_KINDS.md`, and sets `structuredContent` to `{ claimKind, statusDimensions, claimLabel }`. `createAmcMcpServer` builds the server without a transport.
- API: the result routes listed in `src/api/resultRouteRegistry.ts` add `claimKind`, `statusDimensions` and `claimLabel` beside `data`, or a `claim` object on each item of a list result. OpenAPI publishes `ClaimKind`, `StatusDimensions` and `ClaimResult`.
- Studio: the routes that feed result pages add the same fields, and the console shows them in a claim strip with a legend. "Not evaluated" is shown as a neutral state with its reason, never as 0 or a failure. Industry Packs pack-gate responses add `entitlementNote`: payment unlocks access to pack content and never changes a result, a trust tier or a verification outcome.
- A result that no adapter binds to evidence yet is not evaluated with the new reason `RESULT_NOT_BOUND` ("this result is not yet bound to claim-eligible evidence"). A diagnostic run carries its own claim only when this workspace's auditor key sealed it.
- `getPackById` reads own keys only, so `__proto__`, `constructor`, `toString` and `hasOwnProperty` are refused as pack ids by MCP, Studio `/industry-packs/:id` and the CLI pack commands.
