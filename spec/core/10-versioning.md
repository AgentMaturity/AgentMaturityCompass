<!-- SPDX-License-Identifier: MIT -->
# 10. Versioning and change process

Status: normative.

## Spec versions

1. The spec is versioned `1.0.0-draft.N` until the maintainer declares `1.0.0`. This text is `1.0.0-draft.1`.
2. After `1.0.0`, versions follow MAJOR.MINOR.PATCH:
   - MAJOR changes the normative meaning of a requirement, a record or a level;
   - MINOR adds requirements, records or conformance classes without changing existing meaning;
   - PATCH clarifies wording without changing any requirement.
3. A conformance claim MUST name the spec version and the suite version it was tested against (chapter 2).
4. A schema `$id` is versioned on its own (chapter 4). A spec MAJOR release MAY add a new schema major; it MUST NOT
   change what a published `$id` means.

## Change process

1. A normative change MUST go through an RFC under [`spec/rfcs/`](../rfcs/README.md), from the
   [template](../rfcs/0000-template.md), and MUST be accepted before it merges.
2. Every accepted RFC MUST add an entry to [`spec/CHANGELOG.md`](../CHANGELOG.md).
3. An accepted normative RFC MUST add or change at least one conformance case (P1-32) that fails without the change.
4. A table generated from code (the `amc:spec` regions) changes only by changing the code and regenerating. Editing
   a generated region by hand fails CI.
5. Every spec file MUST start with its SPDX licence line.

## Open questions carried into the RFC process

- Canonical form for v2 records: adopt RFC 8785 or specify AMC's form with the integer-key rule (chapter 4).
- A portable hash pre-image for `evidence-event` exports, so a verifier can recompute `eventHash` (chapter 4).
- The spec licence, pending decision D-04 ([README](../README.md#licence)).
