# RBAC

AMC Studio enforces local-first role-based access control using signed `/.amc/users.yaml`.

## Roles
- `OWNER`: full control; can unlock vault, sign configs, issue certs, lift freezes.
- `AUDITOR`: verify/attest; can co-sign approvals where policy requires it.
- `APPROVER`: approve/deny execution intents; cannot mutate signed policy/targets.
- `OPERATOR`: run diagnostics/assurance/exports; no signing unless also `OWNER`.
- `VIEWER`: read-only reports/console.
- `AGENT`: read-only self-check and lease-scoped endpoints only.

## Security Model
- Passwords are stored as salted scrypt hashes in `/.amc/users.yaml`.
- `/.amc/users.yaml` is signed (`/.amc/users.yaml.sig`) by auditor key.
- If users signature is invalid, Studio enters read-only protection for write endpoints.
- Console authentication uses `POST /auth/login` and HttpOnly `amc_session` cookie.
- Admin bootstrap token remains available for CLI/emergency operations.
- Internal `/api/v1` routes reject agent and lease credentials even when those credentials carry gateway or ToolHub scopes.

## Module API least-privilege policy

Studio authorizes protected `/api/v1` requests before dispatching them to a module router.

| Request class | Allowed roles |
| --- | --- |
| Ordinary read | `VIEWER`, `OPERATOR`, `APPROVER`, `AUDITOR`, `OWNER` |
| Explicitly side-effect-free analyzer | `VIEWER`, `OPERATOR`, `APPROVER`, `AUDITOR`, `OWNER` |
| Verification | `OPERATOR`, `AUDITOR`, `OWNER` |
| Attestation | `AUDITOR`, `OWNER` |
| Approval or execution-ticket issuance | `APPROVER`, `OWNER` |
| Operational state change | `OPERATOR`, `OWNER` |
| Secret, identity, signing, key, policy, certificate, or control-plane change | `OWNER` |

A4 Forge routes (`/api/v1/a4`, served only with `AMC_A4_PREVIEW=1`) add pattern-matched classes beside these sets (`src/api/accessPolicy.ts`). `POST …/comments` and `POST …/presence` take the read roles, and the A4 router then requires project membership. `POST …/gates/:gateId/request-changes` takes `APPROVER`, `AUDITOR` or `OWNER`. `POST …/gates/:gateId/approve` and `…/deny` take `APPROVER`, `AUDITOR` or `OWNER`, as Studio's engine approval route does; the gate's own `rolesAllowed` then limits `AUDITOR` to the action classes whose signed rule admits it (by default `SECURITY`, `FINANCIAL`, `DATA_EXPORT` and `IDENTITY`), so under the defaults an auditor cannot approve or deny a `WRITE_*`, `DEPLOY` or policy gate (403 `PRINCIPAL_ROLE_INSUFFICIENT`) but can cast the `AUDITOR` vote that Adapt completion requires. Hold, resume, reopen, tune, members, gate-policy, acknowledge, effect open and retry, releases, and Adapt or Activate completion take `OWNER`. Retire takes `OPERATOR` or `OWNER`, and the router then requires a workspace `OWNER` or the creator of a project that never reached `proposed`.

Vault secret reads are owner-only. Studio log reads require `OPERATOR`, `AUDITOR`, or `OWNER`. Unknown state-changing routes default to `OPERATOR`/`OWNER`, and unsupported methods require `OWNER`; neither case falls back to viewer access.

## Commands
- `amc user init`
- `amc user add --username <name> --role <ROLE>`
- `amc user list`
- `amc user revoke <username>`
- `amc user role set <username> --roles OWNER,APPROVER`
- `amc user verify`
