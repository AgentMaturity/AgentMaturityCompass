# AMC-1478 - signed evaluator registry metadata

- Issue: `AMC-1478`
- Dimension: evaluator metadata identity, versioning, and integrity
- AMC surfaces requested: Score, Shield, CLI, Docs
- Source reviewed: [Agent Control repository](https://github.com/agentcontrol/agent-control)
- Retrieval: live first-party repository reviewed 2026-07-12
- Immutable source commit: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Shipped and production verified

## Relevance decision

Evaluator metadata is relevant because AMC already owns deterministic metrics, LLM judges, and assurance packs but did not expose one trustworthy current identity/version/hash catalog. Users could run those evaluators, but could not verify which loaded definitions a package claimed to contain.

The source signal is limited to the usability of explicit evaluator names, versions, descriptions, and availability. AMC keeps its own evaluator owners, schemas, signatures, trust rules, and result evidence model.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Publishes signed identity metadata for existing deterministic and LLM-judge evaluators; no score or methodology change. |
| Shield | Publishes signed identity metadata for existing assurance packs; no detector, scenario, or pack added. |
| Enforce | No runtime policy or authorization change. |
| Vault | Reuses existing auditor keys, domain-separated artifact signatures, atomic writes, and control-file locking. |
| Watch | Current loaded-inventory drift becomes explicit and fail closed; no monitor or background service added. |
| Fleet | No fleet registry, inheritance, or per-agent override. |
| Passport | No portable token, badge, or public proof-bundle change. |
| Comply | No framework mapping or legal claim changed. |

## Product closure

- Added one deterministic projection over the existing `MetricRegistry`, `ExtendedLLMJudgeEngine`, and assurance-pack catalog.
- Added `amc eval registry [--json]` as a read-only status command and `--refresh` as the only write action.
- Added one derived snapshot at `.amc/evaluators/registry.json`, protected by the existing control-file lock, atomic writer, auditor signer, and the domain-separated `evaluator-registry-manifest` artifact kind.
- Bound AMC-owned entries to the package version, package-relative owner module, implementation hash, definition hash, kind, categories, and Score/Shield surfaces.
- Kept runtime custom metrics visible as unverified, non-claimable entries without an AMC owner or version claim.
- Exposed one identical JSON/text status model: `uninitialized`, `trusted`, `partial`, `stale`, or `invalid`.

## Fail-closed rule

Missing signatures, tampered bytes, legacy or wrong artifact kinds, duplicate JSON keys, unknown fields, malformed schemas, duplicate or unsorted IDs, inconsistent counts, invalid definition hashes, invalid registry hashes, current package drift, and unverified custom evaluators cannot produce a trusted claim. Default inspection never auto-refreshes stale or invalid evidence.

## No-bloat boundary

No upstream code, prose, schema, evaluator, prompt, scenario, example, configuration, screenshot, or output was copied. AMC did not add an evaluator engine, registry service, database, marketplace, remote discovery, source-specific adapter, API route, Studio panel, scoring question, methodology version, or background refresh process.

Only package-relative module labels and SHA-256 fingerprints are emitted. Source bodies, evaluator prompts, scenario bodies, absolute paths, secrets, and credentials are not stored in the manifest.

## Verification

- Expected-red: focused suite failed only because the evaluator-registry module was absent.
- Initial green slice: 8 of 10 tests passed after the core projection/signature/fail-closed implementation; the remaining tests identified the intentionally missing CLI and docs surfaces.
- Final AMC-1478 regression: 1 file / 10 tests passed, including read-only no-write behavior, built-in override distrust, explicit signing, source/dist ownership, drift, tamper, wrong-kind, duplicate-key/ID, count/hash, CLI, and documentation boundaries.
- New-module coverage: 95.83% statements, 88.05% branches, 100% functions, and 99.05% lines.
- Adjacent evaluator, signature, command-count, Docs graph/artifact, brand, desktop, onboarding, and Runtime Firewall slices passed.
- Typecheck and clean build passed.
- Full Vitest passed at 1,074 files / 8,511 tests.
- The authoritative release gate passed syntax, OpenAPI parse, typecheck, clean build, adversarial regression, full Vitest, 1,164-command inventory, architecture at 24,395 CLI / 8,874 Studio lines, 1,496-file Docs drift, zero-vulnerability runtime audit, CLI/domain smoke, and all 10 isolated install personas. Receipt: `tmp/release-gate/amc-1478-final.json`.
- npm plus macOS universal, Linux x64, and Windows x64 packages built and verified. SHA-256: npm `91cc531bf4757289142ef8aea4de3c471728e0f1fc2561b03f10b06776b3703f`; macOS `5877371611133789638de9f3bf0f10a41b7a1c555041ce8f41815e0167bbe24b`; Linux `76595eef31b14b78800b50def4fee454f1e56a6ffa16534c18d75c4bbad3357d`; Windows `79bc0e58829789adacafb81883e131c5fba8c98d10754bb137867234bc01a55d`.
- Playwright passed 55 tests with 2 established conditional i18n skips, including the 173-guide Docs artifact and responsive CLI page.
- Implementation commit `9dc863f675b96e5c1524d042ff6e39d5cf0b2b72` passed exact-SHA CI `29192948558`, Pages `29192948560`, npm validation `29192948580`, and Docker Runner Image `29192948604`.
- Visual review identified one mobile Docs defect after the implementation deploy: table status tokens wrapped mid-word at 390 px. The follow-up `2d385f0e1fa050b4afc4f9b537811a227347b3b0` added a focused regression and a shared inline-code no-wrap rule; the final focused test, typecheck, 173-guide Pages build, 1,074-file / 8,511-test suite, 55-pass Playwright suite, and quick release gate all passed.
- Closeout commit `2d385f0e1fa050b4afc4f9b537811a227347b3b0` passed exact-SHA Pages `29193798301`, CI `29193798340` on Node 20 and 22 plus Helm/E2E/Docker/security jobs, and npm validation `29193798376` including prepack guardrails.
- Production `content-manifest.json` reports exact source revision `2d385f0e1fa050b4afc4f9b537811a227347b3b0`, 173 public guides, and evaluator-guide SHA-256 `fd1428d8c7d6bfc89af4a768336b8e3a983fb5a77273ff4f20a2ff71bb72b008`. Deployed evaluator guide, CLI page, homepage, and responsive stylesheet matched their local bytes; stylesheet SHA-256 is `a09b0c64167043e4cbffe84dd769c81474871df0169a23952091f39ab3ad055f`.
- Live browser checks passed at 1,440 px and 390 px for the homepage, expanded CLI evaluator group, and dynamically rendered evaluator guide with no missing copy, failed requests, console/page errors, or viewport overflow. The final 390 px production geometry check proved `TRUSTED`, `PARTIAL`, `STALE`, `INVALID`, and `UNINITIALIZED` each render on one line.
- Live release gate passed against `https://agentmaturity.co` (`tmp/release-gate/amc-1478-live.json`). Apex returned HTTP 200, `www` redirected to apex, and the Let's Encrypt certificate covers both SANs from 2026-06-26 through 2026-09-24.

Registry metadata is not evaluator-result evidence and never proves that an evaluator ran, passed, or supports a maturity claim.
