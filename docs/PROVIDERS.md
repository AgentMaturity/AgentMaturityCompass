# Providers

AMC provider coverage is config-driven via gateway routes and templates. Defaults are provided where stable, and all base URLs are overrideable.

## Supported Provider Templates

- OpenAI (OpenAI-compatible)
- Azure OpenAI (OpenAI-compatible)
- xAI Grok
- Anthropic Claude
- Google Gemini
- AWS Bedrock (user-supplied upstream template)
- Google Vertex AI (user-supplied upstream template)
- Mistral
- Cohere
- Groq
- OpenRouter
- Together AI
- Fireworks
- Perplexity
- DeepSeek (OpenAI-compatible)
- Qwen (OpenAI-compatible)
- Local OpenAI-compatible servers (vLLM, LM Studio, llama.cpp server, Ollama OpenAI mode)
- Other / Custom upstream HTTP endpoint

## Commands

```bash
amc provider list
amc provider add --agent <agentId>
```

`provider add` updates and signs:

- `.amc/agents/<agentId>/agent.config.yaml`
- `.amc/agents/<agentId>/agent.config.yaml.sig`

It also updates `.amc/gateway.yaml` and re-signs `.amc/gateway.yaml.sig`.

## Gateway Routing

```bash
amc gateway init --provider "OpenAI"
amc gateway start --config .amc/gateway.yaml
amc gateway bind-agent --agent <agentId> --route /openai
```

Supervise an app through the route:

```bash
amc supervise --agent <agentId> --route http://127.0.0.1:3210/openai -- <cmd...>
```

## OpenAI-Compatible Mode

For routes marked `openaiCompatible: true`, AMC logs model/usage/tool signals best-effort while still transparently proxying full request/response traffic.

For non-compatible APIs, AMC still captures signed request/response bytes and metadata (`model` may remain unknown).

## Native failed-tool replay

Native OpenAI Chat Completions and Responses runs preserve failed tool results in the next model request. AMC represents each result as canonical JSON text inside the protocol's normal tool-output string:

```json
{"isError":true,"output":"Tool denied by the signed policy.","type":"amc.tool-result","version":1}
```

Successful results use the same envelope with `isError:false`. Original output remains an escaped string; it is never parsed as envelope fields. Wrapping both states keeps successful output that happens to resemble a failure envelope distinct from an actual failed result. Provider call IDs and raw tool-call arguments remain unchanged. The envelope reports the native ledger's boolean error state; it does not invent a more specific outcome or grant permission to retry.

Chat uses `openai-chat@3` for new requests; Responses uses `openai-responses@2`. Both retain the result envelope and add the native tool-name binding below. Historical Chat versions 1 and 2 and Responses version 1 remain registered with their original byte encoding. Signed request headers select the exact encoder version during reconstruction.

Capability discovery reports `tool-result-error-text: supported` and `toolErrorRepresentation: amc-text-envelope-v1` for these native routes. `tool-result-error-flag` remains unsupported: the failure state is AMC text, not a dedicated OpenAI protocol field. Callers explicitly requiring that wire flag still receive a refusal. Anthropic keeps its existing `is_error` representation.

OpenAI documents function results as strings whose format may contain JSON or error information; AMC's envelope is an application convention within that output. [Official function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling#formatting-results).

## Native tool identity and provider names

AMC owns this translation in its native Chat, Responses and Anthropic routes; no DSH or Pi runtime is involved. Configure permissions and tool choices using the original names, including `fs.read`, `fs.write`, `fs.edit` and generated MCP names.

New encoders (`openai-chat@3`, `openai-responses@2`, `anthropic-messages@3`) produce ASCII function names of at most 64 characters. Valid names are retained unless they start with the reserved `amc_` prefix. Other names receive a readable prefix plus a full SHA-256 digest. Exact Unicode identities remain distinct; punctuation replacement alone never decides identity. Duplicate declarations and detected collisions refuse before transport.

The runtime pins its return-name lookup when preparing the signed request. Only names offered in that request may resolve to tools. An unknown name, a historical-only name or a name changed midway through a stream produces a signed request failure before tool execution. Existing signed policy, path, budget and approval checks still govern every resolved call.

Signed tool schemas and `tool/call.toolName` retain the original permission identity. New call rows also carry versioned `providerName` provenance: the decoded provider name, request header and encoder version. Truncated or dropped calls retain that identity in a versioned dropped-content envelope. This records decoded provider names; it does not claim to retain original HTTP/SSE response bytes.

Replay and explicit tool choices receive the same deterministic translation. A historical tool can be replayed without being offered again; replay grants no present execution authority. Every previous encoder version remains available unchanged for cold reconstruction.

The strict local acceptance fixture enforces the documented Chat name grammar; paid provider acceptance remains separately qualified. [OpenAI Chat function definitions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
