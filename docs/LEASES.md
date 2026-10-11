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

Since P1-08 revocations are one signed, sequenced file:
- `.amc/studio/leases/revocations.signed.json` (an `amc.revocation-list`, listId `leases:<workspaceId>`; see [KEY_LIFECYCLE.md](KEY_LIFECYCLE.md))

Its signature (revocation-list purpose) covers the whole list, including a strictly increasing `sequence` and the
previous list's digest. Each write is also appended to the workspace transparency log and recorded in this machine's
high-water file (`<AMC home>/state/high-water.json`). Every consumer refuses every lease when the list is older than an
accepted sequence (`ROLLBACK_DETECTED`), differs from the accepted list at the same sequence (`FORK_DETECTED`), or is
missing after a list was anchored: restoring an old copy or deleting the store never un-revokes a lease, and the next
revoke cannot make such a rollback permanent.

Upgrading from 1.x: a workspace with `revocations.json` and `revocations.json.sig` keeps working until the first write.
That write signs the pair's content as sequence 1 with `previousSha256` set to the old list's digest, replaces the old
signature with a tombstone and removes the old list, so a 1.x binary that reads the workspace afterwards finds a
signature without its list and refuses every lease instead of reading an empty store. A 1.x pair restored beside the new
file is ignored for every decision and named in the reason of the store's signature check
(`verifyLeaseRevocationsSignature`). A half pair (the
list or the signature missing) with no new file refuses every lease. Downgrading is unsupported.

Ordinary `amc lease revoke` authenticates the exact existing list before appending an ID. A tampered, unsigned,
malformed, rolled-back or partially missing store is refused without rewriting its evidence; revoking another lease is
not a repair. `revokeLease` takes an optional `expiresTs` from the verified lease payload; the next write prunes rows
whose lease expired more than five minutes ago, so the list stays below its 64 MiB cap. Rows without one are kept.

Store files are reached only through real directories below the workspace, without following a symbolic link, and must
be regular files with one link (at most 64 MiB for a list). A symlink, FIFO, device, hard link or oversized file in their
place is an unverifiable store: every lease is refused, and no reader blocks on it.

`amc lease resign-revocations --expect-digest <sha256>` is the deliberate repair. It signs only the reviewed bytes and,
under the revocations lock, refuses when the digest differs, the list is missing, or it fails the revocation schema.
For the signed file it re-signs, as the next sequence, only the content the transparency log last anchored: it can mend a
broken signature (for example after a key rotation dropped the old key) but never un-revoke. For a 1.x list it signs the
reviewed content as sequence 1, and only while nothing was anchored. If only an older copy survives, every lease stays
refused; restore the newest list.

The first-store bootstrap (`amc lease issue`, managed hooks, the demo) publishes an empty sequence 1, only while no store
file exists when checked under the lock, and never once a list was anchored.

How a list is published (revoke, resign and bootstrap share one path, serialized by one lock):

1. The next list is signed, and the signature is verified against the revocation-list key history (the auditor key history before the workspace migrated) before anything is written.
   A locked vault, `AMC_NO_SIGN=1` or a key that does not match the history refuses here.
2. The signed list is staged as `revocations.signed.json.pending`, appended to the transparency log, then written in
   place with its anchor and recorded in the high-water file; the stage is removed.
3. A crash after the log entry rolls forward on the next read or write; a crash before it discards the stage.

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
