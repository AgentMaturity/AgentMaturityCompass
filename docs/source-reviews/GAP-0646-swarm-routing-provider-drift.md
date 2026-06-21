# GAP-0646 — swarm routing provider-drift relevance review

- Gap: `GAP-0646`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7133305395` / DOI `10.1038/s41598-026-42158-y`
- Retrieval: `2026-06-21T04:19:24Z` via OpenAlex API (`status=200`, source `Scientific Reports`, type `article`, metadata SHA-256 `246b1a0efe89e2e719f35b8f6cbc4a16ab033ff243667e5eb3ec452fc49a583e`)
- Status: relevant to coordination/routing drift context, but not accepted as a provider-drift source-specific implementation.

## Relevance decision

The source metadata is about routing stability and coordination in swarm-based multi-agent dialogue systems. That is adjacent to AMC Fleet/Watch coordination drift, but it is not itself a provider/model drift benchmark. Implementing a provider-drift wrapper would misclassify the gap and bloat AMC.

AMC-native handling is to use existing Watch live-drift or Fleet evidence when a user supplies routing-stability manifests, baseline/live windows, drift statistics, signed evidence, and alert/waiver proof. DOI/OpenAlex metadata alone is rejected.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Watch | Relevant through existing live-drift receipts for routing/coordination stability. |
| Fleet | Indirect context for multi-agent coordination evidence; no Fleet runtime change. |
| Score/Shield | Accepted only when bound to AMC-owned evidence and thresholds. |
| Enforce/Vault/Passport/Comply | No direct scope for this gap. |

## No-bloat boundary

No swarm simulator, routing algorithm, provider-drift wrapper, paper importer, dataset mirror, or copied paper content was added.
