# Dependency review: @earendil-works/pi-ai 1.3.0 (P1-38)

**Status:** added as an optional peer dependency, pinned exactly. Needs Sid's approval before merge (see "Needs-Sid").

Reviewed on 2026-10-18 on macOS arm64 with Node 22.23.3 and pnpm 10.33.0 (local, not CI). The package was fetched
from the public npm registry. No provider was contacted and no credential was used.

## What AMC uses it for

pi-ai builds the request body for three providers that no native route covers: `pi-ai:groq`, `pi-ai:huggingface`
and `pi-ai:together`. AMC records those bytes in the signed `request/header`, sends them through its own transport
and decodes the reply with its own decoder. ADR-016 (`docs/adr/016-pi-ai-adapter.md`) has the design and the spike
evidence. pi-ai never sends a request, never retries and never sees a real credential.

## The pinned package

| Field | Value |
|---|---|
| Package | `@earendil-works/pi-ai` (successor of the deprecated `@mariozechner/pi-ai`) |
| Version | `1.3.0` (npm `latest` on 2026-10-18, published 2026-10-15) |
| Integrity | `sha512-KaBI8x7q7sPoFUXICNGD9efHzDG+oRNwVvkA9jdIsSQWH1RjFssOlEGsbLtewUPPgCrvmz0l2KTgSLXTyj3acw==` |
| Shasum | `fe720249f828642bcb66b5b6a0e49c1e5f2f8954` |
| Registry provenance | SLSA v1 provenance attestation listed by the registry (not verified offline here) |
| Licence | MIT (`package.json` `license`) |
| Repository | `github.com/earendil-works/pi`, directory `packages/ai` |
| Maintainers | mitsuhiko, badlogic, rwachtler (npm) |
| Engines | `node >=22.19.0` (AMC's own floor stays `>=20`; the loader refuses older Node for pi routes) |
| Size | 837 files, 4,170,589 bytes unpacked |

The pin is in `package.json` `peerDependencies` (exact `1.3.0`, no range) with `peerDependenciesMeta.optional: true`.
The lockfile records the same integrity.

Why 1.3.0 and not an older release: 1.3.0 is the first release whose direct dependencies are all exact versions.
1.1.0 and 1.2.0 depend on `@earendil-works/pi-telemetry` by caret range.

## Dependency tree

- Direct dependencies (all exact): `openai` 7.19.0, `@anthropic-ai/sdk` 0.129.0, `@google/genai` 2.21.0,
  `@aws-sdk/client-bedrock-runtime` 3.1127.0, `@smithy/node-http-handler` 4.12.1, `http-proxy-agent` 9.1.0,
  `https-proxy-agent` 9.1.0, `partial-json` 0.1.7, `typebox` 1.3.27, `@earendil-works/pi-telemetry` 1.3.0.
- `pnpm-lock.yaml` gains 77 packages. A clean `npm install --ignore-scripts` of the pin alone installs 85 packages,
  about 102 MB.
- AMC loads only `api/openai-completions`, `utils/transcript` and three `providers/<name>.models` modules. The Bedrock,
  Google and Anthropic SDKs are installed but never imported by AMC.

## Install scripts

pi-ai itself has none. In its tree, `@google/genai` 2.21.0 has a no-op `preinstall` (`echo 'preinstall: no-op'`) and
`protobufjs` 7.6.6 has a `postinstall` (`node scripts/postinstall`). Under AMC's pnpm 10 settings both are blocked
(`onlyBuiltDependencies` lists only `better-sqlite3` and `esbuild`), and pnpm reports them as ignored. Other `prepare`
scripts in the tree run only for git installs, not registry installs.

## Audit

`npm run audit:runtime` (`pnpm audit --prod --audit-level moderate`) on 2026-10-18: "No known vulnerabilities
found", across 271 production dependencies. pnpm counts the auto-installed peer as a production dependency of the
workspace, so this includes pi-ai's tree. The registry flags `node-domexception@1.0.0` as deprecated (not a
vulnerability).

## Network activity and telemetry

- At import: `tests/piAi/piAiLoader.test.ts` loads the pinned modules with `globalThis.fetch` replaced by a spy that
  throws. It was not called. Only `fetch` is spied, not raw sockets.
- When encoding: pi-ai stops inside `onPayload`, before its client sends anything (ADR-016). AMC's transport sends.
- `@earendil-works/pi-telemetry` 1.3.0 is a vendor-neutral contract library: a no-op context and an in-memory
  recorder, with no `fetch`, HTTP or environment access. pi-ai 1.3.0 references it only from type declarations
  (`dist/types.d.ts`); no runtime module in `dist/` imports it. So no third-party telemetry runs by default.

## Third-party notices

AMC does not bundle or redistribute pi-ai. Operators who use a pi route install it themselves.
`scripts/vendor/gen-third-party-notices.mjs` covers vendored code only, so `THIRD_PARTY_NOTICES` is unchanged, and
`npm run check:third-party-notices` passes. If AMC ever bundles pi-ai (for example in the kernel bundle or a SEA
build), its MIT notice and those of its tree must be added first.

## Needs-Sid

1. **Approve the dependency.** Adding `@earendil-works/pi-ai@1.3.0` as an optional peer is the change the issue
   names, but it is still a new dependency controlled by a competitor.
2. **Accept the workspace install.** pnpm's `autoInstallPeers: true` (recorded in `pnpm-lock.yaml`) installs the
   optional peer and its 77 packages in every AMC checkout and CI run. That is what lets CI run the pi contract tests
   and regenerate the capability matrix. The alternative is to turn `autoInstallPeers` off for the workspace, which
   changes how every other peer resolves and needs its own review.
3. **Live provider runs.** No pi route was run against Groq, Hugging Face or Together. Doing so needs Sid's keys and
   is outside this issue.

## Upgrade

See `docs/providers/PI_AI_UPGRADE_POLICY.md`. Each bump gets its own review file named after the version.
