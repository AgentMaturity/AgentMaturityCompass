# P1-51 receipt: paid Industry Packs gate kept, made truthful (D-06 = B)

Environment: local macOS arm64 (Darwin 25.6.0), Node 22, pnpm 10.33.0. Not CI. `receipt.json` lists every command with
its exit code and duration, the focused test totals and the artifact hashes. It was written after `int` was merged in.

No payment provider was contacted and no real key or secret was used. Every Ed25519 licence key, trust-list root,
admin token and webhook secret in these tests is generated in the test process and lives in a temp directory; the
webhook tests sign their own bodies with the provider's documented `Stripe-Signature` scheme.

## What ran

- `focused-tests.json`: vitest JSON for the new and changed tests (entitlement, paywall surfaces, hosted API, enterprise
  licence, payment invariance) and the existing tests that cover the changed copy and modules.
- `mutations.json`: each guard broken once in the working tree, its test file run, the failing tests named, the source
  restored with `git checkout`. M1 lets a client-supplied environment public key unlock packs; M2 offers checkout
  without a pinned licence key; M3 checks the webhook signature over re-serialized JSON instead of the raw bytes; M4
  skips the webhook signature check; M5 removes webhook idempotency; M6 compares the admin token with `===`; M7 offers
  hosted checkout with a URL alone; M8 verifies an enterprise licence with no pinned key; M9 stores a refused
  enterprise key; M10 hides a locked pack's description again; M11 lets `domain pack verify` pin the environment public
key again; M12 ignores `activate --expires-at`; M13 ignores a Studio activation body's `expiresAt`. Each mutation fails
at least one test.

`amc domain pack verify` now checks the same trust-list key as the gate (no `--pubkey`, no environment key), and
`--expires-at` is refused rather than ignored: a licence's expiry is the one its issuer signed, enforced at
verification. The `scripts/egress-call-sites.json` row for the removed online activation call is dropped; no check
reads that inventory (it is cited only by docs/OPS_HARDENING.md), and it still parses.

## Payment invariance

`tests/industryPackWeightingPaymentInvariance.test.ts` runs the same seeded workspace with the licence off and on
(a licence the gate really accepts, checked active) through `getQuestionSet`, `runDiagnostic` (B1), the score API
route `POST /api/v1/score/run` (D1), `unifiedRun` (D2) and the built `amc run --score-only` (D3), and requires
identical layer scores, module scores and grades. P0-44 had already removed the licence-dependent weighting, so these
cases pin that result rather than fix it.

## Not done here

- The full suite (`npm test`) was not run; the focused files and the existing files covering the changed modules were.
- Live checkout needs Sid: a verified payment link, an Ed25519 issuing key, the admin token and the webhook secret on
  the hosted API, and the issuer's public key published for buyers to pin. Licence delivery to the buyer is not wired;
  the webhook records a paid checkout for an admin to issue.
