# AMC Threat Model (Expanded)

This document extends `SECURITY.md` with attack-path coverage and enforceable checks for security-critical boundaries.

## Security-Critical Trust Boundaries

1. **Evidence boundary** (agent ↔ monitor/ledger)
   - Goal: prevent forged or altered evidence.
2. **Control-plane boundary** (CLI/Studio/Gateway/ToolHub ↔ policy/signatures)
   - Goal: prevent unsigned policy/config from silently controlling privileged actions.
3. **Network boundary** (reverse proxies/clients ↔ Studio/Gateway APIs)
   - Goal: prevent spoofed client identity and unauthorized API access.
4. **Identity/approval boundary** (human approvals ↔ action execution)
   - Goal: prevent replay/forgery/escalation in approval-driven operations.
5. **Supply-chain boundary** (plugins/packs/bundles ↔ runtime)
   - Goal: prevent tampered artifacts from being accepted as trusted inputs.

## Threat Coverage Matrix (STRIDE-oriented)

| Threat | Example attack path | Enforceable check(s) |
|---|---|---|
| Spoofing | Fake source IP through `X-Forwarded-For` | Studio only trusts forwarded IP chain when the immediate peer is itself allowlisted; CIDR gate still enforced |
| Tampering | Modify signed policy/config or bundle payload | Signature verification fails closed for policy/config and artifact verification paths |
| Repudiation | Deny issued approval/receipt/evidence | Signed receipts + hash-chained ledger + correlation verification |
| Information Disclosure | Unauthorized API caller reads data | CIDR allowlist + auth session + route-level checks |
| Denial of Service | Abuse auth/write endpoints | Built-in rate limiters on auth/write/health classes |
| Elevation of Privilege | Bypass lease/approval/policy checks | Governor/ToolHub approval and policy signature gates; unsafe state downgrades trust and readiness |

## New Enforced Check Added

### Trusted proxy spoofing defense (Studio API)

**Threat:** an attacker directly reaches Studio and injects `X-Forwarded-For` to impersonate an allowlisted client.

**Check:** forwarded IP is only considered if the immediate remote peer is already allowlisted; otherwise Studio ignores `X-Forwarded-For` and uses socket source IP.

**Tests:**
- `tests/studioIpAllowlistProxyTrust.test.ts`
  - rejects spoofed forwarded IP from a disallowed peer.
  - accepts/denies forwarded client IP only when peer trust condition is met.

## Operational Guidance

- Keep `AMC_ALLOWED_CIDRS` narrow; do not use broad CIDRs unless required.
- Use `AMC_TRUSTED_PROXY_HOPS>0` only when traffic is forced through trusted reverse proxies.
- Pair public bind with signed LAN/proxy posture and explicit allowlists.
- Treat any signature failure as an active security incident until remediated.
