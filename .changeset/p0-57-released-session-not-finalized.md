---
"agent-maturity-compass": patch
---

Studio's verify of a released (not closed) native task now says why it is not verified: "This native session is not closed and sealed, so it is not finalized…". It used to say "Cold native verification refused this evidence. Inspect the ledger before making claims.", which reads like an integrity failure. Release hands the writer over for a later resume and does not seal the session, and Studio verifies only a closed, sealed session (P0-14), so the result is still `failed` and no verified result is claimed. The verifier's report (`verifyAgentRun` in the live scope Studio uses) now carries `targetFinalized` and `intactUnlessUnfinalized` from the same read as its chain verdict. Studio names "not finalized" only when that is the sole failure; any other failure stays an integrity refusal.
