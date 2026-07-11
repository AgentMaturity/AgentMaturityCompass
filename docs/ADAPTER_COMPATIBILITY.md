# Adapter Compatibility and Capability Proof

AMC ships 14 built-in adapter definitions. A definition is not proof that its runtime is installed, that a framework package matches the host runtime, or that every provider event is visible.

Use the authoritative registry and a signed capability receipt instead of a static compatibility badge:

```bash
amc adapters init
amc adapters configure --agent my-agent --adapter claude-cli --route /anthropic --model claude-sonnet-4-6 --mode SUPERVISE
amc adapters capabilities --agent my-agent --adapter claude-cli --out adapter-capabilities.json --json
```

## Built-In Declarations

| Adapter ID | Runtime probe means | Provider-native hook control | Important lossiness |
| --- | --- | --- | --- |
| `autogen-cli` | AutoGen CLI when present, otherwise host Python only | No | Fallback Python version does not prove AutoGen |
| `claude-cli` | Claude binary version | Allow, deny, ask when a signed control hook is installed | Managed hook covers pinned `PreToolUse`, not every lifecycle hook |
| `crewai-cli` | CrewAI CLI when present, otherwise host Python only | No | Fallback Python version does not prove CrewAI |
| `gemini-cli` | Gemini CLI binary version | Allow and deny when a signed control hook is installed | Native ask is unavailable and fails closed to deny |
| `generic-cli` | Shell runtime only | No | Shell version does not identify the wrapped agent |
| `langchain-node` | Host Node.js only | No | Node version does not prove LangChain package/version |
| `langchain-python` | Host Python only | No | Python version does not prove LangChain package/version |
| `langgraph-python` | Host Python only | No | Python version does not prove LangGraph package/version |
| `llamaindex-python` | Host Python only | No | Python version does not prove LlamaIndex package/version |
| `openai-agents-sdk` | Host Node.js only | No | Node version does not prove OpenAI Agents SDK package/version |
| `openclaw-cli` | OpenClaw binary version | No AMC-managed native hook yet | Gateway/process evidence only |
| `openhands-cli` | OpenHands binary version | No AMC-managed native hook yet | Gateway/process evidence only |
| `python-amc-sdk` | Installed AMC Python package version | No | SDK callbacks determine event depth |
| `semantic-kernel` | Host Node.js only | No | Node version does not prove Semantic Kernel package/version |

Every declaration includes exact events, controls, activation conditions, definition version, known omissions, verification authority, and fixture evidence references. Plugin adapters that predate this contract still load, but receive an explicit `unverified` declaration with no advertised event or control capability. Publisher self-attestation is never upgraded to AMC verification; all plugin receipts remain fail closed until the separate partner-certification lane exists.

## Receipt States

| State | Meaning |
| --- | --- |
| `verified` | Declaration evidence, runtime/version probe, signed adapter selection, and any required control hook are valid for this receipt subject. |
| `partial` | The signed facts are valid, but the probe is host/shell-only or an optional native hook is absent/observe-only. |
| `fail_closed` | Runtime/version, signed configuration, declaration evidence, or hook integrity is missing or invalid. No green capability claim is allowed. |

Receipt validity and capability status are separate. A correctly signed `partial` or `fail_closed` receipt is valid proof of a limitation; tampered bytes, an untrusted signer, unknown schema fields, or an inconsistent effective projection make the receipt itself invalid.

## What The Base Adapter Path Can Prove

When `amc adapters run` is active, the adapter process path can emit `process.started`, redacted `process.stdout`, redacted `process.stderr`, and `process.exited`. Model request/response evidence is effective only when the signed agent profile routes a compatible runtime through AMC's gateway. Provider-native action requests and decisions are effective only for the currently installed, signed Claude Code or Gemini CLI hook mode.

No adapter receipt claims AEP conformance. AMC does not copy AEP mappings, Agent Control SDKs, provider payloads, prompts, tool arguments, or upstream implementation details.

## Custom Adapters

Custom plugin adapters must declare the same capability block and pass plugin signature/integrity checks. See [Custom Adapter Authoring](CUSTOM_ADAPTER.md) for the schema and fail-closed migration behavior.
