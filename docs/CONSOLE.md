# CONSOLE

Compass Console is the interactive owner cockpit served by AMC Studio.

- URL: `http://127.0.0.1:3212/console` (default)
- Host binding: localhost only by default
- Auth: username/password login (`/auth/login`) with HttpOnly `amc_session` cookie
- Fallback auth: bootstrap admin token for CLI/emergency ops

## Start

```bash
amc up
amc status
```

`amc up` prints Studio, gateway, proxy, and dashboard URLs.

## Security Model

- No external CDNs; console assets are local.
- Session cookies are `HttpOnly` + `SameSite=Strict`.
- Admin token is fallback-only and should not be shared with agents.
- RBAC enforced per endpoint (`OWNER`, `AUDITOR`, `APPROVER`, `OPERATOR`, `VIEWER`, `AGENT`).
- Console never displays provider keys, vault passphrases, or full lease tokens after initial issue.
- All write actions generate observed audit evidence in the ledger.

## Main Views

- `Home`: service health, fleet summary, trust/integrity tiles.
- `Login`: credential sign-in + optional pairing workflow.
- `Agent`: score, radar, heatmap, provider/model last-seen, evidence coverage.
- `Equalizer`: 67 sliders with deterministic what-if preview and signed apply.
- `Governor`: action-class allow/deny matrix with reasons.
- `ToolHub`: allowed tools, recent executions, denials, receipt verify actions.
- `Approvals`: quorum progress, dual-control decisions, single-shot consumption.
- `Users`: owner-managed user/role administration.
- `Leases`: active lease metadata (no token disclosure), expiry, revoke.
- `Budgets`: usage vs limits, consequences, signed update path.
- `Drift`: incidents, freezes, run drift checks, freeze lift flow.
- `Benchmarks`: imported ecosystem benchmarks, percentiles, scatter/heatmap.
- `Transparency`: append-only issuance log + client-side seal verification.
- `Policy Packs`: list/diff/apply signed golden configs by archetype+risk.

## Device Access

- Phone/tablet/desktop access is supported.
- Use local network routing only when intentionally exposing Studio; keep localhost default for safest operation.
- Pairing QR should contain URL only, never admin token.
