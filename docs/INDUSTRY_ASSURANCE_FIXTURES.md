# Industry assurance scenario fixtures

A sourced scenario corpus for the 17 industry assurance packs. It is input data for
later assurance runs (P1-16 grades agents against it), not a grade. Nothing in this
directory runs an agent or scores a response.

**Experimental.** The scenarios and regulation anchors were drafted and read by AI agents.
They are draft content that no named expert has reviewed; they cite law and standards
but are not legal advice, and no scenario result is evidence of conformity until such a
review exists.

## Layout

- `tests/fixtures/industry-assurance/anchors.json`: every regulation anchor, keyed by id.
- `tests/fixtures/industry-assurance/packs/<packId>.json`: one file per pack, at least 3 scenarios each.
- `tests/industryAssuranceFixtures.test.ts`: the loader, the schema and the hygiene guard.

Counts measured on 2026-10-04 and again on 2026-10-18 by
`npx vitest run tests/industryAssuranceFixtures.test.ts`: `packs=17 scenarios=54`. There are 60 anchors: 52 verified and 8 `verified:false`.
Expected behaviour across the scenarios: 26 `refuse`, 15 `comply-with-controls`, 13 `escalate`.

## Scenario shape

| Field | Meaning |
| --- | --- |
| `id` | Unique across the corpus (kebab-case). |
| `station` | Must equal the pack's station in the industry pack manifest (see Stations below). |
| `anchors` | Keys into `anchors.json`. Every key must resolve. |
| `prompt` | The request put to the agent under test. |
| `expectedBehaviour` | `refuse`, `comply-with-controls` or `escalate`. |
| `mustCite` | Control ids the answer has to cite. Each one must equal the `citation` of one of the scenario's anchors, and that anchor must not be `superseded` or `lapsed`. |
| `mustNot` | Things the answer must not do. |
| `evidenceRequired` | Artifacts a passing run has to produce. |

## Stations

The test imports `INDUSTRY_PACK_MANIFEST` (`src/assurance/packs/industryPackManifest.ts`) and
checks each pack's id, source file and station against it, so the corpus restates no station.
Five packs carry the manifest station `cross-framework`, which is not one of the seven stations:
the manifest uses it when the station map gives a pack two or more stations. For those packs
a scenario's stations are P1-13's station tags, `listIndustryAssurancePackStations(packId)` in
`src/domains/domainRegistry.ts`; the test checks that each has at least two and that every
scenario's stations are among the seven.

| Pack | Stations (P1-13 tags) |
| --- | --- |
| `euAiActArticle` | health, education, environment, mobility, governance, wealth |
| `globalAIRegulatory` | governance, technology |
| `iso42005ImpactAssessment` | governance, wealth |
| `legalCompliance` | governance, wealth |
| `safetyCriticalSIL` | health, mobility |

The table is read from `INDUSTRY_ASSURANCE_PACK_STATIONS` on 2026-10-18; the code is the source.

## Anchor shape and sourcing rule

Each anchor has `citation`, `title`, `url`, `status` (`in-force`, `pending`,
`superseded`, `lapsed` or `unknown`) and `verified`. A verified anchor needs a
`retrievedAt` date. An unverified anchor needs a `reason`. The URL host has to be on an
allowlist of official or primary publishers, such as govinfo.gov, sec.gov, fcc.gov,
nist.gov, europa.eu, iso.org, iec.ch, cac.gov.cn and camara.leg.br. A law-firm or news
URL fails the schema. `note` records what a verified read did not cover.

All anchors were read by an agent on 2026-10-04 and not re-read since. These 8 could not be confirmed and are marked
`verified:false`:

| Anchor | Reason |
| --- | --- |
| ISO 26262, ISO 21448, ISO/IEC 27001, ISO/IEC 42005 | iso.org returned HTTP 403 |
| ABA Model Rules 1.6 and 5.5 | americanbar.org returned HTTP 403 |
| Canada Bill C-27 (44-1) | parl.ca returned HTTP 403; whether it got Royal Assent or lapsed was not confirmed |
| CRA Annex I Part II(1) SBOM duty | the operative annex text was not confirmed |

Several verified anchors were confirmed from a regulator page that cites the article,
not from the article text. Their `note` says so. These are GDPR Arts. 33 and 35, the
CRA reporting timelines and AI Act Art. 113.

## Hygiene guard

Every scenario string, and every anchor field except `url`, is checked against two sets
of patterns:

- Credential patterns: cloud access keys, private-key blocks, vendor API keys, GitHub
  and Slack tokens, JWTs, bearer tokens, `password=` style assignments and long
  mixed-case alphanumeric strings.
- Personal-data patterns: SSN-shaped numbers, 13–19 digit card or account numbers,
  emails outside reserved domains (`example.com`, `.test` and similar), phone numbers
  outside the fictional `555-01xx` range, honorific plus surname, and DOB or MRN values.

The guard fails closed. A false hit is acceptable. It cannot prove that a bare name is
not a real person's name, so scenarios refer to people by role only.

## Boundaries

- Pack ids, source files and stations come from `src/assurance/packs/industryPackManifest.ts`
  (landed with P0-13); the test imports it.
- The corpus does not change any pack, and no pack reads the corpus yet.
- No agent was run against these scenarios.
