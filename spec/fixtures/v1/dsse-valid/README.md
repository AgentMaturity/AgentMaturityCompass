# dsse-valid

A key-based Sigstore bundle holding a DSSE envelope whose in-toto statement binds the agent's AIBOM and run report by digest, signed over the DSSE PAE by a key the pinned list admits for artifact-seal, in scope, fresh, with both subjects and the cited ledger slice supplied. Integrity, issuer, scope, freshness and completeness pass. Satisfaction is not evaluated: the statement declares a result this verifier cannot recompute (NOT_RECOMPUTABLE), so the exit code is 3, not 0.
