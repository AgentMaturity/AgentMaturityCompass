<!-- SPDX-License-Identifier: MIT -->
# AMC Core Spec changelog

Every accepted RFC adds an entry here (chapter 10). Newest first.

## 1.0.0-draft.1 (unreleased draft)

- First draft of the AMC Core Spec: chapters 1 to 10, Annex A (informative, experimental, expert sign-off open) and
  Annex B (P1-30).
- Normative tables for levels, claim kinds, banned wording, schema `$id`s and receipt states are generated from the
  code by `scripts/check-spec-sync.mjs`; CI fails when they drift.
- Supersedes `docs/AMC_STANDARD_RFC.md` and `docs/OPEN_RUBRIC_STANDARD.md`. Dropped from the old RFC: the 0–1 score
  bands, the exponential evidence decay, and the "MUST reach L3" rule for regulated production.
- Licence: the repository licence (MIT) until decision D-04 is recorded.
- Open RFC topics: canonical form for v2 records (RFC 8785 or AMC's form), and a portable `evidence-event` hash
  pre-image.
