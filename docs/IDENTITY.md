# Identity (Host Mode)

Enterprise identity is configured at the **host scope** so one AMC host can manage many workspaces safely.

## Files

- `<AMC_HOST_DIR>/identity/identity.yaml`
- `<AMC_HOST_DIR>/identity/identity.yaml.sig`

`identity.yaml` is always signature-verified before auth or SCIM routes run.

If signature verification fails:
- `/host/api/auth/*` returns `503` (`IDENTITY_CONFIG_UNTRUSTED`)
- `/host/scim/*` returns `503`
- Console should show an `IDENTITY CONFIG UNTRUSTED` banner

## Host Vault Secrets

Identity secrets are stored in the **host vault**, never plaintext config:

- `vault:identity/<providerId>/oidc/clientSecret`
- `vault:identity/<providerId>/saml/idpCertPem`
- `vault:scim/tokens/<tokenId>`

## Initialize and Verify

```bash
amc identity init --host-dir /path/to/amc-host
amc identity verify --host-dir /path/to/amc-host
```

## Local Auth vs SSO

`identity.localAuth` controls fallback username/password login:

- `enabled=true` and `passwordLoginEnabled=true`: local login available
- `enabled=false` or `passwordLoginEnabled=false`: local login disabled

To reduce lockout risk, keep at least one working auth path:
- at least one enabled OIDC/SAML provider, or
- local password login enabled for break-glass admin

## Role Mapping

SSO claims do not directly grant roles. AMC applies signed mapping rules from:

- `identity.roleMapping.rules`

This prevents claim-string privilege escalation and keeps role grants deterministic.

## OIDC admission and pending state

OIDC uses the existing host database for bounded, expiring, single-use pending logins. It stores state hashes and protects persisted PKCE material with owner-only filesystem access. Restarting the process does not discard a pending login; consuming a state prevents a second callback from using it. Failed callbacks require a new login.

Token admission requires finite expiry and issuance claims, a non-empty subject, exact issuer/nonce, audience/authorized-party checks, and compatible RS256/PS256/ES256 signing keys. Identity HTTP fetches use pinned public addresses, HTTPS, bounded response bodies/time and no redirects. Invalid discovery or provider responses produce fixed browser-facing errors.

No new settings or CLI paths are introduced, so existing signed identity YAML is preserved. Private-network or HTTP identity endpoints and previously accepted EdDSA tokens now fail OIDC admission. See [SSO OIDC](SSO_OIDC.md) for the exact loopback-development exception, key rotation and remaining browser/session boundaries.

Standard SAML remains separate work. [ADR 014](adr/014-saml-library.md) is a proposed library direction awaiting review; this OIDC implementation does not change the compact SAML runtime or SCIM behavior.
