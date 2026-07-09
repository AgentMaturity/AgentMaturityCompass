# AMC Domain Proof Lane

The Domain Proof Lane is a bounded cross-surface capability for proving or failing closed on answer-level correctness claims. It is **not** a ninth AMC product surface. It is exposed through existing AMC surfaces:

| Surface | Role in Domain Proof Lane |
|---|---|
| Score | Separates evidence maturity from answer-level correctness proof. Unsupported correctness does not inflate score. |
| Shield | Tests fake proof refs, stale manifests, ambiguous rules, unsupported jurisdictions, and copied correctness claims. |
| Enforce | Allows, warns, blocks, or routes review based on `proven`, `disproven`, or `unsupported` proof status. |
| Vault | Hashes, signs, and binds manifests, proof artifacts, evidence refs, and proof traces. |
| Watch | Monitors source-manifest drift, coverage regression, stale effective dates, and recertification needs. |
| Comply | Turns source-to-rule traceability and proof limits into auditor-readable artifacts. |
| Fleet | Later rollups compare proof coverage across agents, teams, and domains. |
| Passport | Later portable passports can include `amcproof` refs without implying unproven correctness. |

## Proof taxonomy

AMC separates three proof classes:

1. **Evidence integrity proof** — AMC proves what happened, what was captured, what was signed, and what was not silently altered.
2. **Runtime policy proof** — AMC proves a run or action respected declared policy/runtime invariants.
3. **Domain correctness proof** — AMC proves or disproves that one answer follows one declared source-to-rule manifest.

Allowed `correctnessProofStatus` values:

- `proven` — checked against declared rule refs and bound to an `amcproof` artifact.
- `disproven` — checked and a failing source clause/counterexample was found.
- `unsupported` — no answer-level source-to-rule proof exists; this is the safe default.
- `not_applicable` — the claim is not an answer-level domain-correctness claim.

## Current P0 implementation

The current implementation is intentionally narrow:

- `src/domainProof/domainProofSchema.ts` — proof classes, correctness statuses, summary helpers, overclaim detection.
- `src/domainProof/domainProofArtifact.ts` — `amcproof` artifact schema with canonical hash binding and tamper detection.
- `src/domainProof/sourceRuleManifestSchema.ts` — source-to-rule manifest schema, source hash, clause hash, coverage verification.
- `src/domainProof/toyGovernanceRules.ts` — local toy governance fixture rules only.
- `src/domainProof/domainProofCheck.ts` — deterministic toy governance proof checker.
- `src/domainProof/domainProofCli.ts` — CLI-facing proof check helper.
- `src/api/domainProofRouter.ts` — `/api/v1/proof/status` and `/api/v1/proof/check`.

The toy governance fixture is local proof plumbing only. It is not law, policy advice, benefits advice, or a real entitlement system.

## CLI

```bash
amc proof check \
  --domain governance \
  --manifest fixtures/domain-proof/toy-governance/source-rule-manifest.json \
  --input examples/domain-proof/toy-governance/proven.json \
  --json
```

Examples:

```bash
amc proof check --domain governance --manifest fixtures/domain-proof/toy-governance/source-rule-manifest.json --input examples/domain-proof/toy-governance/proven.json --json
amc proof check --domain governance --manifest fixtures/domain-proof/toy-governance/source-rule-manifest.json --input examples/domain-proof/toy-governance/disproven.json --json
amc proof check --domain governance --manifest fixtures/domain-proof/toy-governance/source-rule-manifest.json --input examples/domain-proof/toy-governance/unsupported.json --json
```

Non-`proven` CLI checks set a non-zero exit code so CI/gates can fail closed.

## API

```http
GET /api/v1/proof/status
POST /api/v1/proof/check
```

`POST /api/v1/proof/check` body:

```bash
jq -n \
  --slurpfile manifest fixtures/domain-proof/toy-governance/source-rule-manifest.json \
  --slurpfile input examples/domain-proof/toy-governance/proven.json \
  '{domain:"governance",manifest:$manifest[0],input:$input[0]}' \
  | curl --fail-with-body \
      -H "x-amc-admin-token: $AMC_ADMIN_TOKEN" \
      -H "content-type: application/json" \
      --data-binary @- \
      http://localhost:3000/api/v1/proof/check
```

The HTTP API accepts schema-validated manifest and input objects. For the current toy lane, the manifest must also match AMC's canonical toy source text, clause hashes, review metadata, and source-to-rule structure; schema shape alone cannot produce `proven`. The API does not accept `outFile` and never writes a proof artifact to a caller-selected server path; use the artifact returned in the response. The local CLI remains file-oriented and supports `--out`.

For compatibility, HTTP path strings are temporarily accepted only under the built-in `fixtures/domain-proof/` manifest root and `examples/domain-proof/` input root. Absolute paths, traversal, non-proof workspace paths, files larger than 1 MiB, and symlinks escaping either realpath-checked root fail closed. Legacy path mode is deprecated and returns `requestMode: "legacy_fixture_path"` plus migration guidance.

The response includes:

- `result`: `proven`, `disproven`, or `unsupported`
- `ruleRefs`
- `assumptions`
- `constraintsChecked`
- optional `counterexample`
- `artifact`: the `amcproof` artifact
- `artifactHash`
- explicit `nonClaim`
- mapped AMC surfaces
- `requestMode`: `inline_json` or deprecated `legacy_fixture_path`

## API security and migration

The API contract changed on 2026-07-10 without changing Score methodology `2026.07.10-r221`: scoring, proof results, and artifact hashes are unchanged. The change closes a server filesystem boundary.

API clients should migrate from path strings to inline JSON objects. Remove `outFile` from HTTP requests and persist the returned `artifact` on the client side when needed. CLI scripts do not need to migrate.

Rejected requests return bounded errors. AMC does not echo host paths, attempted file names, file contents, or raw parser errors from this route.

## Open Compass Standard

`amcproof.schema.json` is part of the Open Compass Standard bundle. Schema validation proves artifact shape only. Correctness requires a `result: "proven"` artifact with rule refs, checked constraints, and valid proof bindings.

## Claim boundary

AMC proves what your agent did. Domain Proof Lane shows when a specific answer follows a declared rule set, and when it does not. If no declared rule set was checked, AMC says `unsupported`.
