# Security Deployment Guide

## Threat Model Highlights

- Agents are untrusted.
- Studio/Gateway/ToolHub are trusted boundary services.
- Vault-encrypted keys remain outside agent processes.
- Leases, approvals, and signed configs gate privileged execution.

## Reverse Proxy Hardening

- Use TLS termination (Ingress/Caddy/Nginx).
- Set `AMC_TRUSTED_PROXY_HOPS` correctly, and name your proxies in `AMC_TRUSTED_PROXY_CIDRS`: AMC believes `X-Forwarded-For`, `X-Forwarded-Proto` and an inbound `X-Request-Id` only on a request one of those addresses forwarded, never because a client is in `AMC_ALLOWED_CIDRS`. Studio refuses to start when the hops are set and no proxy is named. Behind a TLS-terminating proxy the console session cookie carries `Secure` only then. Name only the proxies' own addresses, never a whole private range: any host inside a trusted range can name its own client address (SR-10). The Compose TLS stack trusts only Caddy's fixed address on its own `amc_edge` network. The Helm chart trusts no proxy by default and refuses to render with `ingress.enabled` or hops above 0 until you name the ingress controller pods. The raw Kubernetes manifests leave the list empty, so Studio refuses to start until you fill it in. At start, Studio warns about a trusted IPv4 range of /12 or wider, and about a trusted range (not a single address) that overlaps `AMC_ALLOWED_CIDRS`.
- Restrict source networks with `AMC_ALLOWED_CIDRS`. Loopback is always admitted, an unset variable falls back to the signed LAN allow list, and a public bind whose list admits every address (`0.0.0.0/0`) is refused at start unless `AMC_ALLOW_PUBLIC_BIND=1` is set.
- Keep `AMC_QUERY_LEASE_CARRIER_ENABLED=false` outside local development.
- Query lease carrier only becomes active when both:
  - `AMC_QUERY_LEASE_CARRIER_ENABLED=true`, and
  - signed LAN mode config is enabled (`.amc/studio/lan.yaml` + valid signature).

## Runtime Hardening Defaults

- Non-root container (`uid:gid 10001:10001`)
- Read-only root filesystem and dropped Linux capabilities
- Rate limits for auth and write endpoints
- Strict CORS allowlist handling
- Request payload limits on ingest endpoints
- Graceful shutdown to flush ledger state

## Why Agents Still Cannot Cheat in Deployment

- Evidence remains monitor-signed and hash-chained.
- ToolHub/Governor enforce policy and approval/ticket checks outside agent process.
- Lease verification is required for gateway/proxy/toolhub access.
- Unsafely modified configs degrade trust and cap maturity.
- Transparency + Merkle checks reveal tampering in issued artifacts.
