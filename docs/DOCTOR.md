# DOCTOR

`amc doctor` is AMC's deterministic, context-aware local troubleshooting command.

## Commands

```bash
amc doctor
amc doctor --json
amc doctor --strict
amc doctor --strict --json
# Explicitly allow notary signing and gateway model requests (charges may apply):
amc doctor --live-probes
```

## Readiness modes

### Install readiness

When the current directory does not contain an `.amc` workspace, the default command verifies the installed CLI and Node runtime. It reports `mode: "INSTALL"`, marks the absent workspace as informational, skips workspace signatures and Gateway checks that cannot exist yet, and exits zero when the installation is healthy.

Run `amc` to initialize the workspace and generate its first evidence result.

### Workspace readiness

When `.amc/amc.config.yaml` exists, doctor reports `mode: "WORKSPACE"` and runs the local workspace checks below. Missing or invalid required configuration still fails closed. Default doctor does not contact the notary, sign a diagnostic digest, issue a diagnostic lease or send gateway model requests, even when Studio is already running. Local adapter version detection may run.

### Strict readiness

CI, deployment, and production runbooks should use:

```bash
amc doctor --strict --json
```

Strict mode requires an initialized workspace. In an uninitialized directory it emits one bounded `workspace-initialized` failure, points to `amc`, and exits one. Text and JSON use the same `ok` value and exit status.

`--strict` does **not** grant live-probe consent. `--live-probes` explicitly enables
the existing configured-notary health/signing checks and gateway model requests;
it may consume provider credits. JSON reports `liveProbes` and each executed or
skipped check. Unavailable probes are not counted as passing. Live gateway HTTP
requests have an absolute five-second deadline per request, including stalled
response bodies. A 4xx/5xx response, timeout or truncated response is a failed
probe, not proof the lease carrier worked. Even 2xx is only a completed request,
not independent proof of lease enforcement or task correctness.

The native SQLite check opens, queries and closes an in-memory database, so a
JavaScript wrapper that loads while its native addon has the wrong ABI cannot
establish PASS. It does not open or repair the workspace's database. Failure names
the rebuild/reinstall action without echoing raw dependency errors. A doctor pass
is not a governed-turn receipt, complete platform acceptance or release gate.

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
8. Lease carrier live checks (only with `--live-probes` and Studio running):
   - `Authorization: Bearer <lease>`
   - `x-api-key: <lease>`
9. Built-in adapter detection (`amc adapters detect`)

Doctor prints PASS/FAIL/WARN plus direct fix hints.

## Diagnostic output boundaries

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
