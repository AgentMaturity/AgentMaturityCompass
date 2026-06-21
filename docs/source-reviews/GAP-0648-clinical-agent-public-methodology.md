# GAP-0648 — clinical agent public-methodology relevance review

- Gap: `GAP-0648`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7130481397` / DOI `10.1038/s41746-026-02443-6`
- Retrieval: `2026-06-21T04:19:24Z` via OpenAlex API (`status=200`, source `npj Digital Medicine`, type `article`, metadata SHA-256 `efbafd862f402934c163fb69aaf555d08493ecedd052520ff65cd1ed3d20e5cf`)
- Status: source is relevant healthcare benchmark context, but not a public AMC methodology version change by itself.

## Relevance decision

The source metadata concerns benchmarking LLM-based agent systems for clinical decision tasks. It is relevant as healthcare benchmark context for Score/Shield/Watch, but it does not itself change AMC's public scoring methodology. Public methodology changes still require AMC-owned methodology version, changelog, deprecation notice, migration guidance, validation proof, badge assurance, signed evidence, row hashes, and no-copy proof.

Clinical benchmark metadata alone must fail closed as public methodology evidence and must not be promoted into a clinical subsystem, medical claim, or methodology version bump.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned clinical-task evidence and validation tables. |
| Shield | Relevant only when safety/clinical-risk receipts are signed and replayable. |
| Watch | Relevant only through existing replay/live drift receipts. |
| Comply | Indirect healthcare compliance context; no new compliance claim. |
| Enforce/Vault/Fleet/Passport | No direct scope for this gap. |

## No-bloat boundary

No clinical benchmark mirror, medical decision subsystem, importer, public methodology version bump, healthcare compliance claim, or copied paper content was added.
