# Custom Adapter Authoring Guide

Use this guide when your framework is not covered by a built-in AMC adapter and `generic-cli` is too generic for your users.

AMC supports two custom-adapter paths:

| Path | Use when | What AMC loads |
|---|---|---|
| Declarative plugin adapter | Your framework can run as a CLI or library process after environment variables are injected | A signed `content/adapters/*.json` or `*.yaml` adapter definition |
| SDK wrapper adapter | You own the application code and can instrument framework callbacks directly | `FrameworkAdapter`, `createAdapter("custom", ...)`, or a subclass in your app |

Plugins are content-only. They can declare adapter metadata, detection rules, command templates, and environment wiring, but they cannot execute plugin code inside AMC.

## Declarative Plugin Adapter

Create a plugin with an adapter asset under `content/adapters/`.

```text
my-amc-plugin/
  manifest.json
  content/
    adapters/
      my-framework-cli.yaml
```

Adapter files are validated by `adapterDefinitionSchema` in `src/adapters/adapterTypes.ts`.

```yaml
id: my-framework-cli
displayName: My Framework CLI
kind: CLI
detection:
  commandCandidates:
    - my-framework
    - myfw
  versionArgs:
    - --version
  parseVersionRegex: "\\d+\\.\\d+\\.\\d+"
providerFamily: OPENAI_COMPAT
defaultRunMode: SUPERVISE
envStrategy:
  leaseCarrier: ENV_API_KEY
  baseUrlEnv:
    keys:
      - OPENAI_BASE_URL
      - MY_FRAMEWORK_BASE_URL
    valueTemplate: "{{gatewayBase}}{{providerRoute}}"
  apiKeyEnv:
    keys:
      - OPENAI_API_KEY
      - MY_FRAMEWORK_API_KEY
    valueTemplate: "{{lease}}"
  proxyEnv:
    setHttpProxy: true
    setHttpsProxy: true
    noProxy: localhost,127.0.0.1,::1
commandTemplate:
  executable: my-framework
  args:
    - run
  supportsStdin: true
capabilities:
  declarationVersion: "1"
  definitionVersion: 1.0.0
  versionSource: adapter_binary
  events:
    - id: process.started
      activeWhen: [adapter_run]
    - id: process.stdout
      activeWhen: [adapter_run]
    - id: process.stderr
      activeWhen: [adapter_run]
    - id: process.exited
      activeWhen: [adapter_run]
    - id: model.request
      activeWhen: [gateway_routed]
    - id: model.response
      activeWhen: [gateway_routed]
  controls:
    - id: gateway.route
      activeWhen: [gateway_routed]
    - id: gateway.model
      activeWhen: [gateway_routed]
    - id: gateway.budget
      activeWhen: [gateway_routed]
    - id: gateway.freeze
      activeWhen: [gateway_routed]
  lossiness:
    level: partial
    omitted:
      - Provider-native session and tool lifecycle is not guaranteed by gateway wrapping
      - Configured redaction excludes secrets and raw sensitive fields from evidence
  verification:
    status: fixture_verified
    authority: publisher
    evidenceRefs:
      - tests/my-framework-adapter.test.ts
notes: Routes My Framework through the AMC gateway using a short-lived lease.
```

Field contract:

| Field | Required | Notes |
|---|---:|---|
| `id` | yes | Stable kebab-case adapter id used by `--adapter` |
| `displayName` | yes | Human-readable label for `amc adapters list` |
| `kind` | yes | `CLI`, `LIBRARY_NODE`, or `LIBRARY_PYTHON` |
| `detection.commandCandidates` | yes | Executables AMC checks on `PATH` |
| `detection.versionArgs` | yes | Defaults to `["--version"]` if omitted |
| `detection.parseVersionRegex` | yes | Regex used to extract a version from command output |
| `providerFamily` | yes | `OPENAI_COMPAT`, `ANTHROPIC`, `GEMINI`, `XAI_GROK`, `OPENROUTER`, or `CUSTOM_HTTP` |
| `defaultRunMode` | yes | `SUPERVISE` for local process execution or `SANDBOX` for hardened execution |
| `envStrategy` | yes | Environment variables that carry gateway URL, lease token, and proxy settings |
| `commandTemplate` | yes | Default executable and args before user-supplied args |
| `capabilities` | yes for publishable claims | Versioned events, controls, activation conditions, version-probe semantics, known lossiness, and fixture evidence |
| `notes` | no | Short operational note |

Older plugin definitions without `capabilities` still parse for compatibility, but AMC assigns them `definitionVersion: unverified`, `versionSource: unknown`, empty event/control lists, and `verification.status: unverified`. Publisher declarations remain visible for review but cannot become effective AMC claims: plugin receipts stay `fail_closed` with `declaration:plugin-not-certified` until the separate public partner-certification lane exists.

Minimal plugin manifest shape:

```json
{
  "v": 1,
  "plugin": {
    "id": "com.example.my-framework-adapter",
    "name": "My Framework Adapter",
    "version": "1.0.0",
    "description": "AMC adapter definition for My Framework",
    "publisher": {
      "org": "Example",
      "contact": "ops@example.com",
      "website": "https://example.com",
      "pubkeyFingerprint": "0000000000000000000000000000000000000000000000000000000000000000"
    },
    "compatibility": {
      "amcMinVersion": ">=1.0.0",
      "nodeMinVersion": ">=20",
      "schemaVersions": {
        "policyPacks": 1,
        "assurancePacks": 1,
        "complianceMaps": 1,
        "adapters": 1,
        "outcomes": 1,
        "casebooks": 1,
        "transform": 1
      }
    },
    "risk": {
      "category": "LOW",
      "notes": "Declarative adapter only; no runtime code.",
      "touches": ["adapters"]
    }
  },
  "artifacts": [],
  "generatedTs": 0,
  "signing": {
    "algorithm": "ed25519",
    "pubkeyFingerprint": "0000000000000000000000000000000000000000000000000000000000000000"
  }
}
```

`amc plugin pack` rewrites `artifacts`, `generatedTs`, signing metadata, and publisher fingerprint from the signing key. Keep the zero values in the source manifest only as pack-time placeholders.

Build and verify:

```bash
amc plugin keygen --out-dir ./keys
amc plugin pack --in ./my-amc-plugin --key ./keys/publisher.key --out ./dist/my-framework-adapter.amcplug
amc plugin verify ./dist/my-framework-adapter.amcplug
amc plugin install --registry local ./dist/my-framework-adapter.amcplug
amc plugin workspace-verify
amc adapters list
amc adapters detect
amc adapters capabilities --agent my-agent --adapter my-framework-cli --json
```

Configure and run:

```bash
amc up
amc adapters init
amc adapters configure --agent my-agent --adapter my-framework-cli --route /openai --model gpt-4o
amc adapters env --agent my-agent --adapter my-framework-cli
amc adapters run --agent my-agent --adapter my-framework-cli -- --task "summarize release notes"
```

Runtime behavior:

- AMC mints a short-lived lease and injects it using the adapter's `envStrategy`.
- Provider base URLs point at the running AMC gateway.
- CLI stdout/stderr are captured into the ledger as observed evidence.
- Lease tokens and configured gateway denylist patterns are redacted before evidence is written.
- If `adapters.yaml` signature verification fails, AMC forces simulate mode.

Evidence emitted by CLI adapters:

| Ledger event | Meaning |
|---|---|
| `agent_process_started` | Command, args, adapter id, route, model, lease expiry, work order |
| `agent_stdout` | Redacted stdout chunks |
| `agent_stderr` | Redacted stderr chunks |
| `agent_process_exited` | Exit code |

## SDK Wrapper Adapter

Use the SDK path when your framework exposes callbacks or hooks and you want richer events than stdout/stderr.

```ts
import { FrameworkAdapter } from "agent-maturity-compass";

class MyFrameworkAdapter extends FrameworkAdapter {
  constructor(agentId: string) {
    super({
      framework: "custom",
      agentId,
      agentType: "my-framework-agent",
      capturePayloads: false,
      enforceSafety: true,
      maxActions: 100,
      costBudgetUsd: 2.5,
      metadata: { framework: "my-framework" }
    });
  }

  recordPlannerStep(step: number, action: string, reason: string): void {
    this.recordAgentStep(step, action, reason);
  }

  recordModelResponse(params: {
    model: string;
    prompt: unknown;
    response: unknown;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    durationMs: number;
  }): void {
    this.recordLLMCall(
      params.model,
      params.prompt,
      params.response,
      { prompt: params.promptTokens, completion: params.completionTokens },
      params.costUsd,
      params.durationMs
    );
  }
}
```

SDK event contract:

| Event type | Use for |
|---|---|
| `llm_call` | Model calls with token/cost/duration metadata |
| `tool_call` | Tool/function calls |
| `agent_step` | Planner, reasoning, or task steps |
| `chain_start` / `chain_end` | Framework chain lifecycle hooks |
| `decision` | Handoffs, routing, approvals, or policy choices |
| `error` | Exceptions and failed framework callbacks |

By default, payload capture should stay off. Turn `capturePayloads` on only when you have consent, retention controls, and redaction coverage for the data class being captured.

## Acceptance Checklist

Before publishing or contributing a custom adapter:

- `amc plugin verify <file>` passes.
- `amc plugin workspace-verify` passes after installation.
- `amc adapters list` shows the adapter.
- `amc adapters detect` reports either an installed command or a clear missing-command warning.
- `amc adapters env --adapter <id>` shows the expected base URL and dummy/lease API-key variables without exposing real provider keys.
- `amc adapters run --adapter <id> -- <small command>` writes `agent_process_started`, stdout/stderr when present, and `agent_process_exited`.
- Secrets in stdout/stderr are redacted.
- The adapter works with a minimal real-world task and exits with an accurate code.
- `amc adapters capabilities --agent <id> --adapter <id> --json` returns a trusted fail-closed receipt whose declaration and limitations match the publisher fixture evidence; host-runtime metadata or publisher self-attestation must not produce `verified`.

## Current Limits

- There is no separate `amc adapters create` scaffold command yet.
- Plugin adapters cannot ship executable code; they only define configuration.
- Built-in framework adapters still require source changes under `src/adapters/builtins/` plus tests.
- Python framework scaffolding is still thinner than the Node `init-project` path.

Related docs:

- `docs/ADAPTERS.md`
- `docs/adapters/README.md`
- `docs/ADAPTER_COMPATIBILITY.md`
- `docs/PLUGINS.md`
