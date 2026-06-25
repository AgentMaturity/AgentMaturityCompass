# GAP-1263 - NeMo Guardrails decision receipts

- Gap: `GAP-1263`
- Dimension: `security-guard-receipts`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: NVIDIA NeMo Guardrails
- Retrieval: 2026-06-25 live GitHub redirect, GitHub API, raw README, repository contents API, and docs URL review
- Status: Done

## Source reviewed

- Backlog repository URL: `https://github.com/NVIDIA/NeMo-Guardrails`
- Canonical repository URL: `https://github.com/NVIDIA-NeMo/Guardrails`
- GitHub API: `https://api.github.com/repos/NVIDIA/NeMo-Guardrails`
- Raw README: `https://raw.githubusercontent.com/NVIDIA/NeMo-Guardrails/main/README.md`
- Repository contents API: `https://api.github.com/repos/NVIDIA/NeMo-Guardrails/contents?ref=main`
- Documentation URL: `https://docs.nvidia.com/nemo/guardrails/latest/index.html`

Live source metadata at retrieval:

- The backlog repository URL redirects to canonical GitHub repository `NVIDIA-NeMo/Guardrails`.
- GitHub API identifies public repository `NVIDIA-NeMo/Guardrails`, description `NeMo Guardrails is an open-source toolkit for easily adding programmable guardrails to LLM-based conversational systems.`, not archived, not disabled, not a fork, default_branch `develop`, language `Python`, license metadata `NOASSERTION`, homepage `https://docs.nvidia.com/nemo/guardrails/latest/index.html`, created `2023-04-18T12:32:47Z`, pushed `2026-06-25T10:47:37Z`, and updated `2026-06-25T13:24:54Z`.
- GitHub API topics include `agents`, `generative-ai`, `guardrails`, `llm-safety`, `llm-security`, `llms`, `nvidia`, `python`, and `safety`.
- Raw README identifies `NeMo Guardrails`, beta status, Apache 2.0 badge, latest release `0.17.0`, official docs moved to docs.nvidia.com/nemo/guardrails, programmable guardrails for LLM-based conversational applications, LLM Vulnerability Scanning, jailbreaks, prompt injections, Python API and guardrails server usage, and use cases for RAG, domain-specific assistants, LLM endpoints, LangChain chains, and agents.
- Repository contents API confirms top-level files and directories including `LICENSE.md`, `LICENSE-Apache-2.0.txt`, `SECURITY.md`, `README.md`, `docs`, `examples`, `nemoguardrails`, `tests`, `qa`, `pyproject.toml`, `poetry.lock`, `Dockerfile`, and `CHANGELOG.md`.

## Relevance decision

GAP-1263 is relevant to AMC through Shield, Enforce, Vault, and the existing compact signed guard decision receipt primitive created for GAP-1247. NeMo Guardrails is useful competitor context for programmable guardrails, vulnerability scanning, jailbreak/prompt-injection protection, and policy-like control over LLM application behavior, but AMC should not add a NeMo Guardrails adapter, Colang parser, Python runtime bridge, server integration, docs importer, or source-specific guard subsystem.

The correct AMC closure is to prove that NeMo-style guard outcomes are represented by AMC-owned signed guard decision receipts with decision type, matched rule, input hash, output hash, and signer. This satisfies the acceptance requirement: `Decision type, matched rule, input hash, output hash, and signer`.

metadata-only NeMo repository facts, README labels, docs labels, vulnerability-scanning labels, jailbreak labels, prompt-injection labels, Colang labels, release labels, topic labels, local backlog text, or source identity cannot prove a guard decision.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Score can consume observed guard events, but this gap does not change score weights or methodology semantics. |
| Shield | Relevant. Shield can verify signed guard receipts explaining allow, block, redact, step-up, and escalate decisions. |
| Enforce | Relevant. Enforce emits and persists the shared guard decision receipt without duplicating a NeMo runtime. |
| Vault | Relevant. Vault preserves input/output hashes, payload hash, signature, signer, and receipt hash without storing raw prompts or outputs. |
| Watch | Context only. Watch can read guard events, but this gap is not a new monitor. |
| Fleet | Context only. Fleet may consume guard decision status later, but no topology behavior changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Signed receipts may support audits, but no compliance mapping changed. |

## Product closure

Closed through the existing AMC-native guard decision receipt primitive:

- `buildGuardDecisionReceipt`
- `emitGuardDecisionReceipt`
- `readGuardDecisionReceipts`
- `verifyGuardDecisionReceipt`
- exported from `src/enforce/evidenceEmitter.ts` and `src/enforce/index.ts`
- `tests/gap1263NemoGuardrailsDecisionReceiptsBoundary.test.ts`

No product code change was needed for GAP-1263 because the generic guard decision receipt already binds decision type, matched rule, input hash, output hash, signer, payload hash, signature, receipt hash, and persisted guard-event metadata.

## Fail-closed rule

The following must fail closed for GAP-1263:

- NeMo repository identity alone;
- GitHub redirect, GitHub API metadata, raw README, repository contents API, docs URL, stars, forks, license, language, branch, commit dates, topic labels, release labels, beta labels, programmable guardrails labels, LLM Vulnerability Scanning labels, jailbreak labels, prompt injection labels, Colang labels, server labels, local backlog text, or source identity alone;
- a guard event without signed guard decision receipt metadata;
- receipt with missing decision type;
- receipt with missing matched rule;
- receipt with invalid input hash;
- receipt with invalid output hash;
- receipt with missing or invalid signer;
- payload hash mismatch;
- signature missing or signature verification failure;
- receipt hash mismatch;
- metadata-only source facts pretending to be guard evidence.

## No-bloat boundary

No NeMo Guardrails adapter, NeMo API client, Colang parser, Colang runtime, Python package dependency, guardrails server bridge, vulnerability scanner runner, jailbreak scanner importer, prompt-injection scanner importer, programmable-rail importer, docs importer, examples importer, config importer, RAG guardrail bridge, LangChain integration, LLMRails wrapper, CLI command, API route, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, source-specific scoring path, or NeMo-specific implementation branch was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, Colang flows, prompts, vulnerability scan outputs, screenshots, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1263NemoGuardrailsDecisionReceiptsBoundary.test.ts --reporter=dot` first failed because this doc did not exist while three guard receipt/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1263NemoGuardrailsDecisionReceiptsBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1263NemoGuardrailsDecisionReceiptsBoundary.test.ts tests/gap1247BamlGuardDecisionReceiptsBoundary.test.ts tests/evidencePipeline.test.ts tests/receipts.test.ts tests/receiptsCorrelationRuntimeDashboard.test.ts tests/governorToolhubWorkorders.test.ts --reporter=dot` passed, 6 files / 38 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 982 files / 7935 tests.
- Post-doc focused test: `npx vitest run tests/gap1263NemoGuardrailsDecisionReceiptsBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
