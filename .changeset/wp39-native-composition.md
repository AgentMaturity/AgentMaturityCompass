---
"agent-maturity-compass": patch
---

Compose every native surface through one path. ACP sessions, Studio native tasks, the SDK's openAgentSession and delegated children now build their agent through composeNativeAgent, so the workspace's AGENTS.md / instruction files, the time context and the governance section reach the model on every surface exactly as on `amc agent-loop`; a caller's system prompt becomes the persona section. A session whose composition throws (unknown route, an unresolved `{{variable}}`, an admission refusal) now closes with reason `composition_failed` instead of `completed`, and an unknown route is refused at composition rather than at the first request. A request retry re-sends on the adapter its step pinned, so a route replaced during the backoff cannot change which adapter answers that step. `amc composition` reports `bootedBy: []`: boot()/amc.cordis.yml and SettingsStore remain library-only.
