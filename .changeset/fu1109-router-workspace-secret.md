---
"agent-maturity-compass": patch
---

Host mode closes a DNS-rebinding residual: a workspace API the host router starts trusted any loopback peer as the router, so a page whose name rebinds to 127.0.0.1 (or a local process) that reached the workspace port directly could skip the router's Host check by adding `X-Forwarded-For`. The router now sends a per-boot random secret on every request it proxies, and those workspace APIs refuse any request without it (403). Single-workspace Studio is unchanged.
