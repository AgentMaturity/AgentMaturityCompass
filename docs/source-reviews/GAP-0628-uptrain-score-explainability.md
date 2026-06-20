# GAP-0628 — UpTrain eval score explainability boundary

- Gap: `GAP-0628`
- Source: `https://github.com/uptrain-ai/uptrain`
- Source type: GitHub repository
- Retrieval date: 2026-06-21
- Dimension: `eval-score-explainability`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live GitHub API/`git ls-remote` retrieval verified repository `uptrain-ai/uptrain` as public, not archived, default branch `main`, Apache-2.0 licensed, with branch head `a31cc14eddcb6c0b0b12cbed15f086d98c441c6f` and tree `8816d2eeb9118f7c3852a1d9e0b133b8d1fff942`. Root metadata also exposed README (`096802282e606371b9aa359ca67a48fe9a7a64e0`), LICENSE (`261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`), `pyproject.toml` (`66f2e210d7c9a5d62172693e79d30ffd7e4ce03c`), and `uptrain/` tree (`00c5ebc9a46d4f2a9071d6b0e980aabf0905ca8b`) references.

## Relevance decision

Relevant only as source context for existing AMC question-score explainability. GAP-0628 does not add an UpTrain subsystem, SDK wrapper, importer, compatibility layer, parity claim, or upstream-derived evaluator. Repository metadata can support a source-review lens only after an AMC-owned score receipt binds the question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, fail-closed thresholds, and no-source-copy boundary.

## Product closure

- Extended the generic eval-AI-library question lens with an accepted-evidence ledger hash so accepted and rejected evidence ledgers are both represented in reproducible eval-score explainability packs.
- Surfaced source references in passport question-explainability summaries while preserving the per-row question ID, accepted evidence IDs, rejected evidence reasons, repair hint, status, and row hash.
- Updated guide evidence guidance to treat UpTrain repository metadata as source context only, never standalone proof.
- Added a regression test covering Score/Shield/Watch rows, eval pack readiness, guide proof rendering, and passport schema propagation for the UpTrain source boundary.

## No-copy boundary

No UpTrain source code, prose, examples, configuration, prompts, schemas, datasets, metrics, or implementation details were copied into AMC. The implementation uses only live repository metadata and AMC-owned question-score explainability primitives.
