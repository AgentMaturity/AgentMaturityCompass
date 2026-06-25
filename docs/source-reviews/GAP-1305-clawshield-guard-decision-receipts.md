# GAP-1305 - ClawShield guard decision receipts

- Gap: `GAP-1305`
- Dimension: `security-guard-receipts`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: SleuthCo ClawShield public repository
- Retrieval: 2026-06-25 live GitHub repository, GitHub API, raw README, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/SleuthCo/clawshield-public`
- GitHub API: `https://api.github.com/repos/SleuthCo/clawshield-public`
- Raw README: `https://raw.githubusercontent.com/SleuthCo/clawshield-public/master/README.md`
- Failed default-guess README URL: `https://raw.githubusercontent.com/SleuthCo/clawshield-public/main/README.md`
- Repository contents API: `https://api.github.com/repos/SleuthCo/clawshield-public/contents?ref=master`

Live source metadata at retrieval:

- GitHub API identifies public repository `SleuthCo/clawshield-public`, not archived, not disabled, not a fork, default_branch `master`, language `Go`, license metadata `Apache-2.0`, stars `132`, forks `18`, open issues `10`, created `2026-03-01T03:12:37Z`, pushed `2026-03-26T20:29:39Z`, and updated `2026-06-16T21:54:13Z`.
- GitHub topics include `ai-agents`, `ai-security`, `audit-logging`, `defense-in-depth`, `ebpf`, `go`, `llm-security`, `openclaw`, `pii-detection`, `prompt-injection`, `reverse-proxy`, `security-proxy`, and `vulnerability-scanning`.
- The raw README on `master` identifies `ClawShield` and source context for a `Security proxy for AI agents`, prompt injection, PII, secrets, defense-in-depth, iptables, eBPF, YAML policy, Audit logging, RAG, vulnerability scanning, and installation context.
- The same raw README path on `main` returned 404 because the repository default branch is `master`; AMC records this to avoid metadata-only or wrong-branch claims.
- Repository contents API confirms top-level files and directories including `README.md`, `LICENSE`, `TEST_SUMMARY.md`, `clawshield-test-report.md`, `Dockerfile`, `go.mod`, `go.sum`, `config`, `docs`, `ebpf`, `firewall`, `logging`, `policy`, `proxy`, `scripts`, and `shared`.

## Relevance decision

GAP-1305 is relevant to AMC through Shield, Enforce, Vault, and the existing compact signed guard decision receipt primitive created for GAP-1247. ClawShield is useful source-review context for an AI-agent security proxy that watches for prompt injection, PII, secrets, policy decisions, audit logs, and defense-in-depth controls, but AMC should not add a ClawShield adapter, proxy runtime, firewall integration, eBPF dependency, YAML policy importer, Go bridge, vulnerability scanner runner, or source-specific guard subsystem.

The correct AMC closure is to prove that ClawShield-style guard outcomes are represented by AMC-owned signed guard decision receipts with decision type, matched rule, input hash, output hash, and signer. This satisfies the acceptance requirement: `Decision type, matched rule, input hash, output hash, and signer`.

metadata-only ClawShield repository facts, README labels, topic labels, source identity, branch names, stars, forks, issue counts, or local backlog text cannot prove a guard decision.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Score may consume observed guard evidence, but this gap does not change score weights or scoring methodology. |
| Shield | Relevant. Shield can verify signed receipts explaining allow, block, redact, step-up, and escalate decisions. |
| Enforce | Relevant. Enforce emits and persists the shared guard decision receipt without duplicating a proxy, firewall, or eBPF runtime. |
| Vault | Relevant. Vault preserves hashes, payload hash, signature, signer, receipt hash, and receipt metadata without storing raw prompts, PII, secrets, or outputs. |
| Watch | Context only. Watch can inspect guard events, but this gap is not a new monitor. |
| Fleet | Context only. Fleet may aggregate guard status later, but no orchestration topology changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Signed receipts may support audits, but no compliance mapping changed. |

## Product closure

Closed through the existing AMC-native guard decision receipt primitive:

- `buildGuardDecisionReceipt`
- `emitGuardDecisionReceipt`
- `readGuardDecisionReceipts`
- `verifyGuardDecisionReceipt`
- persisted guard-event metadata emitted by `src/enforce/evidenceEmitter.ts`
- `tests/gap1305ClawshieldGuardDecisionReceiptsBoundary.test.ts`

No product code change was needed for GAP-1305 because the generic guard decision receipt already binds decision type, matched rule, input hash, output hash, signer, payload hash, signature, receipt hash, and persisted guard-event metadata.

## Fail-closed rule

The following must fail closed for GAP-1305:

- ClawShield repository identity alone;
- GitHub API metadata, raw README labels, repository contents API, stars, forks, license, language, branch, commit dates, topic labels, prompt-injection labels, PII labels, secrets labels, iptables labels, eBPF labels, YAML policy labels, audit logging labels, RAG labels, vulnerability-scanning labels, local backlog text, or source identity alone;
- wrong-branch README retrieval from `main` when the live default branch is `master`;
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

No ClawShield adapter, ClawShield API client, proxy runtime, Go package dependency, firewall integration, iptables integration, eBPF integration, YAML policy importer, audit-log importer, vulnerability scanner runner, prompt-injection scanner importer, PII scanner importer, secrets scanner importer, RAG knowledge-base importer, docs importer, examples importer, config importer, CLI command, API route, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, source-specific scoring path, or ClawShield-specific implementation branch was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, policy files, firewall scripts, eBPF programs, prompts, vulnerability scan outputs, screenshots, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1305ClawshieldGuardDecisionReceiptsBoundary.test.ts --reporter=dot` first failed because this doc did not exist while three guard receipt/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1305ClawshieldGuardDecisionReceiptsBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1305ClawshieldGuardDecisionReceiptsBoundary.test.ts tests/gap1263NemoGuardrailsDecisionReceiptsBoundary.test.ts tests/gap1247BamlGuardDecisionReceiptsBoundary.test.ts tests/evidencePipeline.test.ts tests/receipts.test.ts tests/receiptsCorrelationRuntimeDashboard.test.ts tests/governorToolhubWorkorders.test.ts --reporter=dot` passed, 7 files / 42 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 983 files / 7939 tests.
