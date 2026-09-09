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
