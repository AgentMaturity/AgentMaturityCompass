# AMC public package reference

Use this reference to find exported functions, classes, types and their source locations. It is generated from AMC's TypeScript source. An exported toolkit is available to an embedding application; its presence does not establish that AMC enables it in a running deployment.

| Package import | Source entry | Purpose |
| --- | --- | --- |
| `agent-maturity-compass` | `src/index.ts` | Public library exports |
| `agent-maturity-compass/sdk/native` | `src/sdk/nativeAgentClient.ts` | Native AMC agent sessions, turns and recorded updates |
| `agent-maturity-compass/sdk/mobile-fetch` | `src/sdk/mobileFetch.ts` | Fetch-based client helpers |
| `agent-maturity-compass/standard/external-evidence` | `src/standard/externalEvidenceProfile.ts` | Standalone external-evidence profile and verification |
| `agent-maturity-compass/telemetry/pi` | `src/importers/piTelemetryCallbacks.ts` | Optional producer telemetry callbacks with explicit self-reported provenance |

The native runtime runs within AMC; using its native SDK does not require DSH or Pi. Optional interoperability entry points do not change that boundary. API signatures do not establish a task result, evidence trust tier, compatibility with an untested platform or a published release.

## Build the reference

In a clean clone of the intended source commit, with Node22 and the package's pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm docs:api
```

Open `tmp/api-reference/index.html`. Search and the module list lead to the public entry points. `reflection.json` contains the generated declarations for tools that inspect the reference. TypeDoc checks TypeScript before emitting documentation; compiler errors are not hidden by this configuration. Warnings should be reviewed alongside the generated output.

`pnpm build:pages` includes the reference at `tmp/pages-site/api/index.html`, alongside the existing guides. An explicit staging directory passed with `--out` receives the reference in its own `api/` directory. The Pages workflow builds this artifact from its checked-out commit. Source/configuration/dependency changes trigger the same workflow when integrated into its configured branch; building locally does not publish anything.

Generated HTML stays outside source directories. During shared-checkout work, generate in an isolated candidate clone and retain the exact commit and environment with the output receipt. Do not generate from someone else's uncommitted edits or treat a generated file count as executed-test evidence.

The HTTP contracts are documented separately in the [OpenAPI reference](https://agentmaturity.co/openapi.yaml). Start with the [guides](https://agentmaturity.co/docs/) for setup and daily workflows.
