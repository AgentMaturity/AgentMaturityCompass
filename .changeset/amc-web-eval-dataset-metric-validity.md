---
"agent-maturity-compass": patch
---

Add web eval dataset metric-validity proof for web-search RAG evaluation dataset claims.

AMC now fails closed unless web eval dataset metric rows bind source, subject,
generated-query, search-provider, retrieved-document, filter, QA-generation,
reference-answer, export-target, freshness, source-coverage, answer-grounding,
owner, confidence-interval, signed-evidence, and row-hash proof before using
Tavily-style generated web/RAG evaluation datasets as external evidence.
