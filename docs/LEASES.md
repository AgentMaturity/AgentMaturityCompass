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
amc lease revoke --lease-id <leaseId> --reason <reason>
amc lease resign-revocations --expect-digest <sha256>
```

Revocations are stored at:
- `.amc/studio/leases/revocations.json`
- `.amc/studio/leases/revocations.json.sig`

Ordinary `amc lease revoke` authenticates the exact existing revocation snapshot
before appending an ID. A tampered, unsigned, malformed or partially missing store
is refused without rewriting its evidence; revoking another lease is not a
repair operation and must not certify altered older revocations. Only a genuinely
absent list **and** signature use first-store bootstrap behavior.

Review and restore the approved history before using a deliberate repair command.
`amc lease resign-revocations` signs only the reviewed bytes: copy the list, review
the copy, and pass its digest (`shasum -a 256 <copy>`) as `--expect-digest`. Under
the revocations lock the command hashes the list it is about to sign and refuses,
signing nothing, when the digest differs or the list is missing. To deliberately
start over with an empty list, move both files aside; the next `amc lease issue`
bootstraps a new store.

The first-store bootstrap (`amc lease issue`, managed hooks, the demo) publishes only
the built-in empty list, and only while neither file exists when checked under the
lock. A list that appears without a signature is never signed by the bootstrap; it is
reported invalid until reviewed and re-signed as above.

How a list is published (`amc lease revoke`, `amc lease resign-revocations` and the
first-store bootstrap in `amc lease issue` all use the same path, serialized by one
lock):

1. The signer signs the exact next list bytes, and the signature is verified against
   the auditor key history. A locked vault, `AMC_NO_SIGN=1` (ephemeral keys) or a key that
   does not match the history refuses here, and neither file changes.
2. Both files are written under temporary names, then the list is renamed into
   place, then the signature.
3. The published pair is verified again; a failure is reported as an error.

Two renames are not one atomic step. A crash between them leaves a new list beside
the old signature. That pair does not verify, so every consumer refuses every lease
(fail closed; no lease is admitted against an unverified list) until the owner
reviews the list and runs `amc lease resign-revocations --expect-digest <sha256>`. Keep the original bytes
and operator evidence when diagnosing such a failure.

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
