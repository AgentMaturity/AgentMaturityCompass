---
"agent-maturity-compass": minor
---

A4 Assemble now reads its claims, phases and retry rules from AMC's shared sources (P2-37), behind the A4 preview (`AMC_A4_PREVIEW=1`).

- The IntegrationClaim path table projects the `claude-code` and `pi` paths from the adapter claim manifests (`docs/adapters/manifests/*.json`, P2-17). A path reads `enforced at hook:PreToolUse` or `enforced at pi:tool_call` only when that hook has role `enforce`, `onFailure: blocks`, the manifest has no problems, and the receipt hashes its qualification record. The claim then carries that record's SHA-256 and the qualified versions as `pinnedVersion`. Otherwise the path reads `preview` with the key (`P1-23`, `P1-22`) and the reason. A path with no manifest reads `unsupported`. The build copies each manifest with its record and receipt into `dist/adapter-claims`, so the npm package checks the same bytes at runtime. The other paths keep their hand-maintained rows. The path card shows the manifest source and the pinned version beside each claim.
- `enforcementBoundary` in `amc.a4-integration-claim/v1` accepts the reserved `acs:<hook>` form for P2-19. No table row sets it.
- Assemble's Review reports each build session's four execution phases from the execution contract (P2-13): `admission`, `model-completion`, `side-effect-completion` and `evidence-verification`, each with the contract's state and a detail. A call cancelled mid-flight reads `side-effect-completion: unknown` with detail `outcome_unknown`.
- Retrying a failed A4 effect follows the session resume rules (P2-12). When the action journal recorded the effect's execution, AMC first asks the system of record through `reconcile`. The retry is then refused unless nothing was applied: `EFFECT_RECONCILE_FIRST` while the outcome is unknown, `EFFECT_ALREADY_APPLIED` once it applied, and `EFFECT_INTEGRITY_FAILED` when the chain does not verify. An execution the journal never recorded keeps its one owner retry.
