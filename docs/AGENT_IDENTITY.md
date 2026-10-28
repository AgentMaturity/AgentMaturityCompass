# Agent identity, delegation and decision logs (P2-25)

AMC records which agent acted, on whose authority and with which credential. It does this by verifying identities that
other systems issue: SPIFFE/SPIRE, Microsoft Entra Agent ID, AWS AgentCore or any OIDC issuer the operator pins. AMC
keeps no identity directory of its own. Nothing in AMC creates, updates or deletes identities.

All support described here is **experimental**. Vendor agent-identity products and the IETF WIMSE drafts change
quickly, and the versions below are pinned so a change is a deliberate decision.

## What AMC verifies

| Credential | Attestor | Verified against | Result |
| --- | --- | --- | --- |
| JWT-SVID | `spiffe-jwt-svid` | JWT authorities pinned for the trust domain the token's `sub` names; `aud` must include the pinned audience; `exp` required | `observed` |
| X.509-SVID | `spiffe-x509-svid` | A chain from the leaf to an X.509 authority pinned for the leaf's trust domain; the leaf is not a CA and carries exactly one URI SAN that is a SPIFFE ID | `observed` |
| OIDC agent token (Entra Agent ID, AgentCore, generic) | `oidc-agent-token` | An issuer pinned in config, its pinned JWKS (inline, or the pinned HTTPS `jwksUri`), the pinned audience, `exp` | `observed` |
| Nothing presented | `amc-lease-only` | Nothing | `self_reported` |

A credential that verifies still identifies nobody until the workload trust config binds its subject (SPIFFE ID, or
issuer and subject) to the AMC agent id the run claims. An unpinned issuer, a key outside the pinned bundle, an expired
token, the wrong audience, a self-signed leaf or a leaf from another trust domain is refused.

Identity is not authorization. A verified identity grants no scope. Leases, the action policy and the compiled plan
still decide every call.

### What AMC does not verify

- Key possession for an X.509-SVID. `verifyWorkloadIdentity` checks the certificate chain only. The caller must pass
  the chain from a TLS session that already proved the peer holds the leaf's key.
- Token binding or proof-of-possession for JWTs (for example WIMSE workload proof tokens). A bearer JWT-SVID or agent
  token is accepted as a bearer credential.
- Revocation of SVIDs or agent tokens at their issuer. AMC relies on their short lifetimes and on its own lease and
  delegation-link revocations.
- Anything about the truth of what an identified agent says. A signature proves who wrote a record, not that it is
  true.

## The workload trust config

`.amc/workload-trust.yaml`, signed with the auditor key (`.amc/workload-trust.yaml.sig`). Publish it with
`publishWorkloadTrustConfig` (`src/identity/workload/workloadTrust.ts`), which signs through the auditor's key provider
before anything is written. A config that is present but unsigned or tampered is refused; it never reads as absent.

```yaml
v: 1
spiffe:
  trustDomains:
    - trustDomain: example.org
      audience: amc                       # the aud a JWT-SVID presented to AMC must carry
      x509Authorities: ["-----BEGIN CERTIFICATE-----..."]
      jwtAuthorities: [{ kty: EC, crv: P-256, x: "...", y: "...", kid: "..." }]
oidcAgentIssuers:
  - issuer: https://login.microsoftonline.com/<tenant>/v2.0
    audience: api://amc
    profile: entra-agent-id               # entra-agent-id | agentcore | generic; a label only
    jwksUri: https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys
services: [svc-nightly-close]             # service principals a delegation chain may start from
bindings:
  - agentId: payments
    spiffeIds: [spiffe://example.org/agent/payments]
    oidcSubjects: [{ issuer: https://login.microsoftonline.com/<tenant>/v2.0, subject: "<agent object id>" }]
```

There is no CLI for this file yet (the CLI freeze holds); a follow-up adds one under a freeze exception.

## Delegation chains

`src/agent/delegationChain.ts`. A chain is a list of signed links from a principal to the agent that acts:

- The root link's principal is a human (from an authenticated Studio session, keyed by identity provider and subject)
  or a service declared in the workload trust config. A chain that starts at an agent is refused.
- Each later link is delegated by the previous link's delegate. Its scopes and resources are subsets of its parent's
  (a parent `*` covers anything), its `notAfter` is no later, and its depth stays within
  `DEFAULT_MAX_DELEGATION_DEPTH` (3).
- Every link is signed by the workspace's `lease` key through the key-provider path. Only Studio or the lease
  authority signs links. A link an agent wrote fails verification.
- The chain digest is SHA-256 over the canonical links, signatures included.
- Revoking `link:<linkId>` (`delegationLinkRevocationId`) in the signed lease revocation list revokes that link and every chain through it. Revoking
  `agent:<agentId>` (P2-23 retirement) revokes every link that delegates to that agent.

`governedAs` keeps its meaning: a chain records who authorized a run. It never changes whose budget and guards govern
the run.

Verification results are cached per process by digest for at most one minute and never past the chain's earliest
`notAfter`. Validity windows and revocations are rechecked on every call.

## Lease v2

A lease issued with `delegation: { chainDigest, spiffeId }` is version 2. It carries `delegationChainDigest` and
`spiffeId` (the SPIFFE ID the issuer verified for the leaf delegate, or null). On every verification AMC loads the chain
by its digest from `.amc/delegation/chains/`, verifies it, and refuses the lease when the chain is missing, does not
verify, is revoked, does not end at the lease's agent and SPIFFE ID, or ends before the lease does. Version 1 leases
keep working.

The authorization record (P1-02) copies the chain digest and SPIFFE ID of a v2 lease into `delegation.chainDigest` and
`delegation.spiffeId`, next to the principal it already records.

### Regulated profiles

A workspace with an active compiled plan (P1-10, P1-12) runs a regulated profile. A plan journal that cannot be read
or verified also counts as regulated.

- Static agent tokens are refused: "static agent tokens are disabled for regulated profiles; use a lease". A request
  that carries a static token beside a lease is refused as a whole.
- The plan can cap lease lifetimes with the catalog parameter `toolPipeline.maxLeaseTtlMinutes` (enforced by the
  `identity-binding` guard, strictness `min`). Leases longer than the cap are refused at issuance and at every
  authorization-stage check. No shipped catalog control sets this parameter yet.

### Migrating off static agent tokens

1. Issue a lease per agent with `amc lease issue` and the same scopes the static token held.
2. Send it in `x-amc-lease` (or `Authorization: Bearer`) instead of `x-amc-agent-token`.
3. Remove the static token from the agent's environment before activating a compiled plan.

## Decision log

`src/governor/decisionLog.ts`. Each authorization decision writes exactly one entry to the ledger as an `audit` row
with `auditType: "AUTHZ_DECISION"`. Ledger rows are hash-chained and signed by the ledger writer. Entries are written:

- by the tool pipeline (P1-02's authorization stage), for every call with a bound authorization record, allowed or
  denied, and for a call refused at the authorization stage before its record bound;
- by ToolHub, for every intent decision.

A read the authorization stage never sees makes no decision and writes no entry.

### Field mapping

The entry follows the shape of the OpenID AuthZEN Authorization API 1.0 evaluation request and response.

| Entry field | AuthZEN | Source |
| --- | --- | --- |
| `subject.type`, `subject.id` | `subject.type`, `subject.id` | `"agent"`, the authorization record's `governedAs` |
| `subject.properties.spiffeId`, `delegationChainDigest` | `subject.properties` | the v2 lease, through the record's `delegation` |
| `subject.properties.principal` | `subject.properties` | the record's principal as `<kind>:<id>`; null for a self-reported OS user |
| `subject.properties.claimKind` | `subject.properties` | `observed` when a SPIFFE ID was verified at lease issuance, else `self_reported` |
| `action.name`, `action.properties.tool` | `action.name`, `action.properties` | the action class and tool name |
| `action.properties.argumentsDigest` | `action.properties` | the normalized arguments' digest; raw arguments are never stored |
| `resource` | `resource` | `{ type: "tool", id: <tool name> }`, with workspace, deployment and purpose |
| `context` | `context` | the record digest, the policy digest, control ids, session and run ids |
| `decision` | `decision` | true for allow |
| `reasons` | response `context.reason` | one per denial code |
| `pdp` | not in AuthZEN | `{ name: "amc", version }` |

Subject fields come only from AMC's own records. The record's `agentSuppliedMetadata` is never read.

Principal subjects are personal data. Exports that leave the operator's control should pseudonymize
`subject.properties.principal`.

## Integration notes

- **SPIRE.** Export the trust bundle (`spire-server bundle show -format spiffe`) and copy its X.509 and JWT authorities
  into `spiffe.trustDomains`. Rotate the config when the bundle rotates. AMC never contacts the SPIRE server.
- **Microsoft Entra Agent ID.** Pin the tenant's v2.0 issuer, the application ID URI AMC is registered under as the
  audience, and either the tenant JWKS URI or its keys. Bind each agent identity's object id as an `oidcSubjects` entry.
- **AWS AgentCore.** Pin the workload identity token issuer, audience and keys the AgentCore identity configuration
  publishes, and bind each workload identity's subject.

## Pinned specifications (research note)

Not verified: every row below must be re-checked against its primary source before release, and each pin recorded
with the exact revision or commit reviewed.

| Specification | Pinned version | Status in AMC |
| --- | --- | --- |
| SPIFFE ID (SPIFFE-ID.md, spiffe/spiffe standards) | the standard as published in the spiffe/spiffe repository; commit to be recorded at review | implemented (`parseSpiffeId`) |
| X.509-SVID (X509-SVID.md) | as above | implemented, chain only (`verifyX509Svid`) |
| JWT-SVID (JWT-SVID.md) | as above | implemented (`verifyJwtSvid`) |
| SPIFFE trust domain and bundle (SPIFFE_Trust_Domain_and_Bundle.md) | as above | authorities are pinned by hand into signed config |
| IETF WIMSE architecture and service-to-service drafts | draft revision to be recorded at review | experimental; no WIMSE token is verified yet |
| OpenID AuthZEN Authorization API | 1.0; exact draft or final revision to be recorded at review | decision-log field names only |
| Microsoft Entra Agent ID token format | vendor documentation as of review | experimental; verified as a generic OIDC JWT |
| AWS AgentCore identity token format | vendor documentation as of review | experimental; verified as a generic OIDC JWT |

JWTs are verified with P2-07's hardened verifier (`src/identity/oidc/jwtVerify.ts`): RS256, PS256 and ES256 only,
exactly one matching key, no `crit` header, and bounded clock skew. X.509 chains use `node:crypto` `X509Certificate`.
No new dependency was added.

## Regulatory mappings

NYDFS Part 500 (agents and their credentials in the asset inventory) and HIPAA §164.312 (unique identity and audit
controls) are candidate mappings for this evidence. They wait for expert review and are not claimed here. AMC output
is evidence of conformity, never proof of compliance.
