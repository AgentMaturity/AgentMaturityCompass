---
"agent-maturity-compass": patch
---

Reject duplicate pack, control and citation-source identities in catalog lockfiles. A conflicting entry can no longer be hidden by a later entry with the same identity during lock verification. Preserve scalar types when comparing pins, so JSON null cannot be replaced by the string "null"; mismatch values use JSON encoding to make that distinction visible. Add the catalog schema, citation, loader, predicate and digest regression tests required by P1-09.
