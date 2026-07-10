# DOCTOR

`amc doctor` is AMC's deterministic, context-aware local troubleshooting command.

## Commands

```bash
amc doctor
amc doctor --json
amc doctor --strict
amc doctor --strict --json
```

## Readiness modes

### Install readiness

When the current directory does not contain an `.amc` workspace, the default command verifies the installed CLI and Node runtime. It reports `mode: "INSTALL"`, marks the absent workspace as informational, skips workspace signatures and Gateway checks that cannot exist yet, and exits zero when the installation is healthy.

Run `amc` to initialize the workspace and generate its first evidence result.

### Workspace readiness

When `.amc` exists, doctor reports `mode: "WORKSPACE"` and runs the complete workspace checks below. Missing or invalid required configuration still fails closed.

### Strict readiness

CI, deployment, and production runbooks should use:

```bash
amc doctor --strict --json
```

Strict mode requires an initialized workspace. In an uninitialized directory it emits one bounded `workspace-initialized` failure, points to `amc`, and exits one. Text and JSON use the same `ok` value and exit status.

## What doctor checks

1. Node runtime version (`>=20`)
2. Workspace initialization state
3. Studio running status
4. Vault lock status
5. Signature status:
   - `action-policy.yaml`
   - `tools.yaml`
   - `budgets.yaml`
   - `approval-policy.yaml`
   - `adapters.yaml`
6. Gateway route mount checks:
   - `/openai`, `/anthropic`, `/gemini`, `/grok`, `/openrouter`, `/local`
7. ToolHub denylist sanity (`.amc` path access must be denied)
8. Lease carrier live checks (when Studio is running):
   - `Authorization: Bearer <lease>`
   - `x-api-key: <lease>`
9. Built-in adapter detection (`amc adapters detect`)

Doctor prints PASS/FAIL/WARN plus direct fix hints.

## Security guarantees

- Doctor never prints vault passphrases.
- Doctor never prints lease tokens.
- Doctor never prints provider secrets.
- Doctor bounds configuration errors and replaces the current workspace path with `.`.

## Common fix flow

```bash
amc up
amc vault unlock
amc fix-signatures
amc adapters init
amc adapters verify
```
