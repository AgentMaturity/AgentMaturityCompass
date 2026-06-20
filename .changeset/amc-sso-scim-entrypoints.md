---
"agent-maturity-compass": patch
---

Add discoverable enterprise auth setup entrypoints. `amc sso configure <oidc|saml>` now configures signed host identity providers, and `amc scim init` enables SCIM provisioning with optional first-token creation without resetting existing providers.
