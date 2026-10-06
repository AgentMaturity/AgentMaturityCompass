# Northstar Prompt Packs

Northstar prompt packs are signed, deterministic prompt artifacts that AMC generates per agent and enforces through Bridge.

Pack path:
- `.amc/prompt/packs/agents/<agentId>/latest.amcprompt`

Core properties:
- signed with AMC signer abstraction (Vault or Notary)
- linted for secrets/PII/path leakage
- bound to signed inputs (CGX pack, prompt policy, canon, diagnostic bank, targets hash)
- provider-specific prompt payloads for OpenAI, Anthropic, Gemini, xAI, and OpenRouter

What a pack contains:
- mission and operating constraints (safe, redacted summary)
- truth constraints and output contract
- provider/model/tool allowlists
- top transformation checkpoints and advisory summaries
- hash bindings to upstream signed governance artifacts

What a pack does **not** contain:
- API keys, bearer tokens, vault/notary secrets
- raw prompts from agent sessions
- full evidence payload text
- free-form private workspace content

Commands:

```bash
amc prompt init
amc prompt verify
amc prompt pack build --agent <agentId>
amc prompt pack show --agent <agentId> --provider openai --format text
amc prompt pack verify .amc/prompt/packs/agents/<agentId>/latest.amcprompt --pubkey <recorded-auditor.pub>
```

Fail-closed behavior:
- if prompt policy signature is invalid and enforcement is `ENFORCE`, Bridge requests return `503`
- if pack signature/sha/lint is invalid under enforce mode, Bridge requests return `503`

This keeps recurrence safe: prompt guidance can refresh continuously while still staying tamper-evident and offline-verifiable.
