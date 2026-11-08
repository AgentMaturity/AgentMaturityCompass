---
"agent-maturity-compass": patch
---

The TLS Compose stack's Caddy closes idle upstream connections to Studio after 55 s, below the 65 s keep-alive Studio keeps; with Caddy's default of 2 minutes, a request could be sent on a connection Studio had already closed and fail with a 502. Both `deploy/compose/Caddyfile` and `Caddyfile.studio-api` set it on every Studio upstream.
