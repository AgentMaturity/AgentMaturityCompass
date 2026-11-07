---
"agent-maturity-compass": minor
---

SH-PROVIDERS-04: provider-driven retry delays and retry flags. A provider's `Retry-After` is now honoured up to a separate provider ceiling (`backoff.maxProviderDelayMs`, default max(60 s, `maxDelayMs`)) instead of being clamped to the 10 s local backoff ceiling; a clamp is written into the signed `loop/retry` reason. On a 429 without `Retry-After`, the wait is read from the rate-limit reset header whose remaining counter the provider reports as 0 (`x-ratelimit-reset-requests|tokens` durations, `anthropic-ratelimit-*-reset` instants); the recorded failure names the header it came from in a new optional `providerDelayHeader` fact, so a derived wait is never presented as a Retry-After the provider never sent. `--max-retries <n>` and `--retry-max-delay <ms>` on run, acp and schedules (`maxRetries`, `retryMaxDelayMs` in the SDK) set the route's frozen retry policy; `--max-retries 0` gives up on the first failure.

freeze-exception: SH-PROVIDERS — new retry flags on existing native commands, asked for by the harness program.
