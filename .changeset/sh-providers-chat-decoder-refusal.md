---
"agent-maturity-compass": patch
---

The OpenAI Chat decoder (used by `openai`, the OpenAI-compatible routes and Azure) now fails a stream carrying output it does not decode — `reasoning_content` from a reasoning model, a `refusal`, audio, annotations or a legacy `function_call` — as `INVALID_REQUEST` instead of `TRANSPORT`, so it is no longer retried up to five times (each a billed request on a remote provider) for a result that cannot change. The Responses adapter already coded its unsupported output this way.
