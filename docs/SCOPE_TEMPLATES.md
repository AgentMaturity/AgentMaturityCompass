# Reusable Policy Scope Templates

AMC scope templates let an operator update one bounded group of existing action classes without replacing the rest of the signed Action and Approval Policy posture.

## Templates

| Template | Existing AMC action classes |
| --- | --- |
| `read-only` | `READ_ONLY` |
| `workspace-change` | `WRITE_LOW`, `WRITE_HIGH` |
| `release-external` | `DEPLOY`, `NETWORK_EXTERNAL` |
| `privileged-sensitive` | `SECURITY`, `FINANCIAL`, `DATA_EXPORT`, `IDENTITY` |

The four groups partition AMC's nine existing action classes. They do not introduce step-name selectors, regular expressions, provider semantics, or another policy language.

## Workflow

Initialize and review the two existing signed policy baselines once per workspace:

```bash
amc policy action init
amc policy approval init
```

Scope templates do not create a separate policy store. Workspace policies remain fleet-wide, so review the selected Policy Pack posture as a workspace-wide change before compiling it.

List the immutable catalog:

```bash
amc policy scope list
```

Preview selected rules from an existing built-in Policy Pack:

```bash
amc policy scope compile release-external --pack code-agent.high
```

The preview is read-only. It verifies the current Action and Approval Policy signatures, parses both baselines and the selected built-in pack through AMC's existing policy schemas, preserves every unselected rule and policy-level default, and returns a deterministic `scope-compile-...` ID.

Apply only after reviewing a fresh preview:

```bash
amc policy scope apply release-external \
  --pack code-agent.high \
  --confirm scope-compile-0123456789abcdef
```

Apply re-runs the compiler under AMC's control-file lock. A stale compile ID, changed baseline, invalid signature, malformed policy, duplicate action class, incomplete pack scope, or busy writer fails closed before mutation. Action and Approval Policy files use their existing paths, schemas, atomic writers, and auditor signatures. A write, signing, or post-verification failure restores all four prior policy/signature files.

Successful apply appends the existing transparency and ledger evidence. A semantic no-op writes neither policy nor success evidence.

## Fleet Boundary

AMC's Action and Approval Policies are workspace-wide. A scope template selects action classes, not agents or environments, so an applied change affects every registered agent that uses the workspace policies. The compiler and Studio show this boundary explicitly and never claim per-agent or per-environment scope.

## Studio And API

Studio exposes the same workflow on the Policy Packs page. Apply remains disabled until the typed confirmation exactly matches the latest preview ID.

The authenticated API contract is:

- `GET /api/v1/policy/scope-templates`
- `POST /api/v1/policy/scope-templates/compile`
- `POST /api/v1/policy/scope-templates/apply`

Catalog reads use normal read access, compile is a side-effect-free analyzer, and apply is owner-only. Invalid signed identity or trust configuration puts remote mutation into read-only mode.

## Evidence And Privacy

Public preview and apply responses contain template and pack identifiers, selected action classes, compile IDs, change booleans, hashes, and bounded status. They exclude policy bodies, absolute paths, credentials, signing material, prompts, tool payloads, and competitor content.

The verified control projection exposes `scopeTemplateIds` on Action and Approval controls. Runtime Firewall controls use an empty list because these templates do not alter Runtime Firewall semantics.
