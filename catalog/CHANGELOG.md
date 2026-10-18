# Catalog changelog

Public and append-only (P1-34). Every change to the catalog digest appends one entry at the end: a heading, a short note
if useful, and one `amc-catalog-change` block naming the new catalog id, version and digest and every added, changed or
retired control with its version, a reason and, for reviewed or qualified content, its review record ids. Earlier text
is never edited. `npm run check:catalog-changelog` enforces this in CI; the format is in docs/catalog/GOVERNANCE.md.

An entry records what changed and which review records it names. It is not a review, it promotes nothing, and catalog
content remains evidence of conformity, never proof of compliance.

## 0.1.0: baseline

The digest the changelog guard starts from. Content written before the guard (Layer 0, the US Wealth overlay and the
US register) is experimental, has no review records and is not listed control by control.

```amc-catalog-change
{"catalog":{"digest":"sha256:99a7cf3f9c9fde698da2f4a8845e5c417ab3d0116b04d6ecd99f682d9aa81fba","id":"amc.catalog","version":"0.1.0"},"controls":[],"entryVersion":1}
```

## 0.1.1: experimental Technology overlay (P2-30)

Eight agent-drafted controls and their fixtures are experimental and unreviewed. Promotion is none; no review records exist.

```amc-catalog-change
{"catalog":{"digest":"sha256:8626c07e015cd4f1ca10dc0b65129a6b623d55148443bfe802815f2f84ec6b52","id":"amc.catalog","version":"0.1.1"},"controls":[{"change":"added","id":"L1-TECH-01","reason":"Draft published-byte marking evidence with a synthetic signature oracle; no production enforcement established.","reviewRecordIds":[],"version":"0.1.0"},{"change":"added","id":"L1-TECH-02","reason":"Draft CRA packet timing and AIBOM evidence with a synthetic 24-hour drill; primary text remains unverified.","reviewRecordIds":[],"version":"0.1.0"},{"change":"added","id":"L1-TECH-03","reason":"Draft IoT command allowlist evidence with a synthetic simulator; no production device effects established.","reviewRecordIds":[],"version":"0.1.0"},{"change":"added","id":"L1-TECH-04","reason":"Draft COPPA third-party consent and retention evidence; primary text and human review remain pending.","reviewRecordIds":[],"version":"0.1.0"},{"change":"added","id":"L1-TECH-05","reason":"Draft CCPA ADMT notice, opt-out or human-appeal evidence; applicability remains operator-stated.","reviewRecordIds":[],"version":"0.1.0"},{"change":"added","id":"L1-TECH-06","reason":"Draft pinned-model GPAI integrator documentation evidence; no legal review or promotion.","reviewRecordIds":[],"version":"0.1.0"},{"change":"added","id":"L1-TECH-07","reason":"Draft NIS2 early-warning evidence with a synthetic F4 clock drill; primary text and authority remain unverified.","reviewRecordIds":[],"version":"0.1.0"},{"change":"added","id":"L1-TECH-08","reason":"Draft AI-claims document-to-evidence review; unsourced FTC Act clause remains unverified.","reviewRecordIds":[],"version":"0.1.0"}],"entryVersion":1}
```
