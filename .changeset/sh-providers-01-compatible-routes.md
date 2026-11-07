---
"agent-maturity-compass": minor
---

SH-PROVIDERS-01: named native routes for OpenAI-compatible servers and Azure OpenAI. `--provider` on `agent-loop run`, `acp`, the schedules runner and the SDKs now accepts `groq`, `mistral`, `xai`, `openrouter`, `together`, `fireworks`, `lmstudio`, `vllm`, `llamacpp` and `azure-openai`. Each route sends the unchanged `openai-chat@4` bytes through the shared Chat decoder under its own honest adapter identity (`openai-compatible-chat@1`, `azure-openai-chat@1`, the latter authenticating with the `api-key` header on Azure's v1 surface), signs the real provider id in every `request/header`, declares images, cache counters and reasoning `unknown` until proven for that server, and attaches no catalog pricing. The local servers default to a loopback origin without a credential; a non-loopback origin still requires `--credential`. `--cache-retention` is refused on these routes even though they share the OpenAI encoder: retention admission is now keyed by adapter id, not encoder id alone. Chat, the guide and Studio's task picker keep their own provider lists and do not offer these routes yet; `docs/NATIVE_PROVIDERS.md` records each origin and limit.

freeze-exception: SH-PROVIDERS — the state-of-the-art harness program asked for provider breadth; these are new native provider routes on existing commands.
