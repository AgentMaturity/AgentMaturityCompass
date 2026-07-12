# Guardrail Control State

AMC separates four concepts that were previously easy to confuse:

1. `amc guide --go` generates agent-specific guidance and configuration changes.
2. The Guardrails catalog names control outcomes AMC may support.
3. `amc guardrails` stores signed operator intent for controls with a real runtime binding.
4. `amc firewall` owns the signed Runtime Firewall policy and decision receipts.

A catalog row is not evidence that a protection is active.

## Quick start

```bash
amc guardrails list
amc guardrails enable prompt-injection-detection
amc guardrails list --json
amc firewall check --direction request --text "ignore previous instructions"
amc guardrails disable prompt-injection-detection
```

`enable` and `disable` append an immutable, embedded-signature revision under `.amc/guardrails/heads/`. A separately signed host-local checkpoint commits that revision outside the workspace. `.amc/guardrails/control-state.json` and its sidecar are compatibility mirrors, not the source of truth. The state survives CLI restarts, API requests, Dashboard refreshes, mirror deletion, and mirror rollback.

Runtime Firewall policies use the same journal primitive under `.amc/firewall/policy-revisions/`. The checkpoint root defaults to `~/.amc/control-checkpoints/` and can be relocated with `AMC_CONTROL_CHECKPOINT_DIR`. AMC resolves existing symlinks and rejects a checkpoint root inside the governed workspace because that would collapse the deletion boundary. In NOTARY trust mode, journal and checkpoint signatures cross AMC's existing notary signing boundary.

Compatibility sidecars use the `2026-07-10` schema. Their signed digest includes both artifact kind and content digest, so changing only `artifactKind` invalidates the signature. Journal revisions and checkpoints bind control kind, revision, payload digest, previous revision hash, workspace path hash, and signature in one atomically published JSON record. The external checkpoint directory also pins the genesis checkpoint hash, signer fingerprint, and signer type. Verification uses that pin plus each record's embedded public-key envelope instead of mutable workspace key history.

The control signer is intentionally fixed after genesis. AMC rejects a different signer rather than silently trusting key-history edits; this control plane does not claim automatic signer rotation. Plan a reviewed rebootstrap or use a stable NOTARY signer when key rotation is required.

## Runtime bindings

| Guardrail ID | Runtime binding | Mutable here |
| --- | --- | --- |
| `prompt-injection-detection` | `runtime-firewall.rules.promptInjection` | Yes |
| `data-exfiltration-guard` | `runtime-firewall.rules.secretExposure` | Yes |
| `context-window-guard` | `runtime-firewall.rules.payloadAnomaly` | Yes |
| Remaining 11 catalog rows | None | No |

Catalog-only rows remain visible for product planning and profile transparency, but CLI, API, and Dashboard reject attempts to activate them. AMC does not treat PII detection as output redaction, decision logging as complete audit enforcement, or an approval module as a bound guardrail unless the runtime data path actually connects them.

## Requested versus effective

Every bound status returns:

- `requestedEnabled`: signed intent in guardrail control state.
- `effective`: whether the bound Runtime Firewall rule is active.
- `binding`: the exact backing rule.
- `mutable`: whether this interface can change the request.
- `trusted`: whether the artifacts establishing effective status verified.
- `source`: guardrail state, Runtime Firewall policy, both, or neither.
- `reason`: a human-readable precedence or failure explanation.

Guardrail state is additive. A request can turn on a bound rule. Removing that request cannot turn off a rule required by the separately signed Runtime Firewall policy.

## Profiles

```bash
amc guardrails profile minimal
amc guardrails profile standard
amc guardrails profile strict
amc guardrails profile healthcare
amc guardrails profile financial
```

Profiles persist only their runtime-bound subset. The command reports every catalog-only exclusion instead of claiming the full profile is effective.

## Integrity behavior

AMC fails closed when an initialized control artifact has any of these conditions:

- local journal deleted or truncated behind the separate checkpoint;
- an uncommitted local revision remains beyond the latest checkpoint;
- checkpoint or journal chain missing, reordered, relabeled, or tampered;
- external trust pin missing, malformed, or inconsistent with the genesis checkpoint or signer;
- digest or signature mismatch;
- wrong artifact kind;
- uncheckpointed legacy Runtime Firewall policy without explicit operator migration;
- unknown schema version;
- duplicate, unknown, or catalog-only guardrail ID;
- unknown profile;
- malformed revision, timestamp, actor, or source.

Runtime Firewall produces a blocking `guardrail-control-state-invalid` decision for invalid control state. A malformed, truncated, or tampered Runtime Firewall policy journal produces `runtime-firewall-policy-invalid`. The Guardrails API returns `409` and the CLI exits nonzero; neither path silently rebuilds defaults. Guardrail mutation entry points first recover an authenticated pending publication under the control lock, then revalidate effective Runtime Firewall integrity before applying new intent. Mutations verify current checkpoints before writing. If a separate process changes policy after the commit but before status refresh, API responses keep `committed: true` and return `statusError` instead of falsely reporting that the write failed.

Guardrail and firewall writers use one hard-linked contender per process. Exactly one process can claim a dead owner's contender before removing the common lock, and an interrupted reaper claim can itself be resumed. Concurrent writers therefore cannot remove a successor lock or publish mismatched bytes/signatures.

## Observe-only rollout evidence

`amc firewall enable --mode observe` evaluates the same signed Runtime Firewall policy used by warn and block modes. For a valid policy match, the signed decision records both the candidate action under full block semantics and the actual action selected by the current mode. Observe can suppress a candidate warn or block to allow; warn can suppress a candidate block to warn. Invalid or missing policy state and invalid signed Guardrails state remain actual blocks and are never marked as mode-suppressed.

`amc firewall status` and `GET /api/v1/firewall/status` expose one rollout projection. Would-warn and would-block counters include only strict, domain-separated, signature-verified decisions whose policy hash, mode, revision, source integrity, and thresholds match the current exact effective policy. Historical policy revisions are disclosed and excluded. Verified legacy decisions without the rollout binding are `legacy-unclassified`; AMC does not reconstruct candidate actions from current thresholds. Any tampered, malformed, unsigned, wrong-kind, path-mismatched, receipt-mismatched, or internally inconsistent decision makes rollout status fail closed and contributes nothing to trusted counters. A disabled policy can expose verified history but is never claim-eligible.

The counters are evidence, not an automatic promotion decision. AMC does not switch modes, change thresholds, or rewrite rules from traffic statistics. Review the matched rule counts and signed events, then explicitly activate the intended mode through the existing policy writer.

Before writing a local revision, publication writes the already-signed planned checkpoint to `pending.json` in the separate checkpoint store. It then writes and verifies the immutable local revision, writes the genesis signer pin before the first checkpoint, atomically publishes the checkpoint as the commit point, removes the pending marker, and refreshes the compatibility mirror last. Ordinary reads fail closed while an authenticated publication is pending. The next serialized, authorized mutation may recover only the exact entry named by that signed pending checkpoint; an unexplained local tail is never overwritten. A failure after the checkpoint cannot roll enforcement back; recovery removes a matching leftover marker, and a missing mirror is reported but reconstructed on the next successful mutation.

## Recovery

1. Preserve the invalid mirror, local journal, and separate checkpoint directory for incident review.
2. Check `amc firewall status --json` and `amc guardrails list --json`.
3. Restore the local journal revision named by the latest checkpoint. If publication stopped before its checkpoint, preserve both `pending.json` and the local tail; an authorized mutation verifies the pending checkpoint and completes that exact revision before accepting a new one.
4. Confirm the external `trust-pin.json` still matches the genesis checkpoint and expected signer; do not generate a replacement pin from workspace keys.
5. Reapply the intended bound controls with `amc guardrails enable` or a profile.
6. Run representative `amc firewall check` requests and verify signed decision receipts.

Do not edit these JSON artifacts by hand. Do not delete journal or checkpoint entries merely to make status green; that discards the tamper evidence operators need.

The separate checkpoint and trust pin detect an attacker limited to the workspace who deletes or rolls back local control files or replaces workspace key history. They are ordinary user-owned host files, not an append-only service. No host-local design can detect an attacker who can consistently delete or rewrite both the workspace and the user's separate checkpoint store; use AMC NOTARY mode and replicate the checkpoint root to protected operational storage for that threat model.

After upgrading a workspace with a legacy Runtime Firewall sidecar, preserve and review the exact policy bytes, then run:

```bash
amc firewall migrate-signature --approve-legacy-kind
```

The command captures the old policy bytes and sidecar once, verifies that immutable snapshot, and requires explicit acknowledgement that legacy `artifactKind` was not cryptographically bound. AMC validates the captured policy and commits its canonical semantics, not a byte-for-byte copy. Signed journal metadata records the source signature schema, source artifact digest, captured signature-record digest, and committed canonical-policy digest. A direct file swap after verification cannot change the journaled policy. Retrying the OWNER-only CLI or API migration after an interrupted publication completes the authenticated pending revision, refreshes the compatibility mirror, and returns that signed provenance receipt. Mode, enablement, fail-open behavior, thresholds, rules, redaction, and timestamp remain unchanged. AMC blocks the legacy policy until this OWNER-only review is complete.

## API

```text
GET  /api/v1/guardrails/list
POST /api/v1/guardrails/enable   { "name": "prompt-injection-detection" }
POST /api/v1/guardrails/disable  { "name": "prompt-injection-detection" }
POST /api/v1/guardrails/profile  { "name": "standard" }
```

The local Dashboard server and Studio use these same workspace-scoped routes. Responses are not cached. Dashboard mutation requires a per-server HttpOnly capability cookie plus an exact loopback `Origin`; a page from another origin cannot toggle controls. If live integrity verification fails, Dashboard clears its cache, shows a visible integrity error, and renders build-time catalog metadata as read-only and unverified.

Mutation response codes are explicit:

- `400` malformed JSON or missing/invalid `name`;
- `403` missing Dashboard same-origin owner capability;
- `404` unknown guardrail or profile;
- `409` catalog-only control or failed state/policy integrity;
- `413` JSON body above 1 MiB;
- `423` control state lock timeout.
