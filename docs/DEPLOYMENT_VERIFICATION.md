# Deployment Verification

A deployment is **unverified until a governed turn succeeds against it**. A
`200` from a health route proves a process is listening; it does not prove the
gateway leases, records and signs work. `scripts/deploy-verify.mjs` checks the
second thing.

## What the verifier does

```bash
AMC_DEPLOY_VERIFY_LEASE="$(cat lease.token)" \
node scripts/deploy-verify.mjs \
  --target  https://studio.example.internal \
  --gateway https://gateway.example.internal \
  --monitor-pubkey pinned/monitor_ed25519.pub \
  --out tmp/deploy-verify/result.json
```

Five required checks, all of which must be present and `PASS`. A check that did
not run counts as a failure.

| Check | What it proves |
| --- | --- |
| `health` | `GET <target>/healthz` returns 200 with `status: "ok"` (ledger and score DB reachable) |
| `readiness` | `GET <target>/readyz` returns 200 `READY` |
| `governed-turn` | one leased `POST <gateway><route>/v1/chat/completions` returns 2xx **with** an `x-amc-receipt` header |
| `receipt-signature` | the receipt's Ed25519 signature verifies against a monitor key **you pinned** |
| `receipt-binding` | the verified payload is an `llm_response` receipt for the requested agent, its `body_sha256` equals the SHA-256 of the bytes received, and its `ts` falls inside the request window (±5 min clock skew) |

Design decisions:

- **The monitor public key is pinned out of band and never fetched from the
  target.** A target that names its own key can sign its own pass. Copy
  `.amc/keys/monitor_ed25519.pub` from the deployed workspace through a channel
  you trust, and pass it with `--monitor-pubkey` (repeatable for key rotation).
  With no key pinned, `receipt-signature` fails.
- **The lease is a credential.** It is read from `AMC_DEPLOY_VERIFY_LEASE` or
  `--lease-file` and is never printed or written to the result. Issue a short,
  narrow one on the target workspace, for example
  `amc lease issue --agent default --ttl 30m --scopes gateway:llm --routes /openai --models 'gpt-*'`.
- **The turn spends one real completion** (`max_tokens: 1`) through the
  configured upstream. Pass `--model` and `--route` to match the deployment's
  gateway routes.
- The result JSON names its boundary: `verifierCommit`, whether the verifier's
  tree was dirty, the target's reported package version, Node/OS/arch, per-check
  timings, the receipt id and its SHA-256, and a `notExercised` list.

Exit codes: `0` pass, `1` fail (result JSON still written), `2` usage error.

## What it does not prove

- The receipt's `event_hash` is not anchored to the target's ledger. That needs
  ledger access (`amc verify all --json` on the host), not an HTTP probe.
- The target does not report its deployed commit; the result records the
  package version from `/healthz` only. Record the image digest separately (B4).
- Tool execution, streaming responses, approvals and the dashboard are not
  exercised.

## Which deploy targets can pass

| Target | Serves | Can a governed turn pass? |
| --- | --- | --- |
| Docker image (`Dockerfile`, `docker/docker-compose.yml`) | Studio (3212) + gateway (3210) | Yes: this is the path a governed turn needs |
| `railway.json` (`npm run api:start` → `tsx api/index.ts`) | the lightweight scoring API only | **No.** It has no `/healthz`, `/readyz`, gateway or receipts, so the verifier fails closed against it |
| `vercel.json` (`@vercel/node` on `api/index.ts`) | the same lightweight API | **No**, for the same reason |

`railway.json` health-checks `/api/health`, the route `api/index.ts` serves.
Railway requires a 2xx from that path before it routes traffic (Railway
healthcheck guide, retrieved 2026-10-03). That proves only that the process
started.

**Pending dependency (another session's uncommitted work, not exercised here).**
A standalone API build (`scripts/build-standalone-api.mjs`,
`scripts/standalone-api-smoke.mjs`, `src/api/routerResponseHelpers.ts`) and
edits to `api/index.ts` were in progress in the root checkout when this was
written. Once they land, re-check that `railway.json`'s `startCommand` and
`vercel.json`'s `builds` still match `package.json` at that commit;
`tests/deployVerifyConfig.test.ts` fails if they drift. If the standalone API
is meant to serve governed turns, it must expose `/healthz`, `/readyz` and a
leased gateway route with receipts before this verifier can pass against it.

Open questions:

- `railway.json` pins `"builder": "NIXPACKS"`. Railway's current config-as-code
  reference (retrieved 2026-10-03) lists only `RAILPACK` (the default) and
  `DOCKERFILE`. Whether `NIXPACKS` is still honoured is unknown.
- `tsx`, which `api:start` runs, is a devDependency. Whether Railway's build
  keeps devDependencies at runtime is unknown.
- `api/index.ts`'s `/api/health` returns hard-coded `version: "1.0.0"` and
  fixed counts (package version is `1.2.0` at `8f57ce63`). That file belongs to
  the other session.

## Local run record (2026-10-03)

Verifier commit `a89508b2` (tree clean), darwin/arm64, Node v25.5.0. The full
command log is in the S2 track report under
`AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S2/report.md`.

1. **Governed target, PASS.** A scratch harness mirrored the `src/e2e/smoke.ts`
   steps from bootstrap to lease issue (temp workspace, fake OpenAI-compatible
   upstream, `dist/cli.js studio start`, lease `gateway:llm` on `/openai`).
   Studio was on 127.0.0.1:49159 and the gateway on 127.0.0.1:49160. All five
   checks passed (`health` 43 ms, `readiness` 54 ms, `governed-turn` 46 ms,
   `receipt-signature` 1 ms, `receipt-binding` 0 ms; run 147 ms). Receipt
   `e7d04b9a-52cc-41c2-983b-7cf0e15e1cde` committed to the 228 response bytes
   received. The lease did not appear in the result.
2. **Same target, wrong pinned key, FAIL (exit 1).** With a different
   workspace's monitor key pinned, `receipt-signature` failed (pinned fpr
   `c2bb9066186cc14e`, target claims `c3b625da0192c0d9`) and `receipt-binding`
   refused the untrusted payload.
3. **Railway start command, FAIL (exit 1), as designed.** `PORT=43213 npm run
   api:start` served `GET /api/health` 200. The verifier failed `health` and
   `readiness` (404) and `governed-turn` (no lease, no gateway).
4. **Unreachable target, FAIL (exit 1).** `--target http://127.0.0.1:1`: every
   check failed and the fail-closed JSON was printed.

Every process started for these runs was stopped, and its stop was confirmed:

- harness PID 70120 and Studio PID 70263 (`CLOSED` logged; no matching
  process; ports 49159–49163 and 49165 not listening);
- lite API PIDs 60640, 60711 and 60757 (no matching process; port 43213 not
  listening).

The temp workspace and the lease file were then deleted.
