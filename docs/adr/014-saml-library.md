# ADR 014: Use a maintained SAML library for enterprise login

Status: proposed; requires Sid's review before adding a dependency or replacing the SAML runtime.
Owner: P2-07. Date: 2026-10-09.

## Context

AMC's current `src/identity/saml/` flow encodes and verifies compact JSON. It is not a SAML 2.0 XML service provider. OIDC hardening can proceed independently; this proposal does not claim that standard SAML or Okta/Entra interoperability has been delivered.

P2-07 requires HTTP-Redirect AuthnRequests, HTTP-POST responses, pinned IdP certificates, verified XML claims and persistent single-use request/replay state. Implementing XML signatures inside AMC would add substantial security-sensitive code. Reuse a maintained library behind a small AMC adapter instead.

## Proposed direction

Prefer `@node-saml/node-saml` for the service-provider flow, subject to the remaining review below. Keep `samlify` as the alternative if the selected release cannot satisfy AMC's response-validation and persistence requirements. This is an architectural preference, not an approved package/version pin.

The preference follows the documented request-correlation and cache-provider seams. The implementation must explicitly set correlation and signature options; library defaults do not define AMC policy. No package is added by this ADR.

## Source observations

Primary sources were read on 2026-10-09. The repository manifests below describe upstream branches, not a resolved AMC dependency tree or a promise about the newest registry release.

| Concern | `@node-saml/node-saml` | `samlify` |
|---|---|---|
| Licence and manifest version | MIT; upstream manifest reads `5.1.0`, Node `>=18`. | MIT; upstream manifest reads `2.13.1`; no Node engine constraint in that manifest. |
| XML dependencies | Declares `@xmldom/xmldom`, `xml-crypto`, `xml-encryption`, `xml2js`, `xmlbuilder` and `xpath`. | Declares `@xmldom/xmldom`, `xml-crypto`, `@authenio/xml-encryption`, `node-rsa`, `xml`, `xml-escape` and `xpath`. |
| Request correlation | Documents `validateInResponseTo: "always"` and a shared cache-provider seam. Its documented default is `"never"`; AMC must override it. | Schema-validator configuration is a separate integration requirement. Disabling it is unacceptable for AMC. |
| Certificate rollover | Documents an array or callback for pinned IdP certificates. | Needs confirmation against the exact selected release and AMC's certificate-ref configuration. |

Sources: [Node-SAML manifest](https://raw.githubusercontent.com/node-saml/node-saml/master/package.json), [Node-SAML documentation](https://github.com/node-saml/node-saml), [samlify manifest](https://raw.githubusercontent.com/tngan/samlify/master/package.json), [samlify documentation](https://github.com/tngan/samlify).

The publisher's advisory pages include these relevant entries:

| Library | Advisory | Published | Publisher-listed patched version |
|---|---|---|---|
| Node-SAML | [GHSA-m837-g268-mmv7](https://github.com/node-saml/node-saml/security/advisories/GHSA-m837-g268-mmv7), signature verification | 2025-07-24 | `5.1.0` |
| Node-SAML | [GHSA-4mxg-3p6v-xgq3](https://github.com/node-saml/node-saml/security/advisories/GHSA-4mxg-3p6v-xgq3), authenticated-content handling | 2025-07-28 | `5.1.0` |
| samlify | [GHSA-r683-v43c-6xqv](https://github.com/tngan/samlify/security/advisories/GHSA-r683-v43c-6xqv), signature wrapping | 2025-05-19 | `2.10.0` |
| samlify | [GHSA-34r5-q4jw-r36m](https://github.com/tngan/samlify/security/advisories/GHSA-34r5-q4jw-r36m), attribute-value XML injection | 2026-05-14 | `2.13.0` |

These observations are a partial advisory review. They do not establish vulnerability-free versions, complete OSV/GitHub coverage, transitive fix times or qualification. Publication dates do not establish the time between private disclosure and a fix.

## AMC adapter requirements

The adapter must read claims from the exact authenticated assertion content. It must reject DOCTYPEs, external entities, multiple assertions, weak algorithms, encrypted assertions and unsolicited IdP-initiated responses. Pinned certificates are the only signing authority; `KeyInfo` cannot add trust.

Require a successful Status, configured issuer and audience, ACS Recipient, matching request ID, future bearer `NotOnOrAfter`, and valid Conditions with bounded skew. A present Destination must match the ACS URL. Refuse configurations with both response and assertion signature requirements disabled. Require SHA-256 or stronger and exclusive canonicalization; never inherit SHA-1 defaults.

Use AMC's host database for atomic request consumption and assertion-ID replay protection through expiry plus skew. The library's in-memory cache is insufficient across process restarts or multiple processes. Distinguish fresh RelayState from the AuthnRequest ID, and preserve provider isolation. Map verified attributes through existing configured claims and signed role mappings.

## Review remaining before selection

Before Sid accepts this ADR, resolve the candidate's exact released dependency tree and record the three-year OSV/GitHub advisory review for it and its XML stack, patched versions, available disclosure/fix dates, licence compatibility with D-04, release/maintainer activity and transitive size. Inspect the exact release's signed-content API, DTD/entity behavior, algorithm restrictions, certificate rollover and atomic cache consumption. An upstream Node engine declaration alone does not prove Node 20–24 compatibility.

After acceptance, pin the selected exact version in root runtime `dependencies` per [ADR 006](006-runtime-bundle-boundary.md), update the lockfile and notices, and import the adapter only on the SAML path. Replace compact JSON without a fallback; document migration for existing providers. Real recorded Okta and Entra inputs, compatibility checks and executable qualification remain separate work and require the user's authorization to resume validation. Credentials and live assertions must not enter this ADR.

## Consequences

AMC keeps one SAML verification seam and avoids an in-house XML-signature engine. The tradeoff is a new runtime dependency and its XML stack. The OIDC changes in this work item do not depend on library acceptance, and do not expand SAML or SCIM behavior.
