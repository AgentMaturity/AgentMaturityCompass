# SSO SAML (SP in AMC)

AMC currently accepts only its own compact JSON assertion. Standard SAML 2.0 responses with XML signatures are not supported yet, so identity providers such as Azure AD cannot sign in through these endpoints until real SAML lands (P2-07).

The endpoints below run at host scope. Like [OIDC login](SSO_OIDC.md), this login is unqualified: no interoperability with any identity provider has been recorded.

## Add a SAML Provider

The command shows the configuration shape only. `azuread` and the URLs are placeholders; an Azure AD tenant cannot complete a login against this configuration (see above).

```bash
amc identity provider add saml \
  --host-dir /path/to/amc-host \
  --id azuread \
  --display-name "Azure AD SAML" \
  --entry-point https://idp.example.com/saml/login \
  --issuer https://idp.example.com/issuer \
  --idp-cert-file /secure/path/idp-cert.pem \
  --sp-entity-id https://amc.example.com/host/api/auth/saml/azuread/metadata \
  --acs-url https://amc.example.com/host/api/auth/saml/azuread/acs
```

## Metadata and Endpoints

- SP metadata:
  - `GET /host/api/auth/saml/:providerId/metadata`
- Login start:
  - `GET /host/api/auth/saml/:providerId/login`
- Assertion Consumer Service:
  - `POST /host/api/auth/saml/:providerId/acs`

## Validation Requirements

The Assertion Consumer Service base64-decodes the posted `SAMLResponse` as a JSON object and checks:

- a signature over AMC's compact JSON assertion, checked with the configured IdP certificate (not a SAML XML signature)
- issuer equals the configured IdP issuer, and audience equals the SP entity ID
- `InResponseTo` equals the pending login request, whose relay state is single-use and expires after 10 minutes
- `notBefore` and `notOnOrAfter`, when the assertion carries them, within the configured clock-skew window
- a non-empty subject and email

After validation, AMC maps groups/claims through signed role mapping rules and issues the host session cookie.

## Security Notes

- SAML trust material (`idpCertPem`) is stored in host vault.
- Role assignment is mapping-driven, not assertion-string-driven.
- If `identity.yaml` signature is invalid, SAML endpoints fail closed with `503`.

