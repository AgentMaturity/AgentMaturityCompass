# Leased Access Tokens

AMC uses short-lived signed leases to authorize agent access to gateway/proxy/toolhub.

## Why

- Prevents unauthorized processes from calling AMC services as an agent.
- Adds deterministic scope/route/model/rate enforcement.
- Makes access revocable without rotating long-lived credentials.

## Token Format

`<base64url(payload)>.<base64url(signature)>`

Payload fields include:
- `leaseId`, `issuedTs`, `expiresTs`
- `agentId`
- `scopes` (for example `gateway:llm`, `toolhub:intent`, `hook:observe`)
- `routeAllowlist`, `modelAllowlist`
- `maxRequestsPerMinute`, `maxTokensPerMinute`, `maxCostUsdPerDay`
- `nonce`

Signed with Studio lease signing key (Ed25519, vault-backed).

## Commands

```bash
amc lease issue --agent <id> --ttl 60m --scopes gateway:llm,toolhub:intent --routes /openai --models "gpt-*" --rpm 60 --tpm 200000
amc lease issue --agent hook-agent --ttl 30m --scopes hook:observe --routes /hooks --models "*" --rpm 60
amc lease verify <token>
amc lease revoke <leaseId>
```

Revocations are stored at:
- `.amc/studio/leases/revocations.json`
- `.amc/studio/leases/revocations.json.sig`

## Enforcement

- Gateway requires `x-amc-lease` for agent-attributed traffic.
- Proxy requires lease for CONNECT.
- ToolHub requires lease for intent/execute endpoints.
- Provider-neutral Bridge hooks require `hook:observe`, an allowed `/hooks` route, and the lease request budget. Budget consumption is a cross-connection SQLite transaction performed before body parsing, so concurrent and malformed authenticated attempts count and fail closed if quota storage is unavailable.
- Denials generate audit events such as:
  - `LEASE_INVALID_OR_MISSING`
  - `LEASE_AGENT_MISMATCH`
  - `LEASE_SCOPE_DENIED`
  - `LEASE_ROUTE_DENIED`
  - `LEASE_MODEL_DENIED`
  - `LEASE_RATE_LIMITED`
