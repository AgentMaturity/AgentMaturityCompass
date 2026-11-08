# STUDIO

AMC Studio is the local control plane for operating AMC as an always-on app.

## Start / Stop

```bash
amc up
amc status
amc logs
amc down
```

`amc up` ensures workspace + vault readiness, then starts:
- gateway (`.amc/gateway.yaml` routes)
- proxy (if enabled in gateway config)
- dashboard server
- studio API server

State file:
- `.amc/studio/state.json`

Logs:
- `.amc/studio/logs/*.log`

Vault passphrase:
- After `amc up` remembers the vault passphrase, owner-mode commands in that workspace (`amc`, `amc verify`, `amc user init`, `amc user add`) use it only when an interactive operator runs them: stdin is a terminal, the workspace is not in agent mode and no agent marker is set; governance commands ask y/N first. `AMC_VAULT_PASSPHRASE` in the environment overrides it; agents started by AMC never receive it. See [VAULT.md](VAULT.md) for the full rule and its limits.

## Local API

Studio host/port come from runtime config (`AMC_BIND`, `AMC_STUDIO_PORT`). The dashboard port is `AMC_DASHBOARD_PORT` (default 4173); `amc dashboard build` writes `.amc/agents/<agent>/dashboard`, the directory Studio serves.
`amc up` defaults to localhost in local workflows.

Token file:
- `.amc/studio/admin.token`
- The admin token cannot create, revoke or re-role console accounts: `/users/add`, `/users/revoke` and `/users/roles` answer 403 to it. Sign in as an OWNER for those.

The first `amc up` creates the token file: mode 0600, 64 hexadecimal characters. AMC replaces a file that holds anything else (and says so on stderr), and never prints the token. `amc studio ping` and SDK clients send it as `x-amc-admin-token`; on A4 routes it reads only. `amc doctor` checks the file's mode and shape (`studio-admin-token`). To rotate it: `amc down`, delete the file, `amc up`. Every client holding the old value stops working at once.

Header required for protected endpoints:
- `x-amc-admin-token: <token>`

API surface boundaries:
- Lightweight module API: `/api/v1/*` (rate-limited; protected routes require a signed Studio session or the bootstrap admin token; agent and lease credentials are denied)
- Studio control plane API: `/*` (session/admin-token auth with RBAC on protected routes)
- Public bridge surface: `/bridge/*` (lease-auth integration surface)
- Reference: [API_SURFACES.md](./API_SURFACES.md)

Security note:
- Protected `/api/v1/*` routes use a centralized least-privilege policy: ordinary reads and explicitly side-effect-free checks are available to human roles; operational changes require `OPERATOR`/`OWNER`; verification, attestation, and approval use their named roles; secrets, identity, signing, keys, policies, and control-plane changes require `OWNER`.
- Keep Studio network-restricted even though protected `/api/v1/*` routes enforce Studio auth and role checks. Only the explicit public API compatibility routes bypass that gate.

CLI helper:

```bash
amc studio ping
```

## Typical Workflow

```bash
amc up
amc connect --agent <agentId>
amc supervise --agent <agentId> --route http://127.0.0.1:3210/openai -- <cmd...>
amc run --agent <agentId> --window 14d --target default
```
