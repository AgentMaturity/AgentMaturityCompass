# Note: the PR67 gateway-demo ledger-label follow-up — 18 October 2026

Integration note, added on `rtd/codex-full-integration`; `README.md`, `receipt.json` and `audit.json` in this folder are unchanged.

`README.md` says the PR67 gateway-demo ledger-label follow-up was not treated as a current bug or a new implementation allocation in this slice. That follow-up was implemented afterwards in `ad13ae957` ("fix(demo): enforce scripted lease provenance", on `codex/p1-28-qualification`): leases can carry a signed `claimKind: "synthetic_example"` marker, both demo lease issuers mint it, `runDemo` refuses to send scripted traffic without such a lease for the selected agent and workspace, and the gateway writes `llm_request`/`llm_response` rows from those leases as `synthetic_example` with trust tier `SELF_REPORTED`.

`ad13ae957` is integrated on this branch (merge `c3e23b151`), alongside P1-78's signed lease `principal` field: a lease may carry both, and `tests/domainExampleMode.test.ts` checks a `synthetic_example` lease minted for an authenticated principal keeps both signed fields. That change has no RED/GREEN qualification receipt of its own; the tests in `tests/domainExampleMode.test.ts` are its only evidence, and nothing in this folder qualifies it.
