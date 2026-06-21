# GAP-0654 — Agenta public-methodology relevance review

- Gap: `GAP-0654`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Agenta-AI/agenta`
- Source type: live GitHub repository metadata
- Retrieval: `2026-06-21T04:34:19Z` via GitHub API (`repo status=200`, `branch status=200`, metadata SHA-256 `2b8997e5dd81298c7c89f42dcae2fe77cad1badba32fa9d9d679a2912c81661f`)
- Status: source is relevant LLM evaluation/observability context, but not public AMC methodology proof by itself; no methodology version bump or source-specific product code added.

## Live source metadata

| Field | Value |
| --- | --- |
| full_name | `Agenta-AI/agenta` |
| html_url | `https://github.com/Agenta-AI/agenta` |
| description | `The open-source LLMOps platform: prompt playground, prompt management, LLM evaluation, and LLM observability all in one place.` |
| default_branch | `main` |
| latest default-branch HEAD | `a97e6083694586a5c5005aefe86272b8736e502f` |
| license | `NOASSERTION` / `Other` |
| created_at | `2023-04-26T09:54:28Z` |
| updated_at | `2026-06-20T13:17:29Z` |
| pushed_at | `2026-06-20T23:39:15Z` |
| stargazers_count | `4224` |
| forks_count / network_count | `552` / `552` |
| open_issues_count | `101` |
| watchers_count / subscribers_count | `4224` / `31` |
| archived / disabled / visibility | `false` / `false` / `public` |
| topics | `agents`, `evaluation`, `llm-as-a-judge`, `llm-evaluation`, `llm-framework`, `llm-monitoring`, `llm-observability`, `llm-platform`, `llm-playground`, `llm-tools`, `llmops`, `observability`, `prompt-engineering`, `prompt-management`, `rag-evaluation` |

The metadata SHA-256 is computed over AMC's compact, sorted JSON capture of the fields above plus the API statuses and branch commit URL. These facts are retained only as source-review identity metadata.

## Relevance decision

Agenta is relevant background for agent/LLM evaluation, prompt management, and observability vocabulary across Score, Shield, and Watch. The GAP dimension, however, is public methodology versioning. The live repository metadata does not define an AMC scoring-methodology version, public question-set migration, report-binding policy, Shield threshold policy, Watch drift policy, badge comparability rule, or deprecation/changelog requirement.

Therefore Agenta metadata alone must fail closed for public Score, Shield, and Watch methodology claims. Any accepted public-methodology claim still needs AMC-owned methodology versioning evidence: versioned scoring rules, changelog, deprecation notice, migration guidance, validation proof, signed evidence, badge assurance, row hashes, and no-copy proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background evaluation-platform context only; no accepted public scoring-methodology proof without AMC-owned methodology evidence. |
| Shield | Background risk/evaluation context only; no new safety threshold or badge assurance rule. |
| Watch | Background observability context only; no new drift methodology, monitor integration, or live evidence requirement. |
| Enforce | No direct scope for this gap. |
| Vault | No direct scope for this gap. |
| Fleet | No direct scope for this gap. |
| Passport | No direct scope for this gap. |
| Comply | No direct scope for this gap. |

## No-bloat boundary

No Agenta subsystem, SDK, importer, adapter, experiment-platform clone, registry mirror, benchmark runner, parity layer, public methodology version bump, or copied upstream code/prose/config/examples was added.
