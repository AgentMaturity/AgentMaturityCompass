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

Runtime Firewall policies use the same journal primitive under `.amc/firewall/policy-revisions/`. The checkpoint root defaults to `~/.amc/control-checkpoints/` and can be relocated with `AMC_CONTROL_CHECKPOINT_DIR`. AMC resolves existing symlinks and rejects a checkpoint root inside or equal to the governed workspace because that would collapse the deletion boundary. The comparison is by whole path segments, so a directory such as `<workspace>/..cache` counts as inside; a sibling such as `<parent>/home` does not. The refusal names both paths and `AMC_CONTROL_CHECKPOINT_DIR`. In NOTARY trust mode, journal and checkpoint signatures cross AMC's existing notary signing boundary.

Compatibility sidecars use the `2026-07-10` schema. Their signed digest includes both artifact kind and content digest, so changing only `artifactKind` invalidates the signature. Journal revisions and checkpoints bind control kind, revision, payload digest, previous revision hash, workspace path hash, and signature in one atomically published JSON record. The external checkpoint directory also pins the genesis checkpoint hash, signer fingerprint, and signer type. Verification uses that pin plus each record's embedded public-key envelope instead of mutable workspace key history.

The control signer is intentionally fixed after genesis. AMC rejects a different signer rather than silently trusting key-history edits; this control plane does not claim automatic signer rotation. Plan a reviewed rebootstrap or use a stable NOTARY signer when key rotation is required.

## Runtime bindings and enforcement

Every guardrail reports `enforcement` (`enforced`, `observed`, `advisory` or `none`) and `boundary`, the point that enforces it. `boundary` is null exactly when `enforcement` is `none`.

| Guardrail ID | Enforcement | Boundary | Mutable here |
| --- | --- | --- | --- |
| `prompt-injection-detection` | `enforced` when its rule is effective, trusted and the firewall is in block mode; `observed` in observe or warn mode; else `none` | `runtime-firewall.rules.promptInjection` | Yes |
| `data-exfiltration-guard` | as above | `runtime-firewall.rules.secretExposure` | Yes |
| `context-window-guard` | as above | `runtime-firewall.rules.payloadAnomaly` | Yes |
| `tool-call-allowlist` | `enforced` in every native session | `tool-pipeline:guard:tool-allowlist` | No |
| `cost-budget-limit` | `enforced` in every native session | `tool-pipeline:guard:budgets` | No |
| `human-approval-gate` | `none` in the workspace listing; `enforced` in a session whose effective-policy receipt lists a compiled approval rule | `approvals` (in that session) | No |
| `audit-trail-enforcer` | `none` until P1-03 lands the tool-pipeline journal | none | No |
| `pii-redaction` | `none`: catalog reference; not enforced by AMC (P2-02 owns redaction) | none | No |
| `output-toxicity-filter` | `none`: catalog reference; not enforced by AMC | none | No |
| `hallucination-detector` | `none`: catalog reference; not enforced by AMC | none | No |
| `rate-limiter` | `none`: catalog reference; not enforced by AMC | none | No |
| `model-version-pin` | `none`: catalog reference; not enforced by AMC | none | No |
| `compliance-boundary` | `none`: catalog reference; not enforced by AMC | none | No |
| `credential-rotation` | `none`: catalog reference; not enforced by AMC | none | No |

Only the three Runtime Firewall rows can be requested here. The tool-pipeline rows are enforced by guards every native session composes, over their own signed configs (`.amc/tools.yaml`, budgets), so guardrail control state cannot turn them on or off. The catalog rows remain visible for product planning and profile transparency, but CLI, API, and Dashboard reject attempts to activate them. AMC does not treat PII detection as output redaction, decision logging as complete audit enforcement, or an approval module as a bound guardrail unless the runtime data path actually connects them.

Each native session also records the guardrails as it ran them in its effective-policy receipt (`EFFECTIVE_POLICY` audit row and a signed `.amc/effective-policy/<receiptId>.json`): a tool-pipeline row is `enforced` only when that session composed its guard. See [COMPILER.md](../catalog/COMPILER.md#activation-and-enforcement).

## Requested versus effective

Every bound status returns:

- `requestedEnabled`: signed intent in guardrail control state.
- `effective`: whether the bound Runtime Firewall rule is active.
- `binding`: the exact backing rule.
- `mutable`: whether this interface can change the request.
- `trusted`: whether the artifacts establishing effective status verified.
- `source`: guardrail state, Runtime Firewall policy, both, or neither; `tool-pipeline` or `catalog-only` for the rows this interface cannot change.
- `enforcement` and `boundary`: whether AMC enforces the guardrail, and where.
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

Profiles persist only their runtime-bound subset. The command lists every other guardrail in the profile with `(not enforced)`, or with `(enforced at <boundary>)` for the tool-pipeline rows, instead of claiming the full profile is effective. No profile can request a guardrail whose enforcement is `none`.

## Untrusted-input guard

The `untrusted-input-guard` preset asks you before the agent does something risky after it has read content AMC cannot
vouch for, such as a web page, an MCP tool's output or a file from outside the project.

```bash
amc guardrails profile untrusted-input-guard                  # on (enforce)
amc guardrails profile untrusted-input-guard --mode log-only  # watch first: changes no decision
amc guardrails profile untrusted-input-guard --mode off
amc guardrails list                                           # the last line shows the guard's mode
```

**What it may claim, and nothing more:** in Claude Code and Gemini CLI sessions that AMC's hooks govern, AMC asks for
approval before (or blocks) consequential calls made after untrusted input. It does not stop prompt injection. A call
made through a tool AMC cannot see is outside this claim. It works only where the hooks run in control mode
(`amc connect hooks install --provider claude-code --mode control`).

How it works:

1. **Each call is classified** by the table below. AMC records the result in the call's signed decision row.
2. **A session's labels come from those rows only**, for calls AMC let run. Labels only go up: nothing a tool returns, a
   file says or the agent writes can lower them, and no command clears them while the session runs. A new session
   starts with no labels. A call counts as soon as AMC allows it, so a sibling in the same batch counts before its
   PostToolUse arrives.
3. **Two rules run after your signed policies and can only make a decision stricter** (allow, then ask, then deny):
   - the session has read untrusted input, and this call is consequential: AMC asks a person (a signed AMC approval for
     this exact call, at least one approver even where the policy needs none);
   - the session has read untrusted input and private data, and this call sends data out: AMC denies it.
4. **Fail closed.** If AMC cannot read the session's labels (no session id, a damaged record, the ledger unavailable),
   a consequential call asks. If the guard's own setting cannot be read, the guard counts as on.
5. **Providers.** Claude Code and Gemini CLI get the ask. Pi, DSH and ACS have no AMC-backed ask, so they get a deny with
   the same words. Codex is observed only: its observation row records what the guard would have done; nothing is blocked.
6. **Log-only** changes no decision. Each decision row's `inputGuard.note` starts with "Log only, nothing was changed".
7. **MCP definitions.** `amc shield mcp-ledger <server files>` records each tool's description and input-schema digests in
   the workspace ledger and lists the tools whose digests changed since the last recorded scan. With the guard on, the
   next consequential call of a changed tool asks; once one call of that tool has run after the change (approved by a
   person while the guard is on), later calls are decided as before.

The message a person sees names the untrusted source and the action, for example: "This session earlier read a web page
(WebFetch), which AMC cannot vouch for, so a person must approve before the agent can send data out of this computer
(Bash: curl)."

Switching the guard on, to log-only or off writes a signed revision of the guardrail control state (the same authority as
any other profile change) and an `UNTRUSTED_INPUT_GUARD_CHANGED` audit row. A command run by an agent (any agent marker
in its environment, or a workspace in agent mode) cannot change it. Applying another profile, or enabling and disabling
guardrails, leaves the guard as it is.

### Classification table

Default-deny: a call AMC has no entry for counts as untrusted input and as an outbound send.

| Call (ToolHub tool) | Untrusted input | Private data | Outbound send |
| --- | --- | --- | --- |
| A tool whose ToolHub entry has `labels: [untrusted-input]` | yes | | |
| A tool whose ToolHub entry has `labels: [private-data]` or `protectedFields` | | yes | |
| Any MCP tool (ToolHub `context.kind: mcp`) | yes | | yes |
| `http.fetch` (WebFetch, web_fetch) | yes | | yes |
| `git.push`, and git subcommands AMC maps to it (fetch, pull, clone) | yes | | yes |
| `fs.read`, `glob`, `grep`, `ls` inside the workspace | | if a secret file | |
| the same outside the workspace | yes | if a secret file | |
| `process.spawn` of a local program (`ls`, `cat`, `grep`, `cp`, `rm` and the others in `LOCAL_PROGRAMS`), named bare or from a system folder, with only plain words, paths and the options listed for it | if an argument is outside the workspace, a URL or an expansion | if an argument is a secret file | |
| `process.spawn` of any other program (`rg`, `find`, `sort` and `jq` included), or a local one with an option not listed for it (`--pre=...`, `-f/path`) | yes | if an argument is a secret file | yes |
| `fs.write`, `fs.edit`, `apply_patch`; `git status` and `git commit` with the subcommand first and only their listed options | | | |
| `git status` or `git commit` with a global option (`-C`, `-c`, `--git-dir`) or an option not listed | yes | | yes |
| Any other tool | yes | | yes |

Any call whose ToolHub action class is `NETWORK_EXTERNAL` or `DATA_EXPORT` is an outbound send. A **consequential** call is an
outbound send or a call of class `WRITE_HIGH`, `DEPLOY`, `FINANCIAL`, `IDENTITY`, `SECURITY`, `NETWORK_EXTERNAL` or
`DATA_EXPORT`. A **secret file** is one under `~/.ssh`, `~/.aws`, `~/.gnupg` and the other credential stores the shell
sandbox denies, anything in this project's own `.amc` folder, or named like `.env*`, `id_rsa*`, `*.pem`, `*.key`, `.npmrc`,
`.netrc` or `credentials*`. Paths are judged where they really point: a symlink is followed, a path that does not exist
yet is judged by its nearest existing folder, and one AMC cannot resolve (a broken link) counts as outside the workspace.
Every plain argument of a shell program is checked as a path, not only those with a `/` or `~`.

Known limits: two calls a provider starts at the same moment can both be decided before either is recorded; a person
who can delete rows from the ledger can lower a session's labels (ledger verification reports that).

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
POST /api/v1/guardrails/profile  { "name": "untrusted-input-guard", "mode": "enforce" | "log_only" | "off" }
```

The local Dashboard server and Studio use these same workspace-scoped routes. Responses are not cached. Dashboard mutation requires a per-server HttpOnly capability cookie plus an exact loopback `Origin`; a page from another origin cannot toggle controls. If live integrity verification fails, Dashboard clears its cache, shows a visible integrity error, and renders build-time catalog metadata as read-only and unverified.

Mutation response codes are explicit:

- `400` malformed JSON or missing/invalid `name`;
- `403` missing Dashboard same-origin owner capability;
- `404` unknown guardrail or profile;
- `409` catalog-only control or failed state/policy integrity;
- `413` JSON body above 1 MiB;
- `423` control state lock timeout.
