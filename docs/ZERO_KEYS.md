# Zero-Key Agents

AMC enforces a keyless-agent model: provider API secrets stay in the trusted Studio/Gateway boundary and are never exposed to agent processes.

## Security Model

- Provider credentials are stored in vault-backed Studio configuration.
- Gateway injects upstream auth internally.
- Agent requests are not allowed to provide real provider credentials.

## Gateway Behavior

If inbound agent traffic includes auth material (for example `Authorization`, `x-api-key`, query `key`):
- Gateway strips/ignores agent-supplied credentials.
- Gateway does not forward those credentials upstream.
- Gateway writes `AGENT_PROVIDED_KEY_IGNORED` audit evidence.

## Dummy Keys

Some SDKs require local key presence before making calls. `amc connect` outputs harmless placeholders:

```bash
OPENAI_API_KEY=amc_dummy
ANTHROPIC_API_KEY=amc_dummy
GEMINI_API_KEY=amc_dummy
```

These are compatibility placeholders only. They are never treated as secrets or used for upstream auth.

## What you can check

- Evidence is redacted before hashing/storage.
- Provider keys are never expected in evidence blobs.
- Tests include key-pattern scanning over generated evidence.
