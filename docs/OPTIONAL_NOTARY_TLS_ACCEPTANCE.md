# Optional notary and TLS stack: 2026-09-08 acceptance record

This page is the tracked summary of a local acceptance run of the optional Compose stack (Studio, software notary and Caddy TLS) recorded on 2026-09-08 for AMC-1529. The full receipt bundle (attempt receipts, logs, configuration and module hashes) was kept outside the repository and is not reproduced here. This summary was transcribed on 2026-10-11 and was not re-run.

## What ran

- Source built: `de7a0f8185a5960fddf7dd9e60bfca88fedb7223`, with the deployment corrections later committed as `883b5d751` ("fix: make optional notary TLS stack start and route authenticated traffic"). Frozen workspace install, the Dockerfile `studio` target, and the built npm artifact installed in the runtime image.
- Studio and notary image: `sha256:e3fa62b6d7147b9465f67ce581f8b13c8c18edca39908ad54f326ae51139ad3d`. Caddy 2.8 image: `sha256:226d1f059b75399fe19182893c7184591c07b97afc8dfcf44eeb80c9a77a530f`.
- One Linux ARM environment, an isolated internal network, disposable volumes, a loopback ephemeral published port and the local `localhost` private CA. `AMC_ENABLE_NOTARY=1`.
- Result recorded: 42 assertions in 8 groups passed, plus the focused suite 10 of 10; nothing pending or failed.

## What the assertions covered

- A signed NOTARY policy with an independently pinned key, SOFTWARE attestation and required `MERKLE_ROOT` signing, with local fallback prohibited.
- Real `signDigestWithPolicy` requests: independent Ed25519 verification over the original digest bytes succeeded and wrong bytes failed.
- Refusals: wrong vault authentication 401, missing authentication 401, an authenticated wrong checksum 400, and a replayed authenticated request 401.
- TLS through Caddy with the exported public local CA and matching Host and SNI: Studio health, readiness and Console HTML arrived through Caddy; default trust refused the private CA; `/auth/me` answered 401 anonymously and 200 with the Studio admin token.
- Restarts: the notary kept its public key, encrypted key and configuration hashes and signed again with every negative vector still refused; Studio and Caddy kept TLS trust and authenticated access.
- `amc notary log-verify` verified 23 signed entries.

## Deployment corrections it led to (commit `883b5d751`)

1. Caddy's binary carries a file capability, so `cap_drop: ALL` stopped it from executing. Caddy now gets only `NET_BIND_SERVICE`; both AMC services keep read-only roots, UID 10001 and all capabilities dropped.
2. A hostless `:443` with `auto_https off` had no usable certificate (TLS alert 80). The stack declares `AMC_TLS_HOST` (default `localhost`), keeps certificate automation and disables only redirects.
3. Caddy's catch-all `handle` shadowed the Studio and gateway routes. They now use mutually exclusive matched `handle` blocks before the fallback.

## Limits

It does not prove hardware attestation, public TLS or Internet deployment, other platforms, browser pairing or login UX, or provider connectivity. No external provider call, publication or host security change took place. A late optional scan for secrets in raw logs ran after teardown and is not claimed as passed.
