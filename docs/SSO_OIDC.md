# SSO OIDC (Auth Code + PKCE)

AMC supports host-level OIDC login for multi-workspace deployments.

## Add an OIDC Provider

```bash
amc identity provider add oidc \
  --host-dir /path/to/amc-host \
  --id okta \
  --display-name "Okta" \
  --issuer https://your-issuer.example.com \
  --client-id your-client-id \
  --client-secret-file /secure/path/oidc-client-secret.txt \
  --redirect-uri https://amc.example.com/host/api/auth/oidc/okta/callback
```

Optional:

- `--scopes openid,email,profile,groups`
- `--use-well-known true|false`
- `--authorization-endpoint ...` (when discovery disabled)
- `--token-endpoint ...`
- `--jwks-uri ...`

## Login Flow

1. `GET /host/api/auth/oidc/:providerId/login`
2. AMC generates `state`, `nonce`, PKCE challenge.
   The host database stores a hash of the state and its pending nonce/verifier for ten minutes.
3. Browser is redirected to IdP authorization endpoint.
4. Callback arrives at `/host/api/auth/oidc/:providerId/callback`.
5. AMC validates:
   - atomic single-use state consumption, provider binding and expiry
   - the S256 PKCE exchange and exact non-empty nonce
   - exact issuer, audience and authorized party (`azp`)
   - required finite `exp` and `iat`, a non-empty `sub`, and optional `nbf`
   - an allowed asymmetric signature and a compatible JWKS key
6. AMC maps roles from signed `identity.roleMapping.rules`.
7. AMC creates host session cookie and redirects to `/host/console`.

## Security Notes

- PKCE is required.
- Accepted algorithms are `RS256`, `PS256` and `ES256`. RSA keys must have at least 2048 bits; ES256 requires P-256. `EdDSA`, `none` and symmetric algorithms are refused by this implementation. This narrows the previous EdDSA acceptance.
- JWK algorithm, signing use and key type must match. A supplied `kid` matches exactly; a token without `kid` requires exactly one compatible key. Unsupported critical headers are refused.
- ID tokens require `exp` and `iat`. AMC refuses expired tokens and tokens issued more than ten minutes ago or in the future, allowing its bounded clock skew. `nbf` is optional and checked when present. `azp` must equal the client ID when supplied, and is required for multiple audiences.
- `email_verified` must be exactly `true`; mapped email and subject are required. There is no issuer-email trust bypass or shared-tenant issuer expansion.
- Discovery must return the configured issuer exactly. Discovery, authorization, JWKS and token URLs require HTTPS, with no userinfo or fragments. Server fetches refuse redirects and non-public addresses, pin their resolved address, time out after ten seconds and cap JSON bodies at 1 MiB.
- JWKS keys are cached for five minutes. An unknown key can trigger one refresh per URI per minute; concurrent refreshes share a request. Failed fetches retain the last good keys and never authorize an unknown key. Empty key sets are refused.
- Pending state survives a process restart within its ten-minute window. Saving state purges expired entries and refuses new logins when its bounded store is full. Consumption happens before the token exchange; failed callbacks must start a fresh login.
- Identity failures exposed by the existing router use fixed messages. Provider response bodies and raw network errors are not sent to the browser.
- Role grants are never accepted directly from unmapped claim values.
- OIDC client secret is read from host vault via `clientSecretRef`.

`AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK=1` permits literal `127.0.0.1` or `[::1]` endpoints for local identity development. It does not allow `localhost`, other private addresses or a DNS name that resolves inward. It is unset by default. Private-network identity providers require a separately reviewed address policy; previously accepted HTTP/private URLs now fail login rather than breaking configuration loading.

## Current boundaries

The pending-state store requires verifiable POSIX ownership and enforces owner-only host-directory and DB/WAL/SHM permissions. It fails closed where ownership cannot be verified, including the current Windows path. It does not encrypt database backups; preserve the host's access controls when copying them. The store caps pending logins at 1,000 per host.

The current router does not bind the pending state to a browser cookie or revoke the previous session when replacing its cookie. Durable single-use state alone does not close login CSRF or session-fixation concerns. Those router changes remain a follow-up, including a `SameSite=Lax` correlation cookie for the IdP redirect.

This change adds no provider configuration knobs or CLI commands. Existing signed identity YAML remains valid. It does not add standard SAML, SCIM fixes or recorded Okta/Entra interoperability. Source implementation remains unqualified while executable checks are deferred.

The claim policy follows [OpenID Connect Core's ID token and validation sections](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation). The ten-minute issuance window and algorithm restriction are AMC policy. AMC does not use the returned access token, so this login path does not add `at_hash` validation.

## Redirect URI Guidance

Use the externally reachable HTTPS URL:

- `https://<your-amc-host>/host/api/auth/oidc/<providerId>/callback`

This must exactly match the IdP application configuration.
