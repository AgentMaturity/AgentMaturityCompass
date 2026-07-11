# AMC-1465 - Signed adapter capability receipts

- Gap: `AMC-1465`
- Dimension: adapter truth, portability, capability verification
- AMC surfaces requested: Passport, Watch, Enforce, CLI, API, Docs
- Sources reviewed: Agent Event Protocol draft; Agent Control integrations and controls
- Retrieval: primary repositories and documentation reviewed 2026-07-11
- Status: Done and published

## Relevance decision

This gap is directly relevant. AMC already had one executable adapter registry, signed adapter configuration, runtime detection, reversible Claude Code and Gemini CLI hooks, provider-native control receipts, and Passport signing. It did not give users one trustworthy answer for what an adapter declares, what is effective now, what normalization loses, or what version was actually probed.

The gap also exposed an internal integrity problem: `src/adapters/adapterStandardization.ts` maintained a second hand-authored capability table with identifiers that did not match `src/adapters/registry.ts`, while `docs/ADAPTER_COMPATIBILITY.md` labeled adapters as tested without a current portable verification result.

Agent Event Protocol draft `0.1` was reviewed at commit `2583cff9380f8f0a459d52c7112b6105c46496ed`. Its mapping review guidance says missing source data belongs in explicit `gaps` rather than invented fields. It also separates immutable events from hook control responses and leaves authentication, signing, replay protection, encryption, transport, and retention out of protocol scope. Agent Control was reviewed at commit `83188b62c63e2b4ff9ada87048fd99605184ee5a`; its explicit model/tool integration boundaries are a usability signal, not an AMC compatibility target.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No maturity score, question, trust weight, threshold, or methodology change. Adapter metadata cannot raise maturity. |
| Shield | Tampered, unknown, or untrusted receipt data fails verification; no new scanner or attack pack. |
| Enforce | Receipts expose which gateway and provider-native controls are effective without creating another policy engine. |
| Vault | Existing auditor keys sign the canonical receipt hash; raw prompts, arguments, output, paths, tokens, and secrets are excluded. |
| Watch | Event coverage and lossiness are explicit; no provider event is inferred from adapter naming alone. |
| Fleet | Receipts bind one agent ID and adapter ID; no new orchestration system is added. |
| Passport | The standalone portable receipt is the primary product closure and uses the existing auditor trust path. |
| Comply | Auditors can verify the signed limitation/effective-state artifact; no new legal or framework mapping claim. |

## Product closure

Every built-in adapter embeds a versioned capability declaration in its authoritative definition. The declaration lists exact events, controls, activation conditions, definition version, runtime-version source, known omissions, verification authority, and fixture evidence references. Missing capability metadata on an older plugin is normalized only to an explicit unverified/unknown declaration with empty event/control claims. A plugin cannot self-label its publisher fixture as AMC verification; plugin receipts remain fail closed until the separate partner-certification lane exists.

`amc.adapter-capability-receipt.v1` binds that declaration to the current runtime probe, detected version, signed per-agent adapter selection, Claude/Gemini hook state, effective event/control projection, verification status, deterministic receipt ID, canonical SHA-256 hash, and auditor signature. `amc adapters capabilities` and `POST /api/v1/adapters/capability-receipts` expose the same contract. The older adapter-standardization exports now derive conservatively from the real registry and keep only legacy ID aliases for API compatibility.

## Fail-closed rule

The capability result is `fail_closed` when declaration evidence is absent or publisher-only, the adapter comes from an uncertified plugin, the runtime or version is unavailable, signed adapter configuration is missing/invalid/not selected, or a managed hook is invalid, expired, drifted, or bound to a different agent. Host-runtime, shell-runtime, and mixed probes stay `partial` because they do not prove a framework package version. A correctly signed `partial` or `fail_closed` receipt remains valid proof of a limitation; receipt tamper, schema smuggling, hash mismatch, subject mismatch, effective projection mismatch, receipt-ID mismatch, or an untrusted key makes the receipt invalid.

## No-bloat boundary

No second adapter registry, policy engine, provider SDK, AEP importer, copied mapping, Agent Control wrapper, provider event database, framework-version guesser, daemon, queue, methodology version, Score increase, mobile client, or provider-parity claim was added. No upstream code, mappings, examples, schemas, configs, payloads, screenshots, or prose were copied.

## Verification

- TDD red: the focused receipt suite initially failed because the receipt module and authoritative declarations did not exist.
- Final adapter declaration, signing, tamper, live runtime, plugin, hook, adapter, API, OpenAPI, Studio authorization, and compatibility regression: 11 files / 143 tests passed.
- Public inventory regression after correcting the stale pre-AMC-1465 count: 4 files / 16 tests passed.
- Full Vitest on the exact tracked tree: 1,060 files / 8,380 tests passed directly and inside the final release gate.
- Typecheck, build, 1,483-file Docs drift, architecture boundaries, OpenAPI parse, and diff check passed.
- Playwright: 55 passed / 2 intentional i18n skips.
- All 10 isolated install personas passed at 10/10.
- Runtime dependency audit: 0 vulnerabilities.
- Prepack archive, SBOM, license inventory, scan, release pack, and signature verification passed.
- Final live-enabled release gate passed, including HTTP 200 from `https://agentmaturity.co`; receipt: `tmp/release-gate/amc-1465-final-v2.json`.
- Feature commit `3dad59dc5e87f006dc2c3f9c6c4e56385107512a` is pushed to `main` and matches `origin/main`.
- Remote publication passed: [CI 29142925398](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29142925398), [Pages 29142925395](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29142925395), [Docker 29142925406](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29142925406), and [npm validation 29142925393](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29142925393). Registry publication was correctly skipped because `NPM_TOKEN` is not configured; validation, build, and prepack passed.
- Production homepage exposes 8,380 passing tests, 14 adapters, and portable signed receipt copy. Production adapter docs expose the command, strict verification states, plugin certification boundary, canonical IDs, and corrected Gemini package. Production OpenAPI exposes `/v1/adapters/capability-receipts` and `amc.adapter-capability-receipt.v1`.
- Production visual proof at 1,440px and 390px had zero horizontal overflow and zero console errors. Apex returned HTTP 200; `www` returned the expected 301 to apex.
- Let's Encrypt certificate covers `agentmaturity.co` and `www.agentmaturity.co`, valid from 2026-06-26 through 2026-09-24.
