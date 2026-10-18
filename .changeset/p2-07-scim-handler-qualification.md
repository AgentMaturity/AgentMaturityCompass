---
"agent-maturity-compass": patch
---

Harden SCIM user and group PATCH validation: accept boolean-string active changes, apply filtered member removal with group-specific role revocation, and reject unsupported paths, malformed values and unsupported user filters with fixed errors. Preserve supported equality-filter no-match results and pathless operation compatibility. This candidate is awaiting qualification; HTTPS/proxy trust, bearer digest comparison and recorded IdP interoperability remain separate work.
