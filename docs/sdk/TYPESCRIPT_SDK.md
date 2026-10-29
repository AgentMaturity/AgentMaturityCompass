# TypeScript SDK

The native TypeScript SDK starts AMC's governed runtime as a child process of your Node application, runs turns over
ACP, and verifies the signed session evidence afterwards. It ships inside the `agent-maturity-compass` package; the
SDK version is the package version.

- Install: `npm install agent-maturity-compass`. The first npm release that contains this page is the first one the
  release train (docs/RELEASE_CADENCE.md) publishes after it; until then, use a local build.
- Import path: `agent-maturity-compass/sdk/native`.
- Node.js: 22 or 24 LTS. The package's `engines` floor (`>=20`) is a compatibility floor, not a tested target.
- Reference: [NATIVE_SDK.md](../NATIVE_SDK.md) describes the lifecycle (turns, cancellation, resume, limits).
- The execution verbs shared with the CLI, Python and Studio (`forkSession`, `approve`, `pendingApprovals`, `dispose`)
  and the execution phases on every result are in [EXECUTION_API.md](EXECUTION_API.md).

## Quickstart: install to a verified synthetic action

Everything below runs keyless on the stub provider. The stub runs no model, so every result is synthetic: a scripted
demonstration of the governed path, never a real-model result.

```bash
mkdir amc-quickstart && cd amc-quickstart
npm install agent-maturity-compass
export AMC_VAULT_PASSPHRASE='<a passphrase you keep>'   # AMC never generates or defaults one
npx amc init --coding                                   # asks for the owner's Studio login; prints the monitor fingerprint
export AMC_EXPECTED_MONITOR_FINGERPRINT=<the fingerprint init printed>
node quickstart.mjs                                     # a copy of examples/sdk/quickstart.mjs
```

`amc init --coding` signs the workspace's tool allowlist, firewall policy, budgets, config and `users.yaml`, and
prints its readiness. In a non-interactive shell it reads the owner's login from `AMC_BOOTSTRAP_OWNER_USERNAME` and
`AMC_BOOTSTRAP_OWNER_PASSWORD` (or their `_FILE` variants) and refuses when the passphrase or the login is missing.

`examples/sdk/quickstart.mjs` in the repository is the whole program:

```ts
import { AMCNativeClient } from "agent-maturity-compass/sdk/native";

const agent = await AMCNativeClient.start({ workspace: process.cwd(), provider: "stub", tools: "workspace" });
const session = await agent.newSession();
// The stub reads this exact shape as the one call to make.
await session.prompt(JSON.stringify({ tool: "fs.write", arguments: { path: "hello.txt", content: "hello\n" } })).result;
const receipt = await session.closeAndVerify();
console.log(receipt.state, receipt.scope); // verified externally-anchored
```

It prints the session id, the governed `fs.write` call's status, the verification result and the sha256 of the verifier
report, each line labelled `[synthetic]`. The `fs.write` call passes through the same signed allowlist, firewall,
budgets and evidence log a real provider's call does. `npm run check:packed-install` runs this quickstart against the
installed package and bin and records its wall time.

## The runtime child's environment

`AMCNativeClient` starts its `amc acp` child with `PATH`, `HOME`, user, shell, locale, temp and timezone variables, the
parent's `AMC_*` settings (the vault passphrase, a monitor pin, `AMC_HOME`) and whatever you pass in `env`. Nothing else
from your process is inherited, so a cloud token or a provider key in your environment does not reach the runtime by
accident: pass the one it should use explicitly, for example `env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY }`, or
keep it in AMC's credential file. `inheritEnv: true` restores the earlier behaviour of merging your whole environment
under `env`.

## How verification works

`session.closeAndVerify()` closes the client, which ends the runtime child and seals its sessions, then runs a fresh
`amc agent-loop verify <sessionId> --json` from the same installed package. `client.verifySession(sessionId)` does the
same for a client you closed yourself. A receipt comes back only when the ledger and session chains verify, every
recorded request reconstructs, and the ledger's monitor key is pinned outside the workspace:
`AMC_EXPECTED_MONITOR_FINGERPRINT` in the client's environment (`env` option or the process), or a trust list in the
AMC home. The receipt's `scope` is then `externally-anchored`. Without a pin, or with a pin for a different key, the
call rejects with `AMCNativeRefusedError` ("Native evidence verification failed"); since P0-09 the bundled verifier
refuses an unpinned ledger, so `workspace-key-consistency` is not returned by this package.

Verification checks the integrity and authorship of the recorded evidence, never the quality of an answer. Checked
against the workspace's own keys it is a local audit trail; a portable verdict needs pinned trust (src/trust/).

## Public API and semver policy

The contract covers the `agent-maturity-compass/sdk/native` entry only. Its stable (`@public`) surface is:

- the classes `AMCNativeClient`, `AMCNativeSession` and `AMCNativeTurn`;
- their options and update types: `AMCNativeClientOptions`, `AMCNativeEventBufferOptions`, `AMCNativeUpdate`,
  `AMCNativeRunResult` and `AMCNativeReceipt`;
- the errors `AMCNativeInputError`, `AMCNativeProtocolError`, `AMCNativeLimitError`, `AMCNativeCancelledError`,
  `AMCNativeProcessError` and `AMCNativeRefusedError`.

Everything else that entry exports is experimental: the in-process `openAgentSession` and `resumeAgentSession`, the
`llm` namespace, the image and audio input helpers, `AMC_NATIVE_EVENT_LIMITS`, the session-history readers, and the
`promptParts` and `promptAudioParts` members of `AMCNativeSession`. Members marked `@internal` are not API. The package
root (`agent-maturity-compass`) and its other subpaths are outside this contract; `createA4Client` there is an A4 Forge
preview, experimental, whose routes answer 404 unless the server runs with `AMC_A4_PREVIEW=1`. The fields inside
`AMCNativeReceipt.report` follow the verifier's report and are experimental.

| Change | Release |
| --- | --- |
| Remove or change a `@public` name or member | major |
| Add a `@public` name or member | minor |
| Change or remove an experimental name or member | minor, with a changeset note |
| Fix behaviour without an API change | patch |

`sdk/api/native.api.md` in the repository is the committed snapshot of every exported name and signature,
generated from `dist/sdk/nativeAgentClient.d.ts`. `npm run check:sdk-api` (in CI) fails when the snapshot differs from
the built declarations, and when a branch changes the snapshot without a changeset that mentions `sdk-api`. After an
intended API change, run `node scripts/check-sdk-api.mjs --write`, review the diff and say what changed in the
changeset.

## Starter profiles

| | `amc init --coding` | `amc init --regulated` |
| --- | --- | --- |
| Tools (signed `tools.yaml`) | `fs.read`, `fs.write`, `fs.edit` over the workspace; `bash` confined by the OS (`nativeSandbox: os-native`, writable `.`) | the same |
| Shell network | none: `egress` is absent, so every connection is denied; the file shows how to allow a registry and re-sign | none (deny by default) |
| Runtime firewall | `warn` | `block` |
| Approvals | none | signed preset `regulated` in `.amc/agents.yaml`: every tool call waits for a signed approval under the WRITE_HIGH rule (two distinct APPROVER or OWNER users); signed approval policy |
| Config | `profile: dev` | `profile: prod`, `security.trustBoundaryMode: isolated` |
| Users | signed `users.yaml` with you as the ACTIVE OWNER | the same |
| Control plan | none | a Layer 0 plan compiled and signed from `amc-control-plans/regulated-starter/deployment-profile.json`, not activated |
| Next command | `amc agent-loop run "..." --provider stub --tools workspace` | `amc agent-loop run "..." --provider stub --tools workspace --preset regulated` |

Both refuse `--minimal`, `--skip-vault`, `--trust-boundary` and each other, and both refuse a directory that already
has `.amc` (`--force` deletes it first). Budgets are the signed defaults.

The regulated plan is experimental. The Layer 0 controls are agent-drafted and not independently reviewed (decision
D-08 is open), and a plan is evidence-of-conformity planning, never a compliance claim. The starter profile states no
deployment fact, so the plan stays blocked until you state `domains`, `jurisdictions`, `stations`, `useCases`, `dataClasses`, `entityTypes` and `roles` in the profile.
Layer 0 waits for `useCases` and `jurisdictions`. The Wealth overlay adds `stations` because an unknown station may
include `wealth`; the Technology overlay also waits for `domains` (P2-30). `amc init --regulated` prints the facts it waits for. Activation
then follows docs/catalog/COMPILER.md: `amc catalog compile --profile <profile> --request-review`, approval by two
OWNER or AUDITOR users other than the requester, then `--activate <approvalRequestId>`. Once a plan with L0-IDN-01 is
active, a tool call needs a lease that names an active `users.yaml` user. Studio native tasks carry one for their
signed-in user. With workspace tools, `amc agent-loop run`, each `amc acp` session (at `session/new`, `session/load`
and `session/fork`)
and so `AMCNativeClient` mint one for the ACTIVE `users.yaml` user whose username is the OS account running them (P1-79).
When no such user exists, the run is refused with `PRINCIPAL_UNRESOLVED` before a session or lease exists: the CLI
exits non-zero, and `newSession()` rejects with `AMCNativeRefusedError` (code -32602, `data.reason`
`PRINCIPAL_UNRESOLVED`). So `amc init` with the owner username set to your OS account (the interactive default) is what
lets this quickstart run under an active plan; otherwise add that user with `amc user add`. An active plan also needs a
signed residency destination registry (`.amc/residency/destinations.yaml`, P2-01) before any session opens; see
docs/OPS_HARDENING.md.

## Open decision

Whether the SDK stays the subpath `agent-maturity-compass/sdk/native` (the default here) or gets its own npm package
name is Sid's decision before the first SDK release; D-12 does not cover it.
