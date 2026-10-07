# Studio agent credentials

Studio binds agent identity before a tool intent can execute. If a request carries
both a static agent token and a lease, they must name the same agent. The request
receives only scopes that every supplied credential permits. A static token does
not override a narrower, expired, revoked or unverifiable supplied lease.

This source correction is tracked in AMC-1546. Combined source, HTTP execution,
security mutation and installed-package qualification is pending; this guide is
not an acceptance receipt.

## Supplying credentials

A static agent token can use `X-AMC-Agent-Token` or `Authorization: Bearer`.
A signed lease can use `X-AMC-Lease`, `Authorization: Bearer`, `X-Api-Key`,
`X-Goog-Api-Key` or `Api-Key`. To send both, use the static token in
`X-AMC-Agent-Token` and the lease in `X-AMC-Lease`. Keep credentials in the normal
secret references or request headers; do not paste them into issue reports.

Every supplied agent credential is checked. Different agents, malformed values,
invalid signatures, expired/revoked leases or an unverifiable revocation list
refuse agent authentication. Additional lease carriers narrow scopes; they do
not provide fallback credentials. Duplicate security header names are refused,
including duplicate Authorization values that the HTTP library would otherwise
collapse. A URL `amc_lease` is accepted only when the existing gateway
configuration explicitly enables the query carrier, and may appear only once.

For a refused request, supply one current agent identity and a matching valid
lease with the required scope. Remove stale credentials from other carriers,
renew an expired lease through the existing operator workflow, or have an
operator deliberately issue the intended authority. Do not broaden a signed
policy just to conceal a refusal.

## Static token grants

Since integration commit `2eed9bee` a static agent token is minted only under a
grant, and the grant comes from the signed action policy (`.amc/action-policy.yaml`
and its `.sig`): `toolhub:intent`, `governor:check` and `receipt:verify` when the
policy has at least one rule, `toolhub:execute` only when a rule sets
`allowExecute: true`, and an `executeActionClasses` list naming exactly the action
classes whose rule allows execute. A missing or invalid policy signature refuses the
mint and writes nothing; `GET /agents` then reports the agent with empty scopes and
the refusing file instead of minting.

The token's meta file (`.amc/studio/agent.tokens/<agent>.token.meta.json`, version 2)
records the scopes, the execute action classes and `grantedBy`. An issued token keeps
the grant it was issued with even when the live policy later widens; widening is an
operator act (edit and re-sign the policy, then remove the token and meta so
`GET /agents` mints under the current policy, or issue one with an explicit grant).
A meta written before version 2 keeps its scopes but covers no execute action class
until the token is re-issued.

`POST /toolhub/execute` refuses a static-token request whose grant does not cover
the intent's action class before any intent, ticket or approval is consumed. Every
scope refusal on the scope-gated routes keeps its `missing scope <scope>` error and,
for a static-token agent, adds `refusedBy` (the meta path, scopes, execute classes
and grant source) and `widen` (the exact operator steps). A lease may name
`executeActionClasses`; `toolhub:execute` then covers only those classes, for the lease
itself on `POST /toolhub/execute` and for agent tokens minted from it. A lease that names
none leaves a lease-only execute to the governor's signed action policy alone; that
boundary is asserted by `tests/studioAgentTokenScopes.test.ts`, not claimed as a guard.

## Tool execution and compatibility

`/toolhub/intent` and `/toolhub/execute` still perform their independent signed
lease checks for the target agent and operation. A static token alone cannot
replace that execution lease. The execution route checks the authenticated
agent against the intent owner before dispatch, ticket/approval consumption or
execution metrics. A forbidden response must not be the first indication that
work already happened.

Legacy static-token-only checks and read access remain supported by their
existing scopes. Static-token possession alone is therefore not a claim that a
request is delegation-lease constrained. To constrain a child, give it the
intended lease and keep broader parent credentials out of its environment.
Rotating or changing new token defaults would not revoke older static tokens.

Human sessions and bootstrap administration retain their existing precedence,
role, cookie and CSRF controls. This change does not grant agent credentials
access to the human-only native task or operator command surfaces. Existing
route-specific policy, model, budget and tool controls still apply; intersected
scope credentials do not independently prove those controls or process
confinement. No production credentials are generated, changed or exposed by
this implementation.
