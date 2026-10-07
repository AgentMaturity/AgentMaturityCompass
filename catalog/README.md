# AMC Regulated Control Catalog

This folder holds the catalog's content as data: YAML control records grouped into packs, the vocabulary their
predicates may use, the admitted evidence producers, and JSON fixtures for each control test. The format, every field's
rule, the support gates, the digests and the lockfile are described in
[docs/catalog/CONTROL_RECORD.md](../docs/catalog/CONTROL_RECORD.md).

What a control produces is evidence of conformity, never proof of compliance. Every record here is `experimental`: it
was drafted by an agent, its citations are not yet fetched, hashed or legally reviewed, and no named expert has
approved it. A control leaves `experimental` only through the support gates and a named expert's review.

The tree is fixed; any other file is refused by the loader (`CAT_STRAY_FILE`):

```
catalog.yaml                     catalog manifest
vocabulary.yaml                  terms predicates, citations, packs and owners may use
producers.yaml                   admitted evidence producers
publisher-hosts.yaml             standards-body hosts for voluntary-standard citations
layers/<pack>/pack.yaml          pack manifest
layers/<pack>/controls/<id>.yaml one control record per file
fixtures/<id>/positive/*.json    fixtures a control test must allow or pass
fixtures/<id>/negative/*.json    fixtures it must deny, fail or leave not evaluated
```

Load and check it with `loadCatalog()` and `validateCatalog()` from `dist/catalog/index.js`.
