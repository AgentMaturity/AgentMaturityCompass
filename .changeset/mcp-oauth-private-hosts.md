---
"agent-maturity-compass": patch
---

Security: MCP OAuth discovery no longer lets a public MCP server direct AMC to hosts on a private network.

- **What changed:** the protected-resource metadata URL, the authorization server, and its token and registration endpoints are all named by server-supplied metadata. They are now refused when they resolve to a private, loopback, link-local or other non-public address, or do not resolve at all.
- **When a private host is still allowed:** when the MCP endpoint itself is on a non-public address (an internal deployment), or is literal loopback HTTP (development).
- **Limit:** the check runs before the request and the request resolves the name again, so it does not stop DNS rebinding.
