# Security Deployment Guide

## Threat Model Highlights

- Agents are untrusted.
- Studio/Gateway/ToolHub are trusted boundary services.
- Vault-encrypted keys remain outside agent processes.
- Leases, approvals, and signed configs gate privileged execution.

## Reverse Proxy Hardening

- Use TLS termination (Ingress/Caddy/Nginx).
- Set `AMC_TRUSTED_PROXY_HOPS` correctly. Behind a TLS-terminating proxy the console session cookie carries `Secure` only when `AMC_TRUSTED_PROXY_HOPS` is set and the proxy's address is in `AMC_ALLOWED_CIDRS`, because only then does AMC believe `X-Forwarded-Proto`.
- Restrict source networks with `AMC_ALLOWED_CIDRS`.
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
