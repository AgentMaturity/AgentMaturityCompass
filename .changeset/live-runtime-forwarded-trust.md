---
"agent-maturity-compass": patch
---

Behind trusted reverse proxies, Studio now takes the client address from the `X-Forwarded-For` entry the trusted hops appended, `chain[length - AMC_TRUSTED_PROXY_HOPS]` (LIVE-RUNTIME-18). Before, it took the entry one hop further left, so behind a proxy that appends to the header (ALB, HAProxy `forwardfor`) a client could prepend an address of its choice and pass the allow list and the per-address limiters.

The session cookie now carries `Secure` for `X-Forwarded-Proto: https` only when that header comes from a trusted hop: `AMC_TRUSTED_PROXY_HOPS` is set and the proxy is in `AMC_ALLOWED_CIDRS`. A TLS socket always counts. Before, any client could send the header. Behind a TLS-terminating proxy, set `AMC_TRUSTED_PROXY_HOPS` so the console cookie stays `Secure`.
