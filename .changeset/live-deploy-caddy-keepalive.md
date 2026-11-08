---
"agent-maturity-compass": patch
---

The TLS Compose stack's Caddy closes idle upstream connections after 4 s, below the shortest keep-alive Studio and the standalone API may use (Node's default, 5 s); with Caddy's default of 2 minutes, a request could be sent on a connection the server had already closed and fail with a 502. Both `deploy/compose/Caddyfile` and `Caddyfile.studio-api` set it on every upstream.
