<!-- SPDX-License-Identifier: MIT -->
# AMC Core Spec RFC process

Status: informative. A proposal; the maintainer (Sid) confirms it, and sets the last-call period, before the first RFC
is accepted.

A change to the normative text of the Core Spec (chapter 10) goes through an RFC in this folder.

## Files

- One file per RFC: `NNNN-short-title.md`, numbered in order of submission, copied from
  [`0000-template.md`](0000-template.md).
- An RFC is never deleted. A rejected or withdrawn RFC keeps its file and its final state.

## States

| State | Meaning | Who moves it |
| --- | --- | --- |
| `draft` | Open for discussion and edits | The author |
| `last-call` | Text frozen; final comments only, for the last-call period | The maintainer |
| `accepted` | Will be merged into the spec | The maintainer, after last call |
| `rejected` | Will not be merged; the file records why | The maintainer |
| `withdrawn` | The author stopped it | The author |

The last-call period is set by the maintainer (proposed: 14 days; pending confirmation).

## On acceptance

1. The spec change and the RFC's state change merge together.
2. [`spec/CHANGELOG.md`](../CHANGELOG.md) gets an entry naming the RFC.
3. A normative RFC adds or changes at least one conformance case under
   [`spec/conformance/v1/`](../conformance/v1/README.md) (P1-32) that fails without the change.
4. The version moves as chapter 10 says.

## Candidate first RFCs

- Canonical form for v2 records: RFC 8785 or AMC's form with the integer-key rule.
- A portable `evidence-event` hash pre-image so an export alone can be recomputed.
