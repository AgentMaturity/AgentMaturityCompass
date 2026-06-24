# Truthguard

Truthguard is a deterministic linter for agent output contracts.

It validates structured output:

```json
{
  "v": 1,
  "answer": "string",
  "claims": [{
    "text": "string",
    "evidenceRefs": ["..."],
    "correctnessProofStatus": "proven | disproven | unsupported | not_applicable",
    "domainProofRefs": ["amcproof_..."]
  }],
  "unknowns": [{ "text": "string" }],
  "nextActions": [{ "actionId": "string", "requiresApproval": true }]
}
```

Checks:
- claim inflation guard: action-like claims must include evidence refs
- evidence binding: refs must exist in AMC evidence ledger when workspace validation is used
- domain-correctness claim guard: answer-level correctness claims require `correctnessProofStatus: "proven"` and at least one `domainProofRefs` entry; otherwise Truthguard fails closed with `UNSUPPORTED_CORRECTNESS_PROOF`
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
- it does not prove domain correctness from ordinary evidence refs, badges, report signatures, or factuality annotations
- it does not replace domain review or approvals
- it does not grant execution rights by itself

## Domain Correctness Proof Status

Truthguard separates three proof classes that buyers otherwise conflate:

| Proof class | Meaning | Truthguard boundary |
|---|---|---|
| Evidence integrity proof | The event, claim, report, or artifact was captured, signed, and not silently altered. | Evidence refs and ledger checks can support this. |
| Runtime policy proof | A runtime action respected declared AMC policy or invariant checks. | Policy proof refs can support this. |
| Domain correctness proof | A specific answer follows a declared source-to-rule manifest. | Requires `correctnessProofStatus: "proven"` and at least one `domainProofRefs` `amcproof` artifact. |

Allowed `correctnessProofStatus` values:

- `proven` — checked against a declared rule manifest and backed by an `amcproof` artifact.
- `disproven` — checked and a counterexample/failing clause was found.
- `unsupported` — no answer-level source-to-rule proof exists; this is the safe default for ordinary evidence-bound claims.
- `not_applicable` — the claim is not a domain-correctness claim.

If a claim says or implies that a domain answer is verified/correct under rules but lacks `correctnessProofStatus: "proven"` plus a `domainProofRefs` entry, Truthguard returns `FAIL` with `UNSUPPORTED_CORRECTNESS_PROOF`. This keeps AMC's Score, Comply, Passport, Vault, and Enforce surfaces from overclaiming domain correctness.

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
