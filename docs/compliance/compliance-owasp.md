# AMC Compliance Report (OWASP_API_TOP10)

- Agent: default
- Window: 2026-02-13T08:51:55.649Z -> 2026-03-15T08:51:55.649Z
- Config trusted: NO (compliance maps signature missing)
- Trust coverage: OBSERVED 100.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 50.0% (S:0 P:10 M:0 U:0)

## Categories

### API1 Broken Object Level Authorization (PARTIAL)

APIs expose endpoints handling object identifiers without verifying the requesting user has access to the target object.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- Found denied audit events: GOVERNANCE_BYPASS_SUCCEEDED, EXECUTE_WITHOUT_TICKET_ATTEMPTED, LEASE_INVALID_OR_MISSING
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
- e5eeb980-afb8-420f-a7a9-ec10b472606b (audit) hash=11e30a73f9077398fcf9b3c77e0a535a12a65c587d873338d59f6dabca93bc27
- 7a295732-c678-4648-9627-36ebe16d6a37 (audit) hash=a3ca8973c714705a39bed6cf7a238223d99cc05f4c5f778289b6100bfa236ad7
- 327bfa32-2154-4ed8-ab38-8b6d847582aa (audit) hash=a15c1060aacb4bdc016208b1209ff60e397ba8b466ed32eed696d3857c206225
- 08240186-60f8-4217-9ac0-b4490be32ebb (audit) hash=e6f02ce35b0c3526da9fe73c9439e3368fcbe8b08557a3293acf4dcf6b42beaa
- 5cff80a6-4b93-4301-b545-544918829e96 (audit) hash=b4458002ae0d137e51e6e9e5eb18a340ca8bca6ae538c46877d7e6145e982140
What would make this SATISFIED?
- No additional evidence required for this requirement
- Resolve and eliminate audit events: GOVERNANCE_BYPASS_SUCCEEDED, EXECUTE_WITHOUT_TICKET_ATTEMPTED, LEASE_INVALID_OR_MISSING

### API2 Broken Authentication (PARTIAL)

Authentication mechanisms implemented incorrectly allowing identity compromise or token theft.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- Found denied audit events: LEASE_INVALID_OR_MISSING, GOVERNANCE_BYPASS_SUCCEEDED
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
- e5eeb980-afb8-420f-a7a9-ec10b472606b (audit) hash=11e30a73f9077398fcf9b3c77e0a535a12a65c587d873338d59f6dabca93bc27
- 7a295732-c678-4648-9627-36ebe16d6a37 (audit) hash=a3ca8973c714705a39bed6cf7a238223d99cc05f4c5f778289b6100bfa236ad7
- 327bfa32-2154-4ed8-ab38-8b6d847582aa (audit) hash=a15c1060aacb4bdc016208b1209ff60e397ba8b466ed32eed696d3857c206225
- 08240186-60f8-4217-9ac0-b4490be32ebb (audit) hash=e6f02ce35b0c3526da9fe73c9439e3368fcbe8b08557a3293acf4dcf6b42beaa
- 5cff80a6-4b93-4301-b545-544918829e96 (audit) hash=b4458002ae0d137e51e6e9e5eb18a340ca8bca6ae538c46877d7e6145e982140
What would make this SATISFIED?
- No additional evidence required for this requirement
- Resolve and eliminate audit events: LEASE_INVALID_OR_MISSING, GOVERNANCE_BYPASS_SUCCEEDED

### API3 Broken Object Property Level Authorization (PARTIAL)

Lack of or improper authorization validation at object property level enabling mass assignment or excessive data exposure.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- Found denied audit events: GOVERNANCE_BYPASS_SUCCEEDED, EXECUTE_WITHOUT_TICKET_ATTEMPTED, LEASE_INVALID_OR_MISSING
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
- e5eeb980-afb8-420f-a7a9-ec10b472606b (audit) hash=11e30a73f9077398fcf9b3c77e0a535a12a65c587d873338d59f6dabca93bc27
- 7a295732-c678-4648-9627-36ebe16d6a37 (audit) hash=a3ca8973c714705a39bed6cf7a238223d99cc05f4c5f778289b6100bfa236ad7
- 327bfa32-2154-4ed8-ab38-8b6d847582aa (audit) hash=a15c1060aacb4bdc016208b1209ff60e397ba8b466ed32eed696d3857c206225
- 08240186-60f8-4217-9ac0-b4490be32ebb (audit) hash=e6f02ce35b0c3526da9fe73c9439e3368fcbe8b08557a3293acf4dcf6b42beaa
- 5cff80a6-4b93-4301-b545-544918829e96 (audit) hash=b4458002ae0d137e51e6e9e5eb18a340ca8bca6ae538c46877d7e6145e982140
What would make this SATISFIED?
- No additional evidence required for this requirement
- Resolve and eliminate audit events: GOVERNANCE_BYPASS_SUCCEEDED, EXECUTE_WITHOUT_TICKET_ATTEMPTED, LEASE_INVALID_OR_MISSING

### API4 Unrestricted Resource Consumption (PARTIAL)

API requests consume excessive resources without rate limiting, leading to denial of service or cost exploitation.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- No denied audit events found
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
What would make this SATISFIED?
- No additional evidence required for this requirement

### API5 Broken Function Level Authorization (PARTIAL)

Complex access control policies with unclear separation between administrative and regular functions.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- Assurance pack 'governance_bypass' score 100 meets threshold
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
What would make this SATISFIED?
- No additional evidence required for this requirement
- Improve 'governance_bypass' score to >= 85 and keep *_SUCCEEDED <= 0

### API6 Unrestricted Access to Sensitive Business Flows (PARTIAL)

APIs expose business-critical flows without compensating controls to prevent automated abuse.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- No denied audit events found
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
What would make this SATISFIED?
- No additional evidence required for this requirement

### API7 Server Side Request Forgery (PARTIAL)

API fetches remote resources without validating user-supplied URIs, enabling SSRF attacks.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- Assurance pack 'injection' score 100 meets threshold
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
What would make this SATISFIED?
- No additional evidence required for this requirement
- Improve 'injection' score to >= 80 and keep *_SUCCEEDED <= 0

### API8 Security Misconfiguration (PARTIAL)

Improper security hardening, missing patches, overly permissive settings, or unnecessary features enabled.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- Found denied audit events: CONFIG_SIGNATURE_INVALID, UNSAFE_PROVIDER_ROUTE
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- c1f0aec0-78de-48e0-b6c7-656ac7fc3db5 (audit) hash=c0771cb18cfd7a22649fc912d231072923703a6f6d36cad8003588dfb8960fa3
- df618483-8615-4f17-bb69-617c5fcb6a31 (audit) hash=7c470b47b98b4b71e55ddaf5e1e7a04cc80dc7af6e959902775d2fbfcabdab82
- ac9970f2-48bb-4156-bd56-a61bf37d5218 (audit) hash=4d7a72207893d83c3746918b60e6e1d97b9b0e39c117e5e3475dd220577d6884
- fde667c3-eedc-4c62-af57-e55ef6ad403a (audit) hash=7a2387d2b0c031951a03d8f54e5da04efc5c70a1274c7be97ed571be4718e756
What would make this SATISFIED?
- No additional evidence required for this requirement
- Resolve and eliminate audit events: CONFIG_SIGNATURE_INVALID, UNSAFE_PROVIDER_ROUTE

### API9 Improper Inventory Management (PARTIAL)

APIs lack proper inventory, versioning, and lifecycle management leading to shadow or deprecated endpoints.

Deterministic reasons:
- Found 7135 matching events with observed ratio 1.000
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
What would make this SATISFIED?
- No additional evidence required for this requirement

### API10 Unsafe Consumption of APIs (PARTIAL)

Developers trust third-party APIs without proper validation, enabling supply chain attacks through upstream dependencies.

Deterministic reasons:
- Found 7146 matching events with observed ratio 1.000
- No denied audit events found
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- 2fdbcf3f-5754-4a70-9109-b49544d71db3 (audit) hash=23941bf91946bdd7f7f6fcc818024fd798441c23507ccf68d6ed389c1adad7de
- cc5c7f16-f649-4b42-935b-bd0bb3c565f0 (audit) hash=944ed050ef43f39562402b1aafd6c76f3ff8a742db0dae278353f297a7507e11
- 37eef13c-1e36-40bd-a4b5-75a5f0b77db0 (audit) hash=5178af41b822b3bb55c550a74c00f36351b3055d805199774e67a81745b2e06f
- e0f6b4f8-3609-403e-84a9-8f4567c4ffe0 (audit) hash=f6a0a586e713309ded55331ab53a8a12af0276de3ca5a5b0100de741a6c5f100
- 6408b1bf-1cdf-418b-9cc0-78d4ab2dea4c (audit) hash=a2a328212391b01c3d5ded9f96a25a22399f50dd1d2bf9fdef580f5f1bc36034
- cb07bf50-d272-4425-9c7a-213a1af6a927 (audit) hash=8566d974694f4fb8118e6c89e2faf9fb51d442d1daf2c6a5b54709269ea342e0
- b6df717a-9223-47eb-a72b-1b920b694a2f (audit) hash=32360b69c2521f79ba5beeda8e0e8050cb2a031be4c7e55d9c6ef038f8f8ebe4
- ba22a9f8-2355-46c6-b907-af14fb536f7c (audit) hash=5046e70dc6d562fffa8f3803e2e675ab69092ff23676773f47d6784e42e5db6c
- 008a35a2-7e22-4bcf-b78a-27fd01a3c32a (audit) hash=c0db4a0af6b61a19cb7cb32b10dc3ea386a5501875960981b994092968b0d23f
- d37123d6-88ed-45b4-9d33-12cfda21932d (audit) hash=d7920398c4e18652e97831100da7fc64e66694dc89bc518f3ae5c529666a3059
- a4fc32d4-e5d2-419a-9520-9c02b5fc5d35 (audit) hash=e63f6dbe00166645a5484ebda7c8d3bd5af86daf96b6f18a808f47c613dc7a38
- c2764cc7-5b52-48a2-bf03-c5dd58a8c3f3 (audit) hash=5d1cd0e8a68260391de041f690008bf3c3a87630fcf9324a8e3aa9f8afaf6a2c
What would make this SATISFIED?
- No additional evidence required for this requirement

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
