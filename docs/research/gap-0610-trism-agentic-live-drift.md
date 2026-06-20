# GAP-0610 — TRiSM for Agentic AI live drift mapping

## Metadata verification

The GAP-0610 source was verified from metadata only; no paper prose or paper data is copied into AMC fixtures.

- OpenAlex work: `W7133236347`
- DOI: `https://doi.org/10.1016/j.aiopen.2026.02.006`
- Title: `TRiSM for Agentic AI: A review of Trust, Risk, and Security Management in LLM-based Agentic Multi-Agent Systems`
- Venue/publisher: `AI Open`, `Elsevier BV`
- Type/year: OpenAlex `article`, Crossref `journal-article`, 2026
- OpenAlex license metadata: `cc-by-nc-nd`

Relevance: the paper metadata is clearly about trust, risk, and security management for LLM-based agentic multi-agent systems, which maps to AMC's Score, Shield, and Watch surfaces for live drift monitoring.

## Product mapping

`runTrismAgenticLiveDrift` uses the existing Watch live drift primitives and adds a metadata-only, fail-closed wrapper for TRiSM-related Score/Shield/Watch signals. A valid run must provide:

- baseline distribution proof hash,
- live sample manifest hash,
- drift statistic hash,
- alert receipt hash,
- DOI/OpenAlex/Crossref/publisher metadata proof,
- no-paper-prose-copy proof.

If required metadata is missing or mismatched, the receipt emits `trismAgenticEvidenceCoverage0to1`, sets `failClosed=true`, and returns Watch alerts.
