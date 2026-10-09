---
"agent-maturity-compass": major
---

Security: close five G0 follow-ups that left fail-open paths (P0-55).

- `POST /api/v1/passport/trust-token/verify` no longer checks a token's HMAC. It refuses a body that carries `secret` (or any pin or allow flag) with 400, and answers `status: "not_evaluated"`, `valid: false`, the token's `tokenSha256` and the reason, with the route's claim label: a trust token is an HMAC under a shared secret and names no signer the server operator's trust list can admit.
- `POST /api/v1/enforce/formal/certificate` adds `status: "UNTRUSTED"` and a `reason` built from its verifier report; `valid` stays `false`.
- `amc imports verify-profile` also accepts an `evidence-authority` entry of a loaded trust list whose `keyId` equals the profile's `signature.authorityId`, with that entry's `authority` scope. A listed key is admitted by its list (validity window, revocation), never pinned; an id named by both the `--authorities` file and a list matches neither. An untrusted profile now reports `trustTier: "SELF_REPORTED"`.
- Under `AMC_NO_SIGN=1`, the maturity diagnostic (the instant `amc` score when the vault cannot be unlocked, `amc run`, `amc quickscore --auto`, fleet trust composition) and every monitored process (`amc wrap`, `amc supervise`, `amc evidence collect --first-run`, delegated children) write to `.amc/unsigned/evidence.sqlite`, never to `.amc/evidence.sqlite`, as unsigned assurance runs already did. Such a diagnostic scores the unsigned store's evidence, and its run is not listed by signed readers. An unsigned first-run capture now prints `Next: AMC_NO_SIGN=1 amc quickscore --auto`.
- An assurance run's session and its `ASSURANCE_RUN_STARTED` row commit together, so a run whose first row fails leaves no unsealed session.
- An `ATTESTED` row's bundle entry must carry a time no more than five minutes after the row that copies it; a row read without its time, or an entry dated later, reads `SELF_REPORTED`. An attested event counts once per original event and agent, whichever key, bundle or session attests it.
- A compliance control's claim kind is `observed` only when its evidence is sufficient and every admitted item is `OBSERVED`; incomplete, stale or contradictory evidence reads `self_reported`.
