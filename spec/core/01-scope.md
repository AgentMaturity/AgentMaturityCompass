<!-- SPDX-License-Identifier: MIT -->
# 1. Scope, status and terms

Status: informative. Version 1.0.0-draft.1 (see [chapter 10](10-versioning.md)).

Draft. Not a standard. AMC output is evidence of conformity, never proof of compliance.

## Scope

The AMC Core Spec says what an implementation has to do to produce, adapt, compile or verify AMC evidence, and what a
reader may conclude from that evidence. It covers:

- the conformance classes ([chapter 2](02-conformance-classes.md));
- the claim kinds and the words a result may and may not use ([chapter 3](03-claim-kinds.md));
- the evidence records and how they are hashed ([chapter 4](04-evidence-model.md));
- control results and their five status dimensions ([chapter 5](05-control-results.md));
- maturity levels, the one scale and the one formula ([chapter 6](06-maturity-levels.md));
- authorization records, receipt states and failure behaviour ([chapter 7](07-authorization-and-receipts.md));
- scoped attestations ([chapter 8](08-scoped-attestations.md));
- verification and the acceptance rules ([chapter 9](09-verification.md));
- versioning and the change process ([chapter 10](10-versioning.md)).

The record shapes are the JSON Schemas under [`spec/schemas/`](../README.md), generated from the parsers AMC runs. The
ordered checks a verifier applies are in [`spec/ACCEPTANCE_RULES.md`](../ACCEPTANCE_RULES.md). This spec cites both
and never restates a schema by hand.

The spec does not cover the diagnostic question bank, assurance packs, station packs, pricing, or any law. Annex A maps
levels to EU AI Act articles for information only; it is experimental until a named expert signs it off.

## What this draft replaces

This draft supersedes `docs/AMC_STANDARD_RFC.md` (dated 2026-03-14) and `docs/OPEN_RUBRIC_STANDARD.md`. Both stay in
the repository for history. Three statements in the old RFC are dropped because the code never did what they said:

- the 0–1 internal score and its mapping to levels;
- the exponential evidence decay with a 90-day half-life, which the old text made mandatory for implementers;
- the rule that an agent "MUST reach L3 across all dimensions" before regulated production, a level no real
  evidence reached when it was written.

## Normative language

Chapters 2 to 10 are normative unless a section says otherwise. In them, the key words "MUST", "MUST NOT", "SHOULD",
"SHOULD NOT" and "MAY" are to be read as described in RFC 2119 and RFC 8174 when, and only when, they appear in capitals.
This chapter, the annexes, the README, the changelog and the RFC process are informative and use none of them.

Every normative table in this spec is generated from the code it describes by `scripts/check-spec-sync.mjs`, between
`amc:spec` comment markers. CI fails when a table and the code disagree.

## Terms

| Term | Meaning |
| --- | --- |
| Record | One JSON document with a published schema `$id` (chapter 4) |
| Producer | An implementation that writes records about what an agent did |
| Adapter | An implementation that sits at a boundary (a hook, a gateway) and decides allow, deny or ask |
| Importer | A producer that converts another system's logs; it held no boundary |
| Compiler | An implementation that turns a profile and a catalog into a plan with a digest |
| Verifier | An implementation that judges records against a pinned trust list at an as-of time |
| Claim kind | What a result may claim: `synthetic_example`, `self_reported`, `observed` or `independently_reviewed` |
| Control result | One control's five status dimensions, claim kind and evidence (chapter 5) |
| Level | L0 to L5, cumulative, explaining progress only (chapter 6) |
| Scoped attestation | A signed statement about one deployment snapshot, profile and window (chapter 8) |
| Trust list | A signed list of keys pinned for named purposes ([docs/TRUST_LIST.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/TRUST_LIST.md)) |
| Not evaluated | The result when trustworthy evidence is missing or unknown; never a pass, a partial result or a default |
| Evidence of conformity | What AMC output is; a reader decides compliance, AMC does not |
