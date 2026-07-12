# Action Policy Evidence Logic

AMC can compose the maturity and assurance requirements already declared by one signed Action Policy rule. It does not add payload selectors, custom evaluators, or another policy language.

## Mandatory Gates

Evidence logic never controls these gates:

- Action Policy signature and trusted configuration
- minimum trust tier
- risk-tier sandbox requirement
- execution ticket
- budget state
- incident freeze
- work-order action scope
- the rule's `allowExecute` flag

Every mandatory gate is still required for `EXECUTE`, even when an evidence alternative passes.

## Tree Shape

The only nodes are:

- `{ "gate": "maturity:AMC-1.8" }`
- `{ "all": [ ... ] }`
- `{ "any": [ ... ] }`

Each declared maturity and assurance gate must appear exactly once. An `any` subtree can contain only one evidence family, so maturity cannot substitute for assurance. AMC rejects `not` because missing or failed evidence must not become permission.

Trees are strict and bounded to 6 levels, 64 nodes, 16 children per group, and 8,192 serialized bytes. Unknown fields, mixed node shapes, duplicate gates, empty or single-child groups, undeclared gates, omissions, oversized trees, and cross-family alternatives fail closed.

An explicitly authored tree can cover at most 60 declared gates within those bounds. Larger pre-existing rules keep their original direct implicit-ALL runtime behavior, but this authoring surface rejects them instead of returning or storing an unbounded tree.

Existing policy keys that already fit the public gate-ID grammar remain readable. Legacy question or assurance IDs containing spaces, slashes, or excessive length are represented by a deterministic `~<sha256>` component. The label still identifies the original requirement, while the bounded opaque gate ID keeps inspection, projection, API schemas, and runtime evaluation compatible.

## Workflow

Inspect one signed Action Policy rule:

```bash
amc policy action logic show DEPLOY
```

Create `deploy-evidence-logic.json`:

```json
{
  "all": [
    { "gate": "maturity:AMC-1.7" },
    { "gate": "maturity:AMC-1.8" },
    {
      "any": [
        { "gate": "assurance:governance_bypass" },
        { "gate": "assurance:unsafe_tooling" }
      ]
    }
  ]
}
```

Preview without writing:

```bash
amc policy action logic compile DEPLOY \
  --file deploy-evidence-logic.json
```

The preview includes a content-bound compile ID, current and candidate policy hashes, the candidate logic hash, and whether alternative-path acknowledgement is required. It never returns the Action Policy body, workspace paths, credentials, keys, prompts, or tool payloads.

Apply a fresh preview:

```bash
amc policy action logic apply DEPLOY \
  --file deploy-evidence-logic.json \
  --confirm action-logic-compile-0123456789abcdef \
  --acknowledge-alternatives
```

Apply rechecks the signed baseline under the shared Action Policy writer lock and performs a final byte compare immediately before mutation. Evidence logic, scope templates, Policy Pack apply, policy initialization, and public re-signing therefore cannot overlap. While recovery evidence is pending, every other writer fails closed. A stale compile ID, invalid signature, malformed tree, changed baseline, busy writer, signing failure, failed post-write verification, or evidence-finalization failure stops the mutation and restores the prior policy and signature bytes.

A real edit changes only the selected rule's YAML node, preserving unrelated comments and formatting before the exact candidate is reparsed and signed. A semantic no-op preserves the exact signed baseline bytes and writes no policy or success evidence. A bounded local write-ahead record supports recovery if the process stops mid-apply. If evidence finalization fails after a transparency append, AMC restores the policy and emits compensating rollback evidence. The journal remains until both rollback stores are durable; successful mutation appends both transparency and ledger evidence bound to the action class, compile ID, logic hash, and baseline/candidate policy hashes.

## Studio And API

Studio exposes the same flow on Policy Packs. Ungrouped gates remain mandatory; the visual builder groups same-family gates as alternatives. Changing the action class or any group invalidates the preview. Apply requires the exact compile ID and the alternatives checkbox when applicable.

The visual builder intentionally edits only the compact form it can round-trip exactly: top-level mandatory gates plus same-family alternative groups. A valid deeper tree authored through the CLI or API is displayed read-only in Studio instead of being flattened or silently reset.

The authenticated API contract is:

- `GET /api/v1/policy/action/evidence-logic?actionClass=DEPLOY`
- `POST /api/v1/policy/action/evidence-logic/compile`
- `POST /api/v1/policy/action/evidence-logic/apply`

Inspection is read-only, compile is an authenticated analyzer, and apply is owner-only. Invalid signed identity or trust configuration puts remote mutation into read-only mode.

The public specification remains OpenAPI 3.0.3 and uses 3.0-compatible nullable schemas. It advertises the same 60-gate limit enforced by the implementation.

## Existing Policy Compatibility

Rules without `evidenceLogic` keep the original behavior: every declared maturity and assurance requirement must pass. Built-in Policy Packs and existing Action Policy files therefore retain their runtime semantics.

The verified control projection shows the effective tree and mandatory gates. Control simulation calls the production Action Policy evaluator and reports every evaluated branch, including failed alternatives, without writing evidence. Denial reasons include only gates that block the root formula; a failed sibling inside an already-passing `any` group remains visible in conditions but is not presented as required remediation.
