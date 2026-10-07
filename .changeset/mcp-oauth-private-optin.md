---
"agent-maturity-compass": patch
---

Security: an MCP server's own DNS no longer decides whether its OAuth hosts may be on a private network. A private, non-public or unresolvable authorization, token, registration or metadata host is refused. The exceptions are literal loopback HTTP for development and the new operator setting `auth.allowPrivateNetwork: true` in the signed MCP config, for internal deployments.
