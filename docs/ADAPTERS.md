# AMC Adapters Guide

Adapters are AMC's one-liner integration system. They wrap any AI agent CLI or SDK, automatically capturing evidence through the AMC gateway.

Adapters are part of AMC's current TypeScript integration path. They are not a separate runtime. For the architecture overview, read `docs/ARCHITECTURE_BRIEF.md`. For core-versus-wrapper clarity across SDKs, extensions, actions, and legacy paths, read `docs/IMPLEMENTATION_REALITY_MAP.md`.

Need an adapter for a framework AMC does not ship yet? Read `docs/CUSTOM_ADAPTER.md` for the declarative plugin adapter schema, SDK wrapper path, evidence contract, and acceptance checklist.

## How Adapters Work

When you run `amc adapters run`:
1. A short-lived **lease** is minted automatically
2. Compatibility **env vars** are injected (base URL + lease token)
3. Model traffic routes through the **AMC gateway**
4. Signed evidence is captured: `agent_process_started`, `stdout`, `stderr`, `exited`
5. Lease tokens are **redacted** from logs

## Setup

```bash
amc adapters init          # create signed adapters.yaml
amc adapters list          # show available adapters
amc adapters detect        # detect installed runtimes
```

## Signed Capability Receipt

Do not infer adapter coverage from its name or from a detected host runtime. Issue a signed receipt for the exact agent and adapter instead:

```bash
amc adapters capabilities \
  --agent my-agent \
  --adapter claude-cli \
  --out adapter-capabilities.json \
  --json
```

The receipt separates:

- **declared** events and controls in the authoritative adapter registry;
- **effective** events and controls for the current signed configuration and hook mode;
- the adapter definition version from the detected runtime version;
- adapter-binary/package probes from weaker host-runtime or shell probes;
- known normalization and redaction lossiness;
- `verified`, `partial`, or `fail_closed` status with machine-readable reasons.

The canonical bytes are SHA-256 hashed and signed by AMC's existing auditor trust path. Receipts exclude prompts, tool arguments, stdout/stderr content, cwd, transcript paths, lease tokens, and secrets. A missing runtime, missing version, invalid adapter-config signature, drifted hook, untrusted signer, metadata-only plugin, or publisher self-attestation cannot produce a green capability result. Plugin receipts stay fail closed until AMC's separate partner-certification lane exists.

The same contract is available from `POST /api/v1/adapters/capability-receipts` and from the TypeScript exports `issueAdapterCapabilityReceipt` and `verifyAdapterCapabilityReceipt`.

## Claude CLI (Anthropic)

```bash
amc adapters run --agent my-claude --adapter claude-cli -- claude --model claude-sonnet-4-6
```

The gateway can observe model requests/responses when Claude honors the configured route. A verified `amc connect hooks` installation records requested actions plus completed or failed terminal events; control mode also records allow, deny, ask, and corrective steer outcomes. Steer is available only for a trusted ToolHub argument rejection: AMC blocks the current call, returns bounded corrective context, performs no input rewrite, and requires a new fully governed action for retry. Use the signed capability receipt to see what is effective now.

```bash
amc connect hooks lifecycle --agent my-agent --action <action-id>
```

This Watch projection verifies the immutable request, optional decision, and terminal receipts under one action ID. It separates the requested outcome, provider wire decision, effective outcome, and capability mapping. A steered action is still blocked; execution under that same action ID fails closed. Missing, duplicate, conflicting, cross-agent, out-of-order, or tampered evidence fails closed. Raw tool input, output, and provider error messages are not retained.

For supported shell input, control mode performs one compound-command blast-radius review over every bounded segment through the existing signed ToolHub, Action Policy, Approval Policy, budget, freeze, maturity, and assurance controls. The most restrictive segment determines the provider outcome. Unsupported shell expansion, malformed syntax, excess bounds, or untrusted signed authority fails closed with no partial step decisions. Receipts retain only canonical tool names, action classes, connectors, outcomes, reason codes, and aggregate counts; the raw command and argument values are never stored.

Control is enforced at the Claude Code `PreToolUse` hook only, and only while Claude Code runs that hook; the `PostToolUse` and `PostToolUseFailure` hooks record outcomes and cannot stop a call that already ran. The installed handler runs the absolute Node binary that ran the install with AMC's absolute `dist/cli.js`, in exec form with no shell. Every deny exits 2 with the deny JSON and a redacted reason on stderr: a policy deny, empty or invalid input, a Bridge error, a thrown error, and the forwarder deadline. The deadline is at most 5 s and is shortened by the time the process spent starting, so the hook ends at least 1 s before the 10 s hook timeout. Allow and ask exit 0 with their JSON. A failed `PostToolUse` or `PostToolUseFailure` delivery exits 2 with `{}` and says the outcome was not recorded and the action already ran.

Claude Code still runs the tool when the hook cannot start, when it is cancelled at its timeout, and when `disableAllHooks` or managed `allowManagedHooksOnly` switches hooks off. So `amc connect hooks status --provider claude-code` runs the installed handler with a probe payload the forwarder rejects before policy, Bridge or the ledger, and prints `Control: verified (probe denied in <n> ms)` only when the handler exits 2 with a deny. The probe runs only while the provider config still matches the signed installation manifest; a drifted or tampered handler prints `Control: NOT VERIFIED (drifted)` and is never run. A missing command, a failed probe, or `disableAllHooks` in the user, project or local settings prints `Control: NOT VERIFIED (<reason>)` and `status` exits 1; `hooks health` runs the same probe and exits 1, or 2 when its signed-evidence projection already fails closed. Re-install after upgrading or moving AMC or switching Node (nvm, Volta): the absolute paths go stale, and `status` reports `stale` with the re-install command. A control install from the npx cache is refused. Managed settings are read from the platform's default path, which was not verified against every Claude Code release; when no managed file is readable, `status` says "managed settings not checked". Windows is not verified. The offline end-to-end test spawns the installed configuration the way the hooks reference describes; no live Claude Code release was run against it for this change.

Configure as default for an agent:

```bash
amc adapters configure --agent my-claude --adapter claude-cli --route /anthropic --model claude-sonnet-4-6
```

## Gemini CLI (Google)

```bash
amc adapters run --agent my-gemini --adapter gemini-cli -- gemini --model gemini-flash
```

The gateway can observe model requests/responses when Gemini honors the configured route. A verified `amc connect hooks` installation records requested actions and completed or failed terminal events; control mode also records native allow/deny decisions. Gemini has no verified native ask or corrective-steer outcome in the pinned contract. AMC fails either request closed to deny, marks the mapping lossy, never reports effective steer, and accepts a terminal event only when one unmatched hash-only request correlation exists.

## OpenClaw

```bash
amc adapters run --agent my-openclaw --adapter openclaw-cli -- openclaw run
```

Or configure OpenClaw to route all sessions through the AMC gateway permanently.

## Generic CLI (Any Agent)

For any command-line agent:

```bash
amc adapters run --agent my-bot --adapter generic-cli -- node my-agent.js
amc adapters run --agent my-bot --adapter generic-cli -- python bot.py
amc adapters run --agent my-bot --adapter generic-cli -- ./my-custom-agent
```

## OpenAI SDK (Node.js)

Use `wrapFetch` to intercept all OpenAI API calls:

```typescript
import { wrapFetch } from "agent-maturity-compass";

const fetchWithAmc = wrapFetch(globalThis.fetch, {
  agentId: "my-openai-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
  forceBaseUrl: true,
});

// All OpenAI calls now flow through AMC — evidence captured automatically
const response = await fetchWithAmc("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [{ role: "user", content: "hello" }],
  }),
});
```

## Mobile Apps (React Native / Flutter)

Mobile apps should use AMC Bridge over HTTPS, not the Node `wrapFetch` runtime:

- React Native: use `createReactNativeAMCFetch` from `agent-maturity-compass/sdk/mobile-fetch` when your package manager can consume the mobile-safe subpath, or vendor `src/sdk/mobileFetch.ts`.
- Flutter: call `https://<bridge-host>/bridge/<provider>/...` directly with `authorization: Bearer <AMC bridge token>`, `x-amc-agent-id`, and `x-amc-correlation-id`.
- Keep provider API keys on your backend or in AMC Bridge; do not embed provider keys in mobile apps.

See `docs/SDK.md#mobile-react-native--flutter` for full examples.

## Custom SDK Integration

For programmatic evidence capture:

```typescript
import { wrapFetch, logTrace } from "agent-maturity-compass";

// Option 1: Wrap fetch for automatic capture
const fetch = wrapFetch(globalThis.fetch, {
  agentId: "my-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
});

// Option 2: Manual trace logging
logTrace({ agentId: "my-agent", type: "tool_call", data: { tool: "read_file" } });
```

## Bridge (Connect Remote Agent)

For agents running on a different machine:

```bash
# On owner machine — create a one-time pairing code
amc pair create --agent-name "remote-agent" --ttl-min 10

# On agent machine — redeem the code
amc pair redeem AMC-XXXX-XXXX --out ./agent.token --bridge-url http://owner-ip:3212

# Connect and verify
amc connect --token-file ./agent.token --bridge-url http://owner-ip:3212

# Wrap and run with evidence capture
amc wrap --agent-token ./agent.token --provider auto -- node agent.js
```

## Legacy Wrap Commands

These still work but `amc adapters run` is preferred:

```bash
amc wrap claude -- <args...>
amc wrap gemini -- <args...>
amc wrap openclaw -- <args...>
amc wrap any -- <cmd...>
```

## Supervised Mode (Gateway Injection)

For agents that need explicit gateway routing:

```bash
amc supervise --agent my-agent --route http://127.0.0.1:3210/openai -- node agent.js
```

## Sandboxed Execution

Run agents in a hardened Docker sandbox:

```bash
amc sandbox run --agent my-agent --route http://127.0.0.1:3210/openai -- node agent.js
```

## Provider Routes

The gateway supports these route prefixes:

| Route | Provider |
|-------|----------|
| `/openai` | OpenAI (GPT-4o, o3, etc.) |
| `/anthropic` | Anthropic (Claude) |
| `/gemini` | Google Gemini |
| `/grok` | xAI Grok |
| `/openrouter` | OpenRouter (multi-model) |
| `/local` | Local models (Ollama, etc.) |

## Adapter Environment Variables

View what env vars an adapter injects (without a lease):

```bash
amc adapters env --agent my-agent --adapter claude-cli
```

## Generate Sample Projects

Create a runnable local sample for library-based frameworks:

```bash
amc adapters init-project --agent my-agent --adapter openai-agents-sdk
```

For a framework not covered by a built-in sample, use `docs/CUSTOM_ADAPTER.md` to choose between a declarative plugin adapter and an SDK wrapper adapter.

## Lease Compatibility

AMC accepts leases via these headers:
- `x-amc-lease`
- `Authorization: Bearer <lease>`
- `x-api-key`
- `x-goog-api-key`
- `api-key`

Real provider API keys never leave the vault. Agents receive dummy keys (`amc_dummy`).

## Review imported records

File import is optional interoperability; it does not run a source harness or verify its claims. Use `amc import /path/to/export --dry-run --json` to review the existing normalization receipt before applying. `plan.normalization.recordMapping` adds a versioned, deterministic record map with its own SHA-256 tied to the source semantic digest. CLI JSON, the import API and Studio's Evidence → Neutral Import review expose the same map; `amc imports show <import-id> --json` retains it after import.

The map separates records projected into traces, retained source context, malformed records and unsupported values. Source-relative JSON pointers refer to the redacted parsed artifact; JSONL source lines are recorded where available. These locators are not execution identities or verified evidence. Original source digests and recognized format versions are listed separately; an unversioned format stays unknown. Records in skipped files are not counted as zero when the parser could not inspect them.

Each trace link shows its source time separately from `plan.detectedAt` (ingestion/review time). A retained duration is source-reported, not independently measured by AMC. Missing or invalid duration remains null; no inter-event latency, successful outcome, monetary cost or maturity result is inferred. Fields retained only in the source artifact and partially projected content/metadata are listed without payload excerpts. Redaction markers include nested values; the complete redacted source remains in `normalized.json` when applied.

Presentation detail is bounded to 2,000 records and 2 MB, with up to 80 top-level fields and 32 trace links per record. Accounting still includes omitted records, and the receipt reports every detail limit and omission explicitly. Studio initially displays up to 100 retained record details; the JSON receipt contains the remaining retained detail. Source files with parser errors are listed with actionable reasons. Follow-up argv is copy/review data, never executed by the view. Import application still checks the reviewed semantic digest and writes the same parsed snapshot.
