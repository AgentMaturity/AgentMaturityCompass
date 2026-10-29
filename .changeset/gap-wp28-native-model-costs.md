---
"agent-maturity-compass": patch
---

Extend the existing indicative model catalog with provider/protocol identity, dated source metadata, cache rates, model limits and immutable snapshot digests. Native request headers pin this metadata; session usage reports distinguish provider-reported cost from catalog estimates and show partial or unknown coverage. Historical requests are never repriced from the current catalog. Reconcile overlapping ops router rates and keep explicit unknown-model estimates null. Preserve reasoning detail in versioned step usage metadata with compatible compaction readers, and withhold unsafe evidence identifiers from usage and cost views. Derive native endpoint defaults from the existing provider templates.
