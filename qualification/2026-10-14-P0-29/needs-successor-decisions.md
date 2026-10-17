# P0-29 routing decisions — 14 October 2026

This is a proposed decision packet. It assigns no successor, changes no status, and qualifies no row. The original candidate remains untouched. This report makes no worktree edits; the separate continuation refreshes evidence in an isolated candidate.

The source inspection counts below cover the 38 unresolved rows. The full refreshed reconciliation checks 275 snippets across 202 files and 480 named inventory files.

## Evidence boundary

- Accepted main: `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`; `origin/main` matches.
- Preserved JSON: `/Users/sid/.codex/xirp-projects/amc-rtd-2026-10-10-worktree-rtd-p0-29-gap-reconciliation/docs/program/gap-register-reconciliation.json`; SHA-256 `7e25d40365fb187f23f4b646b4dc2c6b0b497ca771e7b52ffb578b6266e1e153`.
- The stored 38-ID successor list exactly matches the derived non-final rows lacking both a plan key and paused group. All 38 current authoring successors remain `{planKey: null, paused: null}`.
- Counts: 25 open, 12 mitigated, 1 deferred; G1 2, G2 20, G3 8, G6 2, G8 6. Neither supplemental row lacks a mapping.
- Source inspection: 62 of 63 unique source references have identical main blobs; G6-20 ledger evidence changed. All 160 recorded named-path blobs match. The 35 absent leaf strings remain absent as leaves, but some are directory or shorthand references and cannot prove whole-scope absence.
- The available full durable corpus contains 181 individual engineering specs and 180 indexed issues. P1-78 is standalone and explicitly proposed. No spec outside P0-29 explicitly assigns any of these 38 IDs. This is scope evidence, not a current status inventory.

## How to answer precisely

For each decision below, state the supported boundary and the owner of every remaining acceptance item. A key is a proposed lead until its approved scope covers the complete row. If no existing issue fits, describe a proposed follow-up scope and owner without inventing a key. A deferred answer leaves the row unresolved.

An accepted library boundary should name the exact modules/public API, the supported claims and consumer limits, the acceptance evidence and the owner. This packet does not authorize remediation, cleanup, deletion, untracking, tracker changes, paused G4/G7 work or freeze exceptions.

Only two decisions share actual source boundaries:

- **Hallucination library:** G2-31 and G8-12 name the same five files. Choose the common library/product boundary once; preserve G8-12 failure-parsing acceptance and each row’s owner.
- **Monitoring library:** G2-40 and G3-11 name the same two monitoring files. Choose their common boundary once; G3-11 retains its broader real-drift and wrapper acceptance.

The remaining 34 decisions stay independent. In particular, G2-25 and G8-13 name different module sets; do not combine them because their titles both say analytics.

## Scope guardrails for possible leads

- P1-52:25 excludes removal/deduplication; it is not a general old-debt owner.
- P2-29:27 covers CLI/docs/reviewer independence and optional CLI decomposition; it is not blanket orphan-library cleanup.
- P0-26 covers only the 30 station-question drop decisions.
- P1-53:34 covers named catalog/rubric/crosswalk systems, not the entire analytics or integration inventory.
- P2-09:73 leaves host.db and other SQLite files on the volume; it does not consolidate all original stores.

## The 38 unresolved rows

### G1-39 — mitigated

4 vault "backward-compat" wrappers (memoryTtl.storeWithTtl, screenshotRedact, secretsBroker.mintSecretToken, undoLayer) return `stored:true`/`redacted:true`/tokens without doing anything — and are the barrel-exported names

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Wrappers now store/redact/mint, but undoChange returns reverse payload rather than restoring resources. Cluster acceptance remains.
**Why no whole-scope successor is established:** The four-wrapper finding is heterogeneous. Three wrappers now perform their stated effects, but undoChange returns a reverse payload rather than restoring a resource. No current spec takes responsibility for the full wrapper contract and the remaining undo acceptance.
**Decision required:** Define the supported contract for undoChange: preview/reverse-payload library or actual restoration. Name an owner for the remaining contract and cluster acceptance.
**Decision group:** `row-G1-39`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G1-46 — open

19 vendor LiveDrift wrappers + 7 provider-drift adapters present vendor-branded "live drift" proofs (HELM/Humanloop/Promptfoo/…) but never call any vendor; caller supplies rows

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Vendor wrappers require individual claim/reachability disposition; broad historical grouping is insufficient.
**Why no whole-scope successor is established:** The original 19 vendor wrappers and seven adapters are not fully enumerated in the draft. Their claims, input provenance and runtime consumers need individual disposition. No existing issue covers this whole vendor-wrapper inventory.
**Decision required:** Enumerate all original wrapper/adaptor members and decide each supported claim and runtime boundary. Name one accountable whole-row owner or approve a scoped follow-up.
**Decision group:** `row-G1-46`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-02 — mitigated

Assurance orphan pack cluster: 7 unimported pack modules (2 near-dup spellings of wired packs) + 6 legacy `*PackV1.json` fixtures

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Three orphan spellings are absent and multiTurnDeepEvalPack is registered; economicAmplification/overthinking/zombie modules remain. Mixed wiring/deletion does not close the whole cluster.
**Why no whole-scope successor is established:** The finding combines removed aliases/legacy fixtures with retained assurance packs. Existing pack-conversion plans name different pack sets, and no whole-cluster owner or accepted library boundary is documented. The wildcard fixture reference remains unresolved.
**Decision required:** Decide supported library, runtime pack, or deprecation treatment for each retained pack and resolve the wildcard fixture set. Name the whole-cluster owner.
**Decision group:** `row-G2-02`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Source observation caveat:**
- `fixtures/packs/*PackV1.json`: unresolved combined or pattern expression; original value retained as historical provenance.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-04 — mitigated

Benchmarks dead files: `benchCli` (8-line parser), `valueSigner`, `value/connectors` (3), `cgxSigner`, `cgxQuery`, `transformSse`, `crypto/signing/signerNotary`

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Named dead shims are absent but benchCli and connectors remain; the historical log explicitly retained the live parser. Full cluster disposition needs review.
**Why no whole-scope successor is established:** The row combines removed shims with a retained live parser and three value connectors. CLI deprecation and catalog consolidation do not decide every retained member of this mixed cluster.
**Decision required:** Confirm intentional parser/connector boundaries or the desired consolidation/deprecation scope, with an owner covering every retained member.
**Decision group:** `row-G2-04`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-16 — mitigated

Score dead cluster: `costPredictability`, `decisionExplainability`, `testProdParity`; `scoreHistoryCli` (and `scoreHistory` reachable only through it)

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Four dead score modules are absent, but scoreHistory remains; original cluster cannot be called wholly deleted.
**Why no whole-scope successor is established:** Four members are absent, while scoreHistory remains. No existing spec owns its retained consumer/storage boundary plus acceptance of the complete original deletion claim.
**Decision required:** Decide whether scoreHistory is a supported storage/library surface or needs consolidation; identify its consumers and name the complete-row owner.
**Decision group:** `row-G2-16`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-23 — mitigated

Misc dead: `adapters/adapterDoctor`, `claims/index` barrel, `vault/keyRotation` (verified dead), `bridge/tests/fixtures/openai-chat.json`

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Adapter/claims/vault shims are absent, but the bridge fixture remains; log range cannot prove complete deletion.
**Why no whole-scope successor is established:** The named shims are absent but the bridge fixture remains. No plan issue establishes whether that fixture is intentional, superseded or a residual, so the whole grouped claim is not disposed of.
**Decision required:** Decide the retained bridge fixture purpose and acceptance; name the owner of the remaining grouped disposition.
**Decision group:** `row-G2-23`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-24 — open

Product ORPHAN-barrel (~47): 33 in-memory heuristic modules (real TF-IDF/DAG/sagas) + 4 Python-port modules + scratchpad/promptModules/asyncCallback + tool* estimators

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The roughly 47 product modules span heuristics, ports, callbacks and estimators. No current spec enumerates and owns this full cluster or accepts its library boundary; generic CLI consolidation is insufficient.
**Decision required:** Choose supported library boundaries or concrete runtime consumers for the enumerated product cluster; assign one accountable owner to the complete scope.
**Decision group:** `row-G2-24`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-25 — open

Score analytics ORPHAN-barrel (~26): real, tested algorithm code reachable only via package barrel

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** P1-53 owns crossFrameworkMapping within the larger analytics cluster, but not all roughly 26 algorithms. The remaining supported-library/product-consumer boundary has no whole-row owner.
**Decision required:** Decide the non-catalog analytics library/consumer boundary separately from P1-53 and name the whole-cluster owner.
**Decision group:** `row-G2-25`.

**Narrow leads, all unapproved:**
- P1-53: crossFrameworkMapping only. Does not own the remaining roughly 26-member analytics cluster. Evidence: `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P1-53.md:34`. No assignment applied.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-26 — open

Diagnostic analytics ORPHAN-barrel (7) + gap-receipt cluster (7)

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The row combines seven diagnostic analytics modules with seven gap-receipt/control modules. P2-29 owns reviewerIndependence, one member only. No whole-cluster scope or accepted boundary is established.
**Decision required:** Decide the diagnostic analytics and gap-receipt module boundaries separately; specify how all 14 members receive accepted scope and ownership.
**Decision group:** `row-G2-26`.

**Narrow leads, all unapproved:**
- P2-29: reviewerIndependence only. Does not own the other diagnostic and gap-receipt modules. Evidence: `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P2-29.md:45`. No assignment applied.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-27 — open

Steer pipeline ORPHAN-barrel: 5 stages reachable only via unimported barrel (only race/liquid/privacyTiers used)

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** No spec owns the complete five-stage steer library or its consumption boundary. A package barrel and the use of race/liquid/privacyTiers do not establish acceptance for the remaining pipeline.
**Decision required:** Decide whether the five steer stages are a supported public library, a product pipeline, or future deprecation scope; name the owner and consumers.
**Decision group:** `row-G2-27`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-28 — open

Claims lifecycle state machine dead-ends via unimported `claims/index`

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** No spec explicitly transfers all six original claims-lifecycle modules into the newer claim contract or accepts them as a separate library. A similarly named claim service is not an ownership assignment.
**Decision required:** Decide whether original claims-lifecycle modules are distinct supported contracts or must adapt to the newer claim service; name the scope and owner.
**Decision group:** `row-G2-28`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-31 — open

Entire `src/hallucination` dir orphaned (polished module + tests + docs, no CLI/API/studio wiring)

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The complete five-file hallucination library lacks an accepted supported-library or product-wiring disposition. The common library boundary can be reviewed with G8-12, but G8-12 retains separate failure-parsing acceptance.
**Decision required:** Choose the shared hallucination library boundary, then name the owner of G2-31 wiring or accepted-library acceptance.
**Decision group:** `hallucination-library-boundary`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-32 — open

Incidents advanced layer reachable only via package barrel; CLI/API use incidentStore alone

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** Advanced incident modules and the live incidentStore path have no accepted whole-layer relationship. Regulatory-clock and incident workflow issues do not own all these advanced modules.
**Decision required:** Decide the advanced incident layer relationship to incidentStore and its supported consumers; name the whole-layer owner.
**Decision group:** `row-G2-32`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-33 — open

Vault orphan cluster (4 real): dataResidency, honeytokens, invoiceFraud, knowledgeRefreshLineage

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The four vault modules have different functions and data risks. Current residency/redaction plans address live enforcement paths, not the complete orphan-module boundary or invoice/honeytoken/lineage acceptance.
**Decision required:** Decide per-module residency/honeytoken/fraud/lineage support and consumers; name an accountable owner for the four-module boundary.
**Decision group:** `row-G2-33`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-34 — open

Values engines orphaned while assurance packs of same name never import them

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** No spec binds both values engines to their corresponding assurance packs or accepts them as standalone libraries. Pack conversions do not establish this full engine-to-pack mapping.
**Decision required:** Decide whether and how each values engine is used by a pack, or accept its independent library contract; name the complete owner.
**Decision group:** `row-G2-34`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-35 — open

Ops orphan-barrel: nlPolicy, receiptInterchange, passportSchemaCompatibility, artifactProvenance (779L), modelRouter, amcPolicies

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The row mixes policy generation, receipts, passport compatibility, provenance and model routing. No single existing issue owns every member or defines accepted public-library limits.
**Decision required:** Decide supported boundaries and consumers for all policy/receipt/passport/provenance/routing members; name a whole-row owner.
**Decision group:** `row-G2-35`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-36 — open

Integrations + compliance + observability record-builders orphaned; SCIM handler never mounted

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** P1-53 touches controlCrosswalk only, while this row spans many integration, compliance, observability and plugin modules. P2-07 targets the real identity SCIM path, not the whole generic integration cluster.
**Decision required:** Decide each generic integration/compliance/observability/plugin boundary, keeping the real identity SCIM work separate; name the complete-row owner.
**Decision group:** `row-G2-36`.

**Narrow leads, all unapproved:**
- P1-53: controlCrosswalk catalog adapter only. Does not own the remaining generic integration/compliance/observability/plugin cluster. Evidence: `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P1-53.md:34`. No assignment applied.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-37 — open

Toolhub/redteam/simulator orphan-barrel (real, tested): grants, contracts, exploit/adversarial suites, whatIfs, jailbreak subtree

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** Action-journal and executed-assurance issues cover particular runtime paths. They do not establish disposition for the complete grants/contracts/redteam/jailbreak/what-if library inventory.
**Decision required:** Decide which grants/contracts/redteam/jailbreak/what-if libraries are supported and which runtime consumers are required; name the full-inventory owner.
**Decision group:** `row-G2-37`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-38 — mitigated

Eval real-but-unwired: `llmApiIntegration` (genuine OpenAI/Anthropic fetch — the fix for the mock judge), customAssertionEngine, costLatencyAssertions, effectAutoAgentReplayCorpus

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Production judge client is wired, but the original row also names other assertion/replay modules whose individual wiring remains unresolved.
**Why no whole-scope successor is established:** The production judge is wired, but custom assertions, cost/latency assertions and the replay corpus remain separate acceptance items. Judge calibration is not a whole-row routing decision for all four modules.
**Decision required:** Decide the remaining custom-assertion, cost/latency and replay-corpus boundaries after the wired judge; name the complete owner.
**Decision group:** `row-G2-38`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-39 — mitigated

`enterpriseIam` (415L SSO/RBAC/audit, flagged "#1 blocker") + `mcpServerRiskAttestation` (518L) barrel-/test-reachable only

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Enterprise IAM explicitly says embedder library rather than AMC authorization; risk-attestation scope still needs individual disposition.
**Why no whole-scope successor is established:** P2-07 explicitly refers enterpriseIam wording to P2-29, but that does not cover mcpServerRiskAttestation. The IAM library boundary and MCP risk-attestation disposition must both be owned before the whole row can be assigned.
**Decision required:** Confirm enterpriseIam wording transfer if desired, and separately specify the MCP risk-attestation boundary and acceptance owner.
**Decision group:** `row-G2-39`.

**Narrow leads, all unapproved:**
- P2-29: enterpriseIam wording only, explicitly referred by P2-07:45. Does not own MCP risk-attestation disposition. Evidence: `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P2-29.md:27; /Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P2-07.md:45`. No assignment applied.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-40 — open

Monitoring stranded island: functional in-memory DriftDetector/RealtimeMonitor exported only via barrel; real drift lives in src/drift

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The two monitoring modules share a library boundary with G3-11, but no current issue accepts that boundary or their product wiring. G3-11 additionally covers real drift modules and the continuousMonitor wrapper.
**Decision required:** Choose the shared monitoring-library boundary, then name the owner of these two modules and any required product consumers.
**Decision group:** `monitoring-library-boundary`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G2-41 — open

Benchmarks research cluster + shield S-modules + shield/signing (real ed25519) orphaned

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The row combines research benchmarks, an incompletely enumerated shield cluster and real signing. The parsed src/shield/9 token is not a file path. No exact whole-scope successor can be established before resolving the cluster inventory.
**Decision required:** Resolve the shield S-module inventory first, then decide research/signing library boundaries and the whole-row owner.
**Decision group:** `row-G2-41`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Source observation caveat:**
- `src/shield/9`: unresolved numeric cluster token; original value retained as historical provenance.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-04 — open

Two benchmark subsystems + drifted UI twins

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** Neither benchmark-study issue owns retirement or consolidation of both src/bench and src/benchmarks plus their UI twins. Distinct legitimate purposes versus a canonical subsystem remain undecided.
**Decision required:** Choose one canonical benchmark/UI subsystem or document supported distinct purposes. Name the owner of all migrations and public consumers.
**Decision group:** `row-G3-04`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-06 — open

`classifyEuAiActRisk` implemented twice

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** P2-11 owns the wired EU classifier, but its touch scope does not include retiring or adapting globalRegulatory. No approved scope covers both implementations and their public consumers.
**Decision required:** Decide whether the older classifier becomes an adapter, remains a distinct documented contract, or is deprecated. Approve a scope covering both implementations and name the owner.
**Decision group:** `row-G3-06`.

**Narrow leads, all unapproved:**
- P2-11: wired euAiActClassifier only; P1-53:34 explicitly refers classifier ownership here. Does not own globalRegulatory retirement/adaptation or both public contracts. Evidence: `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P2-11.md:35; /Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P1-53.md:34`. No assignment applied.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-07 — open

claims/ vs score/ same-name modules

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The draft records two combined approximately-equal expressions as absent leaf paths. These are unresolved source relationships, not absence evidence. The exact paired contracts and consumers must be resolved before a whole-row successor can be proposed.
**Decision required:** Resolve each pair into exact source paths, APIs and consumers, then choose distinct contracts or a canonical implementation and name the owner.
**Decision group:** `row-G3-07`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Source observation caveat:**
- `src/claims/claimExpiry.ts≈src/score/claimExpiry.ts`: unresolved combined or pattern expression; original value retained as historical provenance.
- `src/claims/confidenceDrift.ts≈src/score/confidenceDrift.ts`: unresolved combined or pattern expression; original value retained as historical provenance.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-11 — open

monitoring/ vs drift/

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** The shared monitoring-library boundary can be decided with G2-40. The broader drift subsystem and continuousMonitor/trustDriftMonitor relationship require an additional explicit consolidation or distinct-purpose decision and owner.
**Decision required:** Answer the shared monitoring boundary, then separately decide the real drift/continuousMonitor relationship and name its owner.
**Decision group:** `monitoring-library-boundary`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-10 — open

Two approval stores

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** No current spec chooses or reconciles both original approval stores as a single canonical store or supported distinct contracts. Signed approval execution work alone does not establish this data-store boundary.
**Decision required:** Choose one canonical approval store or document distinct supported contracts, with migration and signed-execution compatibility owned explicitly.
**Decision group:** `row-G3-10`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-15 — open

app.js dead equalizer/benchmarks twins

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** P2-29 owns CLI/docs consolidation, not these inline console equalizer/benchmark duplicates. No current issue identifies the canonical UI implementation and owns removal or adaptation of both twins.
**Decision required:** Identify the canonical equalizer/benchmark UI implementations and the accepted inline-console boundary; name the owner of the complete duplicate pair set.
**Decision group:** `row-G3-15`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-17 — open

Badge/share logic re-implemented inline

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** No row-specific complete remedy or accepted library/consolidation boundary was established. Historical evidence is retained; successor assignment needs Sid/integrator.
**Why no whole-scope successor is established:** Docs badge corrections do not own deduplication of inline share/badge implementation. No existing issue establishes the canonical helper, its consumer contracts and migration acceptance.
**Decision required:** Identify the canonical badge/share helper and migration compatibility for all inline callers; name the owner.
**Decision group:** `row-G3-17`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G3-27 — mitigated

Three disjoint Python client/product surfaces

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Python platform is scoped as demonstration, but three SDK/product paths remain. Choosing one client is still a human/integrator decision.
**Why no whole-scope successor is established:** P2-13 owns the modern CLI-backed Python execution client. It does not retire the demonstration port or Bridge HTTP client. Original directory/module observations also require correction: two roots exist and amc_client resolves to a .py file.
**Decision required:** Choose the supported roles of all three Python surfaces and any compatibility/deprecation policy. P2-13 can be a partial lead only after explicit scope approval.
**Decision group:** `row-G3-27`.

**Narrow leads, all unapproved:**
- P2-13: modern sdk/python/amc_sdk execution contract only. Does not own retirement of platform/python or src/sdk/python/amc_client.py. Evidence: `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P2-13.md:43`. No assignment applied.

**Source observation caveat:**
- `platform/python`: present directory misrecorded as absent leaf; original value retained as historical provenance.
- `sdk/python/amc_sdk`: present directory misrecorded as absent leaf; original value retained as historical provenance.
- `src/sdk/python/amc_client`: unresolved extension shorthand with existing candidate; original value retained as historical provenance.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G6-20 — mitigated

A security control (`trustBoundaryMode`) is read from an **unsigned** config; unlike ~14 sibling policies it has no `.sig` (also `guardrails.yaml`, `eval-harness.yaml`)

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Ledger requires a verified signature for isolated trustBoundaryMode; original guardrails/eval-harness siblings were not individually reconciled.
**Why no whole-scope successor is established:** Ledger signature admission is source-present, but the original guardrails and eval-harness sibling policies remain unreviewed. P1-15 explicitly excludes guardrails.yaml signing and asks for a follow-up; compiled-policy work does not own all unsigned sibling configurations.
**Decision required:** Identify which unsigned sibling configurations influence security, then accept an inactive/reference boundary or approve signed-policy acceptance and a named owner for every sibling.
**Decision group:** `row-G6-20`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G6-23 — deferred

Vault falls back to hardcoded `amc-test-passphrase` under test env; predictable but test-gated (prod path now throws)

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Predictable passphrase is a test-only historical finding. Current test-only confinement acceptance is deferred and no tests were authored or run.
**Why no whole-scope successor is established:** P0-37 owns exposure, distrust and rotation consequences of the published test passphrase, not proof of current test-only confinement. P0-07 excludes product vault edits. A specific confinement acceptance owner is still needed.
**Decision required:** Specify the exact test-only passphrase boundary and evidence required to accept confinement, or approve a separate vault-hardening follow-up; name the owner.
**Decision group:** `row-G6-23`.

**Narrow leads, all unapproved:**
- P0-37: exposure/distrust/rotation consequence only. Related context, not a proposed owner for test-only confinement. Evidence: `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/P0-37.md:38`. No assignment applied.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G8-01 — mitigated

11 distinct SQLite stores opened via 3 incompatible idioms (pooled `sqlitePool`, raw `new Database()` in 13 files, `nativeGuard` ABI self-heal wrapper)

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Specific opener bugs changed (dirname and pool usage), while raw and pooled SQLite stores remain; complete consolidation is not established.
**Why no whole-scope successor is established:** P2-09 concerns the evidence ledger/guard-events/Postgres backend and explicitly leaves host.db and other SQLite files on the volume. It does not own consolidation of all 11 original stores and three opening idioms.
**Decision required:** Decide whether independent stores are supported with common opening rules or whether all-store consolidation is required; name the complete owner.
**Decision group:** `row-G8-01`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G8-03 — mitigated

13 in-memory-only stores reset every CLI invocation — data never persists across runs

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Discovery persists, but the original heterogeneous stores include in-memory SCIM and monitoring. Five repaired stores do not dispose of all thirteen.
**Why no whole-scope successor is established:** The row combines 13 stores with different durability requirements; some process-local state may be intentional. Persisting five stores or hardening the identity SCIM route does not dispose of every member or define which state must persist.
**Decision required:** Classify every original store as intentionally ephemeral or requiring restart durability, with its lifecycle and acceptance owner. Keep the list complete.
**Decision group:** `row-G8-03`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G8-05 — mitigated

Mutable runtime/fleet state committed to git

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Three mutable state files are absent; context-graph and signed-paired target remain tracked. Original all-five removal scope needs explicit boundary acceptance.
**Why no whole-scope successor is established:** Three listed state files are absent, but context-graph and the signed target remain tracked. No existing issue accepts the all-five tracking boundary. Any cleanup or untracking requires a separate approved scope and must preserve authored state.
**Decision required:** Decide the tracked-fixture versus mutable-runtime-state boundary for all five files. Name an owner; this packet authorizes no cleanup or deletion.
**Decision group:** `row-G8-05`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G8-12 — open

Entire `src/hallucination/` dir orphaned — polished module + tests + docs, no runtime path

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Hallucination package remains as a library; product wiring, failure parsing and accepted boundary still need successor assignment.
**Why no whole-scope successor is established:** The same five-file library boundary is shared with G2-31. Product failure parsing and model-failure behavior remain additional G8-12 acceptance, so a common boundary decision alone is insufficient.
**Decision required:** Answer the common hallucination boundary and separately specify model/failure parsing acceptance and its owner.
**Decision group:** `hallucination-library-boundary`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G8-13 — open

Score-analytics cluster reachable only through `src/index.ts` barrel — no product path scores with them

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** Original analytics cluster needs module-by-module disposition; a barrel export does not prove a product consumer.
**Why no whole-scope successor is established:** The original src/score paths are absent as leaves, while matching basenames appear in the src/diagnostic analytics inventory of G2-26. The historical location and actual intended modules must be resolved; this is not the same cluster as G2-25.
**Decision required:** Resolve the historical namespace and intended analytics members before deciding consumers/library scope and naming an owner. Do not combine it with G2-25.
**Decision group:** `row-G8-13`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

### G8-25 — open

Complete standalone service embedded at repo top level

**Current authoring successor:** `{"planKey":null,"paused":null}`.
**Original authoring reason:** qa/package.json and independent QA README remain. Accepted standalone-service boundary or relocation is unresolved; G8-25b does not close it.
**Why no whole-scope successor is established:** No current issue owns accepting or relocating the standalone qa service with its separate runtime, lockfile, migrations and tests. CLI/docs consolidation and supplemental scanner-path repair do not establish that service boundary.
**Decision required:** Accept a documented standalone QA-service boundary or approve a relocation/deprecation proposal, with a named owner and separate runtime/build/support acceptance.
**Decision group:** `row-G8-25`.
**Narrow unapproved lead:** none established from the reviewed specs.

**Answer:**
- Supported boundary:
- Complete owner/scope (existing approved key or proposed follow-up without a key):
- Acceptance evidence required:
- Remaining per-row caveats:

## Proposed G6-07 acceptance clarification — not applied

G6-07 is separate from the 38 missing-owner rows: it already maps to P0-09. Retain its **open** residual and AMC-1525 link.

The draft did not execute P0-29 qualification. However, accepted main already carries a dated P0-09 runtime/forgery/mutation receipt; a blanket claim that mutations have never been performed is stale. Historical scoped proof does not establish current complete acceptance.

Accepted main carries `qualification/2026-10-07-P0-09/receipt.json`, dated `2026-10-07`, for `cbbd012b5c5291481a72987f865eae8dbd26785f` on `v25.5.0`. Its 8,819 reported test passes overlap across focused, affected and parity invocations. `README.md:193-203` records review mutations MR1–MR5 and restoration; `README.md:142-149` and `receipt.json:188` record remaining portable-command/pinning scopes. The current main source rejects unsigned legacy history at `src/crypto/keys.ts:18-22` and `src/crypto/keyHistoryEnvelope.ts:91-102`.

**Proposed replacement reason:**

Current main rejects unsigned legacy history and admits history through signed role-bound envelopes. P0-09 records historical scoped runtime, forgery and mutation proof at cbbd012b5c5291481a72987f865eae8dbd26785f. This P0-29 source review has not rerun that proof or qualified every affected surface. Portable verifier/pinning and operator trust-root/rotation acceptance remain explicit residual scopes; keep G6-07 open, mapped to P0-09, with AMC-1525 linked. Do not force implemented or claim that no historical mutation proof exists.

**Proposed spot-check clarification:** Retain the current open -> P0-09 assertion, but tie its reason to named residual acceptance and record the historical P0-09 receipt separately. A historical receipt must not automatically promote the row or qualify P0-29.

This proposal acknowledges dated proof. It does not rerun that proof, certify all current-main surfaces, resolve operator trust-root/rotation acceptance, promote G6-07 to implemented or qualify P0-29.

## Historical inventory resolution caveats

The original candidate is preserved. A future derived copy may classify these observations truthfully without changing row status or routing. Use tree prefixes for directory presence; classify combined expressions and patterns as unresolved unless their full member sets are explicitly resolved. Missing filename extensions need exact source resolution. Extensionless legitimate files such as Dockerfile and current-agent must not be treated as malformed merely because they lack an extension.

- G2-02: `fixtures/packs/*PackV1.json` — unresolved combined or pattern expression. No exact member set resolved here.
- G2-41: `src/shield/9` — unresolved numeric cluster token. No exact member set resolved here.
- G3-07: `src/claims/claimExpiry.ts≈src/score/claimExpiry.ts` — unresolved combined or pattern expression. No exact member set resolved here.
- G3-07: `src/claims/confidenceDrift.ts≈src/score/confidenceDrift.ts` — unresolved combined or pattern expression. No exact member set resolved here.
- G3-30: `scripts/swarm-test.py↔swarm-test-v2.py` — unresolved combined or pattern expression. No exact member set resolved here.
- G3-30: `internal/debug/test-model-scanner.cjs↔.mjs` — unresolved combined or pattern expression. No exact member set resolved here.
- G3-26: `platform/python/amc/score` — present directory misrecorded as absent leaf. platform/python/amc/score/EVIDENCE_SYSTEM_REPORT.md; platform/python/amc/score/__init__.py; platform/python/amc/score/adversarial.py
- G3-26: `platform/python/amc/shield` — present directory misrecorded as absent leaf. platform/python/amc/shield/__init__.py; platform/python/amc/shield/s10_detector.py; platform/python/amc/shield/s11_attachment_detonation.py
- G3-26: `platform/python/amc/enforce` — present directory misrecorded as absent leaf. platform/python/amc/enforce/__init__.py; platform/python/amc/enforce/e10_gateway_scanner.py; platform/python/amc/enforce/e11_mdns_controller.py
- G3-26: `platform/python/amc/vault` — present directory misrecorded as absent leaf. platform/python/amc/vault/__init__.py; platform/python/amc/vault/v10_undo_layer.py; platform/python/amc/vault/v11_metadata_scrubber.py
- G3-26: `platform/python/amc/watch` — present directory misrecorded as absent leaf. platform/python/amc/watch/__init__.py; platform/python/amc/watch/prebuilt_policy_packs.py; platform/python/amc/watch/w10_policy_packs.py
- G3-26: `platform/python/amc/product` — present directory misrecorded as absent leaf. platform/python/amc/product/__init__.py; platform/python/amc/product/ab_testing.py; platform/python/amc/product/api_wrapper_generator.py
- G3-27: `platform/python` — present directory misrecorded as absent leaf. platform/python/.amc/score_sessions.sqlite; platform/python/Makefile; platform/python/README.md
- G3-27: `sdk/python/amc_sdk` — present directory misrecorded as absent leaf. sdk/python/amc_sdk/__init__.py; sdk/python/amc_sdk/client.py; sdk/python/amc_sdk/proof.py
- G3-27: `src/sdk/python/amc_client` — unresolved extension shorthand with existing candidate. src/sdk/python/amc_client.py
- G3-29: `docs/research` — present directory misrecorded as absent leaf. docs/research/gap-0610-trism-agentic-live-drift.md
- G4-33: `src/enforce` — present directory misrecorded as absent leaf. src/enforce/abac.ts; src/enforce/actionEvidenceLogic.ts; src/enforce/actionEvidenceLogicCli.ts
- G4-33: `src/governor` — present directory misrecorded as absent leaf. src/governor/actionCatalog.ts; src/governor/actionPolicyEngine.ts; src/governor/actionPolicySchema.ts
- G4-33: `src/fleet` — present directory misrecorded as absent leaf. src/fleet/cascadeSimulator.ts; src/fleet/contradictionDetector.ts; src/fleet/delegationPacket.ts
- G4-33: `src/api` — present directory misrecorded as absent leaf. src/api/accessPolicy.ts; src/api/adaptersRouter.ts; src/api/agentTimelineRouter.ts
- G4-33: `src/sdk` — present directory misrecorded as absent leaf. src/sdk/a4Client.ts; src/sdk/amcAgent.ts; src/sdk/amcClient.ts
- G4-33: `src/ops` — present directory misrecorded as absent leaf. src/ops/audit.ts; src/ops/backpressure.ts; src/ops/backup/backupCli.ts
- G4-33: `src/claims` — present directory misrecorded as absent leaf. src/claims/claimConfidence.ts; src/claims/claimExpiry.ts; src/claims/claimFactory.ts
- G4-33: `src/score` — present directory misrecorded as absent leaf. src/score/a2aProtocol.ts; src/score/adaptiveAccessControl.ts; src/score/adversarial.ts
- G4-33: `src/assurance` — present directory misrecorded as absent leaf. src/assurance/agentResponder.ts; src/assurance/assuranceCertificates.ts; src/assurance/assuranceCli.ts
- G4-33: `src/observability` — present directory misrecorded as absent leaf. src/observability/anomalyDetector.ts; src/observability/costBudgetEvidence.ts; src/observability/costTracker.ts
- G4-35: `src/guide` — present directory misrecorded as absent leaf. src/guide/fixCli.ts; src/guide/frameworkGuide.ts; src/guide/guideGenerator.ts
- G4-35: `src/eval` — present directory misrecorded as absent leaf. src/eval/amcJudgeIntegration.ts; src/eval/costLatencyAssertions.ts; src/eval/customAssertionEngine.ts
- G5-05: `docs/RESEARCH_PAPERS_2026` — unresolved extension shorthand with existing candidate. docs/RESEARCH_PAPERS_2026.md
- G5-28: `docs/research/gap-0610↔source-reviews/gap-0610` — unresolved combined or pattern expression. No exact member set resolved here.
- G6-04: `deploy/compose/secrets/*.txt` — unresolved combined or pattern expression. No exact member set resolved here.
- G7-13: `src/casebooks` — present directory misrecorded as absent leaf. src/casebooks/casebookCli.ts; src/casebooks/casebookRunner.ts; src/casebooks/casebookSchema.ts
- G7-13: `src/eoc` — present directory misrecorded as absent leaf. src/eoc/flows.ts
- G7-13: `src/executive` — present directory misrecorded as absent leaf. src/executive/brief.ts
- G7-13: `src/bootstrap` — present directory misrecorded as absent leaf. src/bootstrap/bootstrap.ts
- G7-22: `scripts/swarm-test*.py` — unresolved combined or pattern expression. No exact member set resolved here.

## Unchanged boundaries

No assignment, row status, tracker or source changed. AMC-1500/G4 and AMC-1503/G7 remain paused. Historical register IDs, G7-13b/G8-25b supplemental distinctions, and conditional close-out proposals remain intact. No P0-29 qualification command ran. Only the requested Markdown and JSON reports were written under `/private/tmp`.
