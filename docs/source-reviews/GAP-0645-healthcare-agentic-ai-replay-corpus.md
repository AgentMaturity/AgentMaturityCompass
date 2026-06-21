# GAP-0645 — healthcare agentic-AI replay-corpus relevance review

- Gap: `GAP-0645`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7135409568` / DOI `10.1038/s41746-026-02517-5`
- Retrieval: `2026-06-21T04:19:24Z` via OpenAlex API (`status=200`, source `npj Digital Medicine`, type `article`, open-access true, metadata SHA-256 `4d55a007cb9f8cfb7dbf6a8bc626f1cc02fb4ff26127cae0ba9381a91ce08123`)

## Relevance decision

Relevant only as healthcare-domain source-review context for existing replay-corpus proof, not as a clinical product feature. A scoping review can motivate careful healthcare replay evidence, but it cannot supply AMC benchmark rows or clinical proof.

AMC accepts healthcare agent replay claims only when the user provides AMC-owned fixtures, clinical-task manifests, privacy boundaries, signed evidence rows, score deltas, safety checks, and CI/lifecycle receipts through existing replay-corpus primitives.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Yes, only through AMC-owned replay evidence and question/score receipts. |
| Shield | Yes, for safety/privacy failure rows with signed evidence. |
| Watch | Yes, for replay/live monitoring receipts. |
| Comply | Indirect healthcare compliance context; no new compliance framework in this gap. |
| Enforce/Vault/Fleet/Passport | No direct scope for this gap. |

## No-bloat boundary

No clinical-decision subsystem, healthcare dataset, medical workflow, clinical benchmark mirror, importer, compliance claim, or copied paper content was added.
