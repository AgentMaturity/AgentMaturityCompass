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

Chat uses `openai-chat@2` for new requests. Historical `openai-chat@1` remains registered with its original byte encoding so old signed requests can still be reconstructed. The new Responses route uses `openai-responses@1`; its first release includes this envelope. Signed request headers select the exact encoder version during reconstruction.

Capability discovery reports `tool-result-error-text: supported` and `toolErrorRepresentation: amc-text-envelope-v1` for these native routes. `tool-result-error-flag` remains unsupported: the failure state is AMC text, not a dedicated OpenAI protocol field. Callers explicitly requiring that wire flag still receive a refusal. Anthropic keeps its existing `is_error` representation.

OpenAI documents function results as strings whose format may contain JSON or error information; AMC's envelope is an application convention within that output. [Official function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling#formatting-results).
