# GAP-1077 - api-relay-audit release gates

- Gap: `GAP-1077`
- Dimension: Deployment and release maturity gates
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `https://github.com/toby-bridges/api-relay-audit`, README `https://raw.githubusercontent.com/toby-bridges/api-relay-audit/master/README.md`, LICENSE `https://raw.githubusercontent.com/toby-bridges/api-relay-audit/master/LICENSE`, and release `https://github.com/toby-bridges/api-relay-audit/releases/tag/v2.3.0`
- Retrieval: Live GitHub API and raw file review on `2026-06-25T07:42:00.000+05:30`
- Status: Done

## Relevance decision

`toby-bridges/api-relay-audit` is relevant to AMC as security-governance source context for release gates around relays, proxies, model substitution, prompt injection, tool-call rewriting, SSE anomalies, error leakage, and wallet-sensitive workflows. The GitHub repository description is: `Local security audit for AI API relays and LLM proxies: detects prompt injection, model substitution, tool-call rewriting, SSE anomalies, error leakage, and Web3 wallet risks.`

The source maps to AMC's existing generic release-gate receipt, which already records `gate config`, target `environment`, run receipt, failure reason list, override status, source citations, signed evidence refs, evidence-chain hash, row hash, and receipt hash. It does not justify an api-relay-audit adapter, an importer, a proxy scanner clone, a source-specific route, a source-specific CLI command, or a parity claim.

## Live source metadata

- Repository: `https://github.com/toby-bridges/api-relay-audit`
- Default branch: default branch `master`
- Current default branch commit `a8db16a1d90b2e4d35a82758f6b1ac73c1c8d8b1`, signed and verified by GitHub.
- Repository state: not archived, not a fork.
- Primary language: Python.
- Language bytes from GitHub API: Python, HTML, CSS, and Shell.
- License: AGPL-3.0 / GNU Affero General Public License v3.0.
- stargazerCount `723`
- forkCount `68`
- open issues `8`
- latest release `v2.3.0`, published `2026-06-07T05:24:52Z`
- README blob `7cb9867d44eb5b25923adee23bf57789e61845d3`
- LICENSE blob `be3f7b28e564e7dd05eaf59d64adba1a4065ac0e`
- Root source review found README, LICENSE, CITATION.cff, SECURITY.md, `audit.py`, `api_relay_audit/`, `docs/`, `tests/`, `scripts/`, and release/support files.

The first raw-file attempt against `main` returned 404 because the default branch is `master`; subsequent raw README and LICENSE checks used `master`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Release-gate receipts can cite Score evidence when maturity or integrity gates block release. |
| Shield | Relevant as security context, but no Shield pack or proxy scanner clone was added. Shield evidence must be AMC-owned and signed. |
| Enforce | No runtime enforcement changed. Existing gate outcomes can block releases when evidence is missing. |
| Vault | Relevant because release-gate receipts reference signed evidence without embedding keys, relay secrets, prompts, or report payloads. |
| Watch | No Watch monitor changed. Relay or proxy observability can be cited through signed evidence refs. |
| Fleet | Relevant as deployment context because receipts bind agent id and environment such as production. |
| Passport | Relevant because release-gate audit export provides portable proof of gate decisions and overrides. |
| Comply | Relevant because release decisions and overrides need auditable evidence chains and owners. |

## Product closure

No product code changed. Existing `src/ci/gate.ts` release-gate receipt primitives from GAP-1075 already satisfy this gap:

- `buildReleaseGateReceipt`
- `verifyReleaseGateReceipt`
- `renderReleaseGateAuditExport`

The focused GAP-1077 test proves the existing receipt can represent a source-cited relay-audit release decision and fails closed when repository metadata replaces signed release-gate proof.

## Fail-closed rule

metadata-only api-relay-audit evidence must fail closed. Repository stars, forks, topics, README labels, release names, issue counts, language metadata, source file names, tool descriptions, or a signed GitHub commit cannot by themselves pass an AMC release gate. A valid release-gate claim still requires AMC-owned gate config, target environment, evaluated timestamp, run receipt ref and hash, failure reasons for failed gates, signed override evidence when an override exists, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No api-relay-audit adapter, proxy scanner clone, relay scanner import, GitHub importer, README parser, source-specific release gate, source-specific API route, source-specific CLI command, upstream code, upstream report fixture, upstream sanitized report, upstream prompts, upstream configs, upstream examples, upstream screenshots, or copied implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1077-api-relay-audit-release-gates.md` did not exist; 3 product/no-bloat tests passed.
- Live source checks:
  - `gh repo view toby-bridges/api-relay-audit --json ...` returned the repository metadata recorded above.
  - `gh api repos/toby-bridges/api-relay-audit/contents` returned root files including README, LICENSE, `audit.py`, package directory, docs, tests, and scripts.
  - `gh api repos/toby-bridges/api-relay-audit/readme` returned README path, blob, size, and default-branch raw URL.
  - `gh api repos/toby-bridges/api-relay-audit/commits/master` returned default branch commit `a8db16a1d90b2e4d35a82758f6b1ac73c1c8d8b1` with verified signature status.
  - `curl -sSL https://raw.githubusercontent.com/toby-bridges/api-relay-audit/master/README.md` and `curl -sSL https://raw.githubusercontent.com/toby-bridges/api-relay-audit/master/LICENSE` were used for narrow header/license review.
- Focused test: `npx vitest run tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts --reporter=dot`
- Paired release-gate regression: `npx vitest run tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts tests/releaseBundlesArchetypesGate.test.ts tests/outcomesCasebooksExperimentsValueGates.test.ts tests/consoleApprovalsWhatifBenchmarks.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
