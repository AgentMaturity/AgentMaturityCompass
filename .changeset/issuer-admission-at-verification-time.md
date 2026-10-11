---
"agent-maturity-compass": major
---

Issuer admission no longer trusts the signing time an artifact claims. Every verify command, API route and internal check that admits a key from a trust list now judges distrust, the key's validity window and its revocation at the verification time, through one rule (`src/trust/admissionRule.ts`) that the standalone verifier `amc-verify` also uses. Verdicts that change:

- A key revoked for a reason other than `key-compromise` (`superseded`, `cessation`, `unspecified`) is refused once its `revokedAt` has passed, even for a signature that claims an earlier time. Before, that signature was admitted with `timeBasis: "claimed"` and a warning.
- A key past its `validTo` is refused even for a signature that claims an earlier time. Before, it was admitted with a warning. After a key rotation that ends the old key's `validTo`, an artifact the old key signed verifies only through signed key history (an anchor with `allowKeyHistory: true`) or a list that still admits the old key.
- A distrust entry with a `distrustedFrom` date refuses every signature once the verification time reaches that date. Before, it refused only signatures that claimed that date or later, or claimed no time; a signature claiming an earlier time was admitted. A distrust entry dated after the verification time no longer refuses a signature that claims no time.
- A key-history anchor is judged the same way.

Unchanged: explicit pins, `key-compromise` revocations (refused for every time), and the refusal of a claimed time after the verification time or before the key's `validFrom`. Attested signing times from RFC 3161 tokens are not used by admission yet; passing one to the shared rule is the seam that would admit a signature proven earlier than a revocation. The key rotation, root rotation and revocation list parsers now report an impossible date (such as 2026-02-30) as a schema error instead of throwing a `RangeError`.
