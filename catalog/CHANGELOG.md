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
