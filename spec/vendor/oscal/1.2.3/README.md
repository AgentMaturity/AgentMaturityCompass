# OSCAL 1.2.3 schema provenance

These files originate from the National Institute of Standards and Technology (NIST) OSCAL project. The three JSON Schema assets were retrieved from the [v1.2.3 release](https://github.com/usnistgov/OSCAL/releases/tag/v1.2.3) on 17 October 2026 UTC. The raw retrieved inputs match each release asset's published byte size and SHA-256 digest. The stored copies differ only by removal of terminal ASCII spaces and tabs on each line; every parsed JSON value, schema identifier, pattern, format and required field remains unchanged.

The GitHub latest-release and v1.2.3 tag metadata were byte-identical at retrieval: 83,935 bytes, SHA-256 `52b144372ea761f15e002e72e764f26b1965d5c6732e5cb236c923336ef0d5ab`. They identified v1.2.3, published `2026-08-07T03:33:33Z`. The API reported the release as mutable; the recorded content hashes, rather than a claim of permanent upstream immutability, pin these exact bytes. This observation does not assert that v1.2.3 remains the latest release indefinitely.

| Raw upstream file | Published bytes | Published SHA-256 | Official source |
| --- | ---: | --- | --- |
| oscal_catalog_schema.json | 55199 | `ab95836e9e8dfeb6fde80007f6cc76fa3192f595d427c751a3f3923c3f474fc2` | [release asset](https://github.com/usnistgov/OSCAL/releases/download/v1.2.3/oscal_catalog_schema.json) |
| oscal_profile_schema.json | 68516 | `7c5ff5a92683b6a80ce6a3474dea04e0ea8680a4ecb60702ffa08ebfc677e6cb` | [release asset](https://github.com/usnistgov/OSCAL/releases/download/v1.2.3/oscal_profile_schema.json) |
| oscal_assessment-results_schema.json | 152214 | `4034e2032332dbf597e59e0646ec16c2c31df992962490371e91f47b219ff42c` | [release asset](https://github.com/usnistgov/OSCAL/releases/download/v1.2.3/oscal_assessment-results_schema.json) |

## Stored whitespace-only copies

Stored whitespace-only copies were prepared on 17 October 2026 UTC by removing terminal ASCII spaces and tabs; no schema values or notice wording changed.

The raw published hashes above identify the retrieved upstream schema bytes. The stored hashes below identify different bytes and must not be described as published upstream hashes. Normalization removes only terminal ASCII space (0x20) or tab (0x09) bytes before each existing line ending. It preserves every other byte and all newlines. A separately retained reversible record of the raw inputs and exact byte-offset removal spans accounts for this change.

| Stored file | Stored bytes | Stored SHA-256 | Trailing spans removed |
| --- | ---: | --- | ---: |
| oscal_catalog_schema.json | 54638 | `56289f43910d0a9ddf3eab24c7f206492cb7b041b8cb3caff6ac52d89c58f7ff` | 450 |
| oscal_profile_schema.json | 67771 | `0e7b06623f8f4a0e64142fe7af4364a8d27c383e1db1281c7d538e3a7e454d6a` | 571 |
| oscal_assessment-results_schema.json | 150697 | `671524c85034f53d107dcc5125a7d66b8d4529caaec051f788817c0551b93cc5` | 1221 |
| LICENSE.md | 5253 | `21b37d99e07197585f082c7663c9813219c59613209eabe209f337564401043c` | 2 |

All three schemas declare JSON Schema draft-07. Their root identifiers and local definition identifiers are preserved exactly. Every recorded `$ref` points to a definition inside its own schema; no remote reference retrieval is needed for these files. The token patterns use Unicode property escapes for letters and numbers, so validation must retain `unicodeRegExp: true`. The declared date-time, email, URI and URI-reference formats must remain enabled. Do not replace patterns, suppress formats, disable schema validation or change any parsed schema value to obtain a validation pass. The unchanged root IDs are `http://csrc.nist.gov/ns/oscal/1.2.3/oscal-catalog-schema.json`, `http://csrc.nist.gov/ns/oscal/1.2.3/oscal-profile-schema.json`, `http://csrc.nist.gov/ns/oscal/1.2.3/oscal-ar-schema.json`. Retain `allErrors: true`, `unicodeRegExp: true`, `validateFormats: true` and `validateSchema: true`, with the complete `ajv-formats` full-mode plugin and its keywords enabled; leave strict defaults unchanged.

## License and acknowledgment

The raw `LICENSE.md` input is the complete [upstream notice at v1.2.3](https://raw.githubusercontent.com/usnistgov/OSCAL/v1.2.3/LICENSE.md): 5,255 bytes, SHA-256 `63407ac41abc46911bc9759fc0c19fd0ba7f66c59bb6746e51d85e2f2f3244b1`. This license file is bound by its observed download hash; it is not a release asset with a separately published digest. NIST identifies its United States government work as public domain in the United States and supplies a CC0 1.0 worldwide dedication. The full NIST notice, acknowledgment terms and AS IS warranty/liability text remain intact. NIST is acknowledged here as the source of the schemas. The stored notice differs only by removal of two terminal ASCII spaces on two lines; all notice wording, punctuation, terms and newlines remain intact. Its stored size and hash are listed above. Raw upstream inputs remain separately retained byte-exact.

## Validation boundary

Retrieval and matching raw hashes establish upstream byte provenance; the stored hashes and reversible whitespace record bind the stored copies. They do not establish that an AMC output conforms to these schemas or prove a signature, producer, trust decision, evidence truth or CLI behavior. Actual schema compilation and output validation require separately recorded execution.
