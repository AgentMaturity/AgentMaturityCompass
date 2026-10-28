---
"agent-maturity-compass": patch
---

wrapFetch's ordinary (non-race) dispatch now meets checkEgress, which applies residency (P2-01) and the kill switch (P2-26) on the `provider` channel before every attempt, with wrapFetch's configured `agentId`. A typed refusal propagates: it is never retried, caught or turned into a fallback, and a kill that lands between retries refuses the retry. `WrapFetchOptions` accepts an optional `workspace`; without one the scoped fallback applies (the asynchronous workspace scope, otherwise only an unregulated working directory). A race stage without its own workspace now uses wrapFetch's. The egress inventory adds the ordinary dispatch as gated, the A4 deployment verify GET as deferred, and the local Studio liveness probe and wire Unix-socket connections as exempt.
