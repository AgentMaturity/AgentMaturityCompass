# Citation checks

`npm run check:citations` (`scripts/check-citations.mjs`) lints every citation, framework identifier and pack reference in the built package. It reads `dist/`, so run `pnpm run build` first. CI runs it in the `build-test` job after the build, and `npm run release:gate` runs it as the `citations` step.

The check does not say a citation is correct. It finds citations that are malformed, point at nothing, or name an instrument known to be superseded. Every citation of law, regulation or a standard stays experimental until a named expert signs it off; agents draft and refute this content but never approve it.

## What it reads

| Source | Checked as |
| --- | --- |
| Industry pack `regulatoryBasis` and question `regulatoryRef` (`src/domains/industryPacks.ts`) | citations that must resolve to a catalogue record |
| Domain rubric `regulatoryRef` (`src/score/domainPacks.ts`) | citations that must resolve |
| Domain registry `regulatoryBasis` and `assurancePacks` (`src/domains/domainRegistry.ts`) | citations that must resolve; exact assurance pack ids |
| Compliance mapping descriptions, `requires_assurance_pack.packId` and `related.packs` (`src/compliance/builtInMappings.ts`) | prose; exact pack ids; pack ids ignoring case, `-` and `_` |
| Industry pack audit anchors (`INDUSTRY_PACK_AUDIT_ANCHORS` in `src/domains/industryPackAudit.ts`) | prose; NIST AI RMF and ISO/IEC 42001 ids |
| MITRE ATLAS controls (`src/score/crossFrameworkMapping.ts`) | ATLAS technique ids |
| Unprefixed `affectedPacks` in `src/compliance/regulatory/register.json` | industry pack ids, else exact assurance pack ids |
| Catalogue records (`src/domains/packs/catalogue{Us,Eu,Intl}.ts`) | citation records |

A citation field holding several citations is split on `;` and each part is checked on its own.

## Rules

| Rule | Name | Fails when | Tolerance |
| --- | --- | --- | --- |
| CIT001 | superseded-as-live | A citation matches an entry in `src/compliance/citations/supersededInstruments.ts` and does not resolve to a catalogue record with status `repealed` and `supersededBy`. | Ratcheted until P0-24 corrects the citations, then zero |
| CIT002 | framework-id | An id does not match its format (`AML.T0000` or `AML.T0000.000`; `GOVERN 1.1`; `A.5` or `A.6.2`). | Zero |
| CIT002 | framework-id | An id is missing from a filled reference table, or breaks a pair rule: prompt injection must be ATLAS `AML.T0051`; ISO/IEC 42001 `A.5` must not be labelled as AI policy. | Ratcheted until P0-24 and the expert review |
| CIT003 | pack-reference | A pack id does not resolve in `listAssurancePacks()` (or, for `related.packs`, after ignoring case, `-` and `_`). | Zero |
| CIT004 | record-incomplete | A citation that must resolve matches no catalogue record; a record lacks a citation-record field; or a record URL is not https on the shared host list. | Ratcheted until P1-09 fills the records |
| CIT005 | status-type | A record's `statusType` is not one of the seven types, or a `repealed` record has no `supersededBy`. | Zero |

The run prints `citations: errors=<n> ratcheted=<n> baseline=<n>` and the totals for each rule. `--json` prints the same summary with every finding.

## Baseline

`scripts/citations-baseline.json` holds the ratcheted counts per rule and file. Each rule entry carries the issue that burns it down (`issue`, for example `P0-24`) and the `reason` given when it was last written. The check fails when a count rises above its baseline. A zero-tolerance finding fails even if the baseline lists it.

When counts fall, the check passes and prints the command that locks in the lower numbers:

```
node scripts/check-citations.mjs --update-baseline --reason "<what improved>"
```

`--update-baseline` needs `--reason` and refuses to run while any zero-tolerance finding remains. It rewrites the counts to the current findings, so review the baseline diff like any other change. A baseline that rises needs a reason a reviewer accepts.

Baseline at introduction (2026-10-07): CIT001 10, CIT002 4, CIT003 0, CIT004 632, CIT005 0.

## Adding or changing a catalogue record

A catalogue record (`RegulatoryInstrument`) passes CIT004 when it carries the citation-record fields from `src/compliance/citations/citationRecord.ts`:

- `instrument`, `clause` (use `whole instrument` when the record cites all of it), `edition` and `jurisdiction`.
- `statusType`: one of `binding-now`, `binding-future`, `draft`, `supervisory-guidance`, `voluntary-standard`, `contractual` or `conformity-scheme`. Whoever writes the record sets it; it is never derived from `status`.
- `effectiveDate` and `complianceDueDate` as ISO dates. Leave one out only with a `dateNote` that says why.
- `url`: https on the shared host list in `src/compliance/citations/officialHosts.ts`.
- `retrievedAt`, `contentSha256`, or both.

A superseded or withdrawn instrument gets status `repealed` and `supersededBy`. To add an entry to `supersededInstruments.ts`, cite the source that names the replacement.

## Official hosts

`src/compliance/citations/officialHosts.ts` is the one host list. It is the union of the pack catalogue's hosts and the register's `policy.officialHosts`; the pack catalogue (`OFFICIAL_SOURCE_HOSTS` in `src/domains/packs/regulatorySchema.ts`) re-exports it, and a test asserts the register's list is a subset. `npm run check:regulatory-currency` still reads the register's own list, so a register source must be on both.

## Reference tables

`src/compliance/citations/reference/` holds the tables CIT002 checks ids against. Each records the file it came from:

- `nistAiRmf.json`: the 72 subcategory ids and titles of NIST AI 100-1 (AI RMF 1.0), extracted from the official PDF, with its URL, retrieval date and sha256.
- `atlas.json`: technique and sub-technique ids and names from the MITRE ATLAS data release v2026.09, with its URL, retrieval date and sha256.
- `iso42001AnnexA.json`: empty. ISO/IEC 42001 is paywalled; a named expert fills it from a licensed copy. Until then ISO ids are checked for format and the pair rule only.

Do not fill a table from secondary sources.
