# Truthguard

Truthguard is a deterministic linter for agent output contracts.

It validates structured output:

```json
{
  "v": 1,
  "answer": "string",
  "claims": [{ "text": "string", "evidenceRefs": ["..."] }],
  "unknowns": [{ "text": "string" }],
  "nextActions": [{ "actionId": "string", "requiresApproval": true }]
}
```

Checks:
- claim inflation guard: action-like claims must include evidence refs
- evidence binding: refs must exist in AMC evidence ledger when workspace validation is used
- allowlist guard: tagged `tool:<name>` and `model:<name>` must match policy allowlists
- secret guard: detects key/token/private-key patterns and redacts snippets

Commands:

```bash
amc truthguard validate --file ./output.json
```

API:
- `POST /api/truthguard/validate`

Trust labels:
- lease-auth validation is `SELF_REPORTED` by default
- if claims are fully bound to existing AMC evidence refs, result can be elevated to observed binding
- owner/operator validation is treated as attested operator action

What Truthguard does not prove:
- it does not prove business correctness
- it does not replace domain review or approvals
- it does not grant execution rights by itself

## FACTS-Style Factuality Annotations

Truthguard supports classifying individual claims by their factuality source, inspired by Google DeepMind's FACTS benchmark:

- `parametric` — claim derived from the model's internal knowledge
- `search_retrieval` — claim derived from RAG or search tool results
- `grounded` — claim derived from user-provided context
- `unknown` — unclassified

Each claim can be annotated with a `TruthguardFactualityAnnotation`:

```json
{
  "claimIndex": 0,
  "factualityClass": "parametric",
  "verified": true,
  "confidence": 0.95
}
```

This enables per-claim factuality tracking and feeds into the FACTS factuality scoring dimensions in `src/score/factuality.ts`.
