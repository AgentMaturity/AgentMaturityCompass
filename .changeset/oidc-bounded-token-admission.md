---
"agent-maturity-compass": patch
---

Harden host OIDC login with required expiry/issuance claims, compatible asymmetric signing keys, bounded pinned HTTPS identity fetches and capped durable single-use pending state. Browser-facing errors no longer include provider response bodies or raw network details.

OIDC accepts RS256/PS256/ES256; previously accepted EdDSA tokens are refused. HTTP and private-network identity endpoints are refused except literal loopback development endpoints explicitly enabled by `AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK=1`. Existing signed identity configuration remains valid. Browser-state correlation, session replacement, standard SAML and SCIM changes remain follow-ups. This source change is unqualified; executable checks were deferred by instruction.
