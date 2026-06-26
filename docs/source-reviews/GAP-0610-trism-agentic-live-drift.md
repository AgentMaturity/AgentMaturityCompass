# GAP-0610 — TRiSM agentic live drift boundary

- Gap: `GAP-0610`
- Source: DOI `10.1016/j.aiopen.2026.02.006`, OpenAlex `W7133236347`
- Source type: paper
- Retrieval date: 2026-06-20
- Dimension: `obs-live-drift-alerts`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Crossref returned title `TRiSM for Agentic AI: A review of Trust, Risk, and Security Management in LLM-based Agentic Multi-Agent Systems`, publisher `Elsevier BV`, type `journal-article`, container `AI Open`, published 2026.

## Relevance decision

Relevant to existing AMC live-drift monitoring because the source is about trust, risk, and security management for LLM-based agentic multi-agent systems. It does not justify a standalone TRiSM subsystem.

## Product closure

- Added a Watch live-drift wrapper that requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence, and row hashes.
- Metadata-only or mismatched source claims fail closed.

## No-copy boundary

No paper prose, figures, tables, datasets, prompts, or examples were copied.
