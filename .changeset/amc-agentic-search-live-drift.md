---
"agent-maturity-compass": minor
---

Add agentic-search live drift receipts for baseline-to-live monitoring.

Rows can now bind benchmark id, dataset family, query type, query/task ids, source and tool-config hashes, planner/search/citation/synthesis trace hashes, result manifest hash, planning/query-decomposition/relevance/synthesis scores, and citation coverage. Score, Watch, and Shield now fail closed on agentic-search score drops, citation or trace coverage gaps, dataset-family drift, query-type drift, tool-context drift, missing signed evidence, or receipt hash mismatches.
