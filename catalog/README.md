# AMC Regulated Control Catalog

This folder holds the catalog's content as data: YAML control records grouped into packs, the vocabulary their
predicates may use, the admitted evidence producers, and JSON fixtures for each control test. The format, every field's
rule, the support gates, the digests and the lockfile are described in
[docs/catalog/CONTROL_RECORD.md](../docs/catalog/CONTROL_RECORD.md).

What a control produces is evidence of conformity, never proof of compliance. Every record here is `experimental`: it
was drafted by an agent, most of its citations are not yet fetched or hashed, none is legally reviewed, and no named
expert has approved it. A control leaves `experimental` only through the support gates and a named expert's review.

The tree is fixed; any other file is refused by the loader (`CAT_STRAY_FILE`):

```
catalog.yaml                     catalog manifest
vocabulary.yaml                  terms predicates, citations, packs and owners may use
producers.yaml                   admitted evidence producers
publisher-hosts.yaml             standards-body hosts for voluntary-standard citations
profiles/cross-station.json      descriptive station-composition templates
registers/<id>.json              law-as-data registers, one entry per clause (docs/catalog/REGISTER.md)
jurisdictions/<folder>/profiles.json  jurisdiction profiles over register entries
layers/<pack>/pack.yaml          pack manifest
layers/<pack>/controls/<id>.yaml one control record per file
fixtures/<id>/positive/*.json    fixtures a control test must allow or pass
fixtures/<id>/negative/*.json    fixtures it must deny, fail or leave not evaluated
CHANGELOG.md                     append-only changelog: one entry per catalog digest change
governance/f5-confirmations.yaml          F5 verdicts a human review confirmed (none yet)
governance/reverify-before-publishing.yaml facts to re-check against the primary source
governance/standards-licences.md          licensed standards the catalog needs
reviews/<subject>/<version>/<record>.json  review records (none yet; D-08 names the reviewers)
```

The governance files follow [docs/catalog/GOVERNANCE.md](../docs/catalog/GOVERNANCE.md); they are not catalog content and
change no digest.

Load and check it with `loadCatalog()` and `validateCatalog()` from `dist/catalog/index.js`.
