# RUNTIME SDK

AMC ships a Node runtime embed SDK for correlation-ready traces and gateway routing.

This runtime SDK is Node-first. For React Native and Flutter, use the mobile Bridge path in `docs/SDK.md`; do not import `wrapFetch` into mobile bundles because it includes Node/runtime steering dependencies.

For the full Node/TypeScript, Python, Go, and OpenAPI inventory, see `docs/SDK.md`.

## Exports

- `wrapFetch(fetch, opts)`
- `createAMCMobileFetchBridge(opts)` via `agent-maturity-compass/sdk/mobile-fetch` for mobile-safe Bridge routing
- `logTrace(trace)`
- `validateTruthProtocol(text, riskTier)`
- `extractApprovalToken(text)`
- `withApprovalTrace(...)`

## wrapFetch

```ts
import { wrapFetch } from "agent-maturity-compass";

const fetchWithAmc = wrapFetch(fetch, {
  agentId: "salesbot",
  gatewayBaseUrl: "http://127.0.0.1:3210/openai",
  forceBaseUrl: true
});

await fetchWithAmc("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hello" }] })
});
```

Behavior:
- rewrites request URL to gateway base (when `forceBaseUrl=true`),
- injects `x-amc-agent-id`,
- emits AMC Trace v1 logs with `x-amc-request-id` and `x-amc-receipt`.

## Trace Logging

`logTrace()` writes canonical JSON lines to stdout and redacts common secret patterns.

## Truth Protocol Lint

`validateTruthProtocol(text, riskTier)` enforces required headings for `high/critical` risk:
- What I observed
- What I inferred
- What I cannot know
- Next verification steps

## LangChain JS / Custom Clients

If your framework accepts custom fetch, pass the wrapped fetch.
For custom code, replace direct `fetch` with `wrapFetch(fetch, ...)` and keep gateway route + `x-amc-agent-id` enabled.
