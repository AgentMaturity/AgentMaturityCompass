---
"agent-maturity-compass": patch
---

Make the native breadth tools usable and tested. In native chat with workspace tools, `ask_user` now prompts on the terminal and returns an auditor-signed answer (a monitor-signed or mis-bound answer is still refused), and it accepts a `questions` array of up to four questions, with `allowOther` and `multiSelect`, answered in one signed record. `agent-loop run` and `chat` accept `--web-search-searxng <origin>`, an opt-in SearXNG provider for `web_search` that still needs the origin granted in the signed tools policy; without it `web_search` keeps refusing with a clear reason. `web_search` also accepts up to five `queries` in one call. The model now sees the installed skill catalog (name and description) through a governed READ_ONLY `skill.load` tool that returns the attributed body and records its digest; `disable-model-invocation: true` hides a skill from the model. The session's signed todo and plan are shown after each CLI turn, and todo/plan calls verify the whole ledger once per session instead of on every call. `agent-loop run --goal-rounds <n>` with `--delegate` runs bounded goal rounds.

sdk-api: `AgentSessionInit` gains optional `askUser` and `webSearchProvider`, passed through to the native toolset, so an SDK, ACP or Studio host can compose a signed ask_user answerer and an operator-configured search provider. Additive and optional.

`amc acp --ask-user` sends `ask_user` to the client as the `_amc/ask_user` request (`{ outcome: "answered", answers }` or `{ outcome: "cancelled" }`) and signs the answer host-side with the auditor key; a cancel, error or malformed reply fails the call. `amc acp --web-search-searxng <origin>` configures the same opt-in search provider. Both require `--tools workspace`.
