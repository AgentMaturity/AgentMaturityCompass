# DeepSeek Harness Self-Development System — Inventory

## 1. PACKAGE PURPOSES

- `.agents/skills/` — 11 repo-specific agent skills (SKILL.md + optional `agents/openai.yaml` Codex sidecar, `references/`, `scripts/`); the canonical source.
- `.claude/skills/` — byte-identical mirror of `.agents/skills` (verified `diff -rq` exit 0) so Claude Code and Codex load the same workflows.
- `.agents/notes/` — "Agent Notes": agent-written RFC/ADR corpus in four lifecycle trees (`proposed/` 25, `implemented/` 545, `rejected/` 11, `archived/` 143 English notes; each note is an English/Chinese/`.i18n.yaml` triplet — hence ~2,197 files).
- `.agents/notes/{proposed,implemented,rejected,archived}/{class}/` — path encodes lifecycle × class (`feature|bug-fix|simplification|architecture|process|testing`), closed set in `scripts/agent-note-tree.ts`.
- `AGENTS.md` (root, symlinked as `CLAUDE.md`) — standing orders: layout, commands, ~30 conventions, evidence policy, prose rules.
- `.github/AGENTS.md` — CI runner rules (Windows-under-Wine blocking job, self-hosted failover runbook pointer).
- `docs/AGENTS.md` — documentation standard: tier taxonomy ("one home per fact"), writing rules, word budgets, slop checklist.
- `packages/AGENTS.md` — package-authoring rules (plugin export forms, invariants, testing, README contracts).
- `scripts/` — ~100 executable gates/generators (`verify-*`, `gen-*`, `run-gates.ts` DAG scheduler) that mechanize the conventions.
- `docs/postmortem/` — 4 bilingual incident postmortems; the only tier where war-story narrative is allowed.
- `lefthook.yml` — deliberately narrow git hooks; CI owns the exhaustive matrix.

## 2. KEY MECHANISMS

**Agent Notes lifecycle** (`.agents/notes/README.md`): every non-trivial PR MUST add/update a note. Format is machine-gated (`scripts/verify-agent-note-format.ts`): exact header (`# Agent Note: <title>` + `Status:` line matching the folder), body skeletons per lifecycle (`proposed/`: Problem/Proposal/Alternatives/Acceptance criteria/Risks; `implemented/`: Problem/Decision/Alternatives/Consequences — present tense, spec-speak headings rejected), mandatory `## Alternatives considered` ("a decision recorded without what it beat invites re-litigation"), pre-format notes carry an exact escape comment. Filename date = first-proposed date; cross-links are relative markdown only (checked by `verify-md-links`); no central INDEX by decision (`implemented/process/2026-07-19-remove-generated-agent-note-index.md`). Implemented notes are kept factually current in the same PR that moves code, but never rewritten into a different decision — supersede + cross-link, or consolidate under strict preservation rules.

**Frozen archive** (`.agents/notes/archived/AGENTS.md`, `scripts/verify-archived-agent-notes.ts`): low-future-value implemented triplets move to `archived/{class}/`, gain an `Archived: YYYY-MM-DD` line, and are sealed via an append-only hash manifest — any later edit fails CI. Archived notes are explicitly "never current authority"; doc gates skip them.

**Bilingual pairing**: every doc/note pair `foo.md`/`foo.zh.md` has a `foo.i18n.yaml` sidecar recording git blob hashes of the last confirmed-consistent state; `verify-translation-pairing` (pre-commit on staged sidecars) fails drift. `gen-translation-brief` produces a diff-scoped briefing so updates translate only changed units, preserving reviewed phrasing (benchmarked in `implemented/process/2026-07-26-briefed-minimal-translation-updates.md`).

**Gate DAG**: `scripts/run-gates.ts` runs named aggregates (`doc-sync`, `check-all`, `ci-*`) as dependency graphs with bounded parallelism, `allowFailure`, and streamed output. `doc-sync` bundles all documentation gates; `hygiene` bundles knip/publint/workspace constraints.

**Evidence selection** (`dsh-pre-push-checks`): no universal local baseline — pick the narrowest test that would fail for the regression (owning spec file, focused snapshot, `doc-sync`, build smoke, e2e), driven by `pnpm run change-scope --base <verified-ref>` (versioned JSON of the diff scope). Never rerun passing checks ritually; `--force-with-lease=<branch>:<observed-oid>` only; post-`gh stack sync` validation protocol.

**Dual-product skills**: `scripts/verify-skill-invocation-metadata.ts` cross-checks SKILL.md frontmatter against `agents/openai.yaml` so a skill can't be model-invocable in one product and not the other (e.g. `dsh-translate-docs` sets `disable-model-invocation: true` — user-only).

## 3. FEATURE INVENTORY

**Skills** (all in `.agents/skills/<name>/SKILL.md`):
- `dsh-archive-agent-notes` — classify notes by future decision value; supersession audit triggered by every new note; calibrated worked examples; "never archive toward a quota".
- `dsh-code-review` — repo-oriented PR review: run `change-scope`, 6 blocking requirements (prose semantic review, docs-match-code, disposal tests, semantic invariant companions, evidence exists), 15 manual checks (lifecycle/concurrency, capability-seam fit, model perspective, enforcement-at-executor, bounds, test strength, bilingual quality); reporting etiquette incl. "no performative agreement".
- `dsh-doc-site-sync` — website as tested projection: `website/docs.ts` manifest → `scripts/project-doc-site.ts` → disposable `website/.generated/`; never hand-edit generated trees; zh routes at root, en under `/en/`.
- `dsh-doc-standards` — placement/audit workflow over docs/AGENTS.md: tier choice, tutorial-vs-reference classification, budget failures (relocate → condense → raise ceiling).
- `dsh-find-simplifications` — evidence-backed simplification hunting: strong-candidate taxonomy (no production consumer, twin representations, speculative generality, hand-rolled-vs-dependency), protected seams (dual LLM adapters/persistence backends intentional by default), outputs proposed notes or TODO markers.
- `dsh-merging-stacked-prs` — requires GitHub's native stack object (`gh stack merge`, `PullRequest.stack` GraphQL); hard-stop without it; never hand-retarget.
- `dsh-pre-push-checks` — evidence selection (above), focused coverage recipes (`vitest --coverage.include`, `vitest related`), full-rehearsal only on explicit request/CI diagnosis.
- `dsh-prose-standard` — editorial contract: requires explicit `scope` input (refuses to infer), `mode: automatic|interactive`, complete-proposition preservation, banned-metaphor check (`contract/boundary/shape/seam` need exactness test), vendor/ and archived/ exclusion recipes.
- `dsh-translate-docs` — user-invocation-only extended translation workflow; briefing-driven minimal updates vs whole-document path; triage by change type.
- `dsh-trim-cot-leakage` — 8-class taxonomy of reasoning-transcript leakage ("this PR adds", "(decision 7)", review choreography, hedges); the one test: resolvable by a reader at HEAD with no session access; `references/recall-batteries.md` = tuned ripgrep batteries (English + Chinese) with invocation rules and known-positive validation; explicit "what is not leakage" keep-rules.
- `record-browser-gif` — every GUI-changing PR MUST embed a GIF recorded from the PR's real server/model flow (no fixtures/mocks unless requested); records exact demonstrated SHA; recording/publication separation; assets-branch publishing; bundled deterministic `scripts/encode_gif.py`.

**Rules (root AGENTS.md conventions)**: pre-release "foundation over blast radius" section with self-destruct instruction ("Remove this section at the first tagged release"); registrations-as-effects with disposers; "model-visible ⟺ logged" (any model input must be reconstructable from the session log; new input ⇒ new session event); plugins-not-loop-changes; capability seam = Definition/Provider/Consumer, complete or nothing; no hardcoded tunables (must be cordis.yml `Config`); misconfiguration fails loud; branded IDs (`Branded<B>`); trust TypeScript at typed same-process boundaries — validate only at parser/wire/durable/worker boundaries; explicit `resolve(request): Spec` defaulting; empty `catch` must name what it swallows; symmetry-for-parallel-values; tests describe behavior not correctness; sandbox-escalation-with-evidence protocol; FIXME (blocks release) / TODO (soon) / XXX (someday) semantics; label taxonomy (one `kind/*`, all `area/*`, native Issue Type); trailing-newline gate.

**Commands/gates**: `test`, `test:coverage` (per-file 100% on `packages/*/*/src` — the CI gate), `test:e2e` (self-skips without `DEEPSEEK_API_KEY`), `test:snapshot` / `:record` / `:refresh` (keyless replay of real runnable examples), `test:web*`, `check:all`/`check:ci*` aggregates, `check:windows-wine`, `check:node-compat`, `duplication` (jscpd), `hygiene`, `doc-sync`, `change-scope`, ~25 `verify-*` doc gates (md-wrap one-line-per-paragraph, md-links + fragments, doc-budgets word ceilings with 5%-headroom rule, doc-typecheck of fenced `ts` blocks with `type-equiv`/`public-api` manifests, export-jsdoc, package-invariants, readme-limitations/model-experience, cordis-config, runtime-closure, agent-note format/classification/archive), ~12 `gen-*` catalog generators with `--check` freshness twins (tool/config/persistence/cordis/module-graph/scoped-events/third-party-notices), `gen-translation-brief`, `demo:cordis` (agent modifies its own runtime), `mock:llm`.

**Hooks (lefthook.yml)**: pre-commit = staged pairing verify, archive verify, staged lint-fix, third-party-notices regenerate-not-reject, whitespace, vendor-manifest guard; pre-push = incremental typecheck only.

## 4. PATTERNS WORTH STEALING

- **Machine-gated ADR lifecycle**: status-in-path + format gate + mandatory Alternatives section (`scripts/verify-agent-note-format.ts`, `.agents/notes/README.md`). Cheap to enforce, kills re-litigation.
- **Frozen archive with hash manifest** (`verify-archived-agent-notes.ts`): decision corpus stays small without deleting history; "sealed" is mechanically true, not aspirational.
- **Supersession check on every new note** (`.agents/notes/AGENTS.md`): garbage collection is an inline obligation, not a periodic chore.
- **CoT-leakage skill with recall batteries** (`dsh-trim-cot-leakage/references/recall-batteries.md`): names the failure mode of agent-authored prose (session-vantage text) and ships tuned greps + the "reader at HEAD" test.
- **Evidence-not-ritual checks** (`dsh-pre-push-checks`): scope report → narrowest failing-capable check; bans reflexive full-suite runs. Huge token/time saver for agent loops.
- **Generate + `--check` twins** for every catalog: docs can't drift because CI regenerates and diffs.
- **Sidecar consistency hashes for bilingual pairs** (`*.i18n.yaml`): translation drift becomes a pre-commit failure.
- **One-line-per-paragraph + word budgets** (`verify-md-wrap`, `doc-budgets.manifest.json`): diffs stay reviewable, standing docs can't bloat.
- **GIF-as-evidence for GUI PRs** with recorded SHA and real-model requirement (`record-browser-gif`).
- **Skills declare invocation policy per product** and a gate keeps Claude/Codex metadata aligned (`verify-skill-invocation-metadata.ts`).
- **"Model-visible ⟺ logged"** invariant — session log as replayable source of truth.

## 5. MATURITY NOTES

- Heavy test discipline: per-file 100% coverage gate, four snapshot suites, e2e keyed tests, gate scripts have their own `.spec.ts` files (`scripts/*.spec.ts` ≈ 30). Fixtures must replay cross-platform ("fix fixtures, not normalizers").
- Pre-release posture is explicit: no compat shims, `SESSION_FORMAT_VERSION` pinned at 0, root AGENTS.md section slated for deletion at first tagged release.
- Active pipeline: 25 proposed notes (e.g. `proposed/architecture/2026-08-10-unary-apiproxy-remote-migration.md`), 11 rejected kept only as guardrails, 143 archived — the loop is being run, not just specified.
- `packages/experimental/` holds private prototypes excluded from official releases; Windows CI runs a Wine-based blocking job plus observational native/self-hosted failover lanes (`.github/AGENTS.md`).
- TODO markers are policy-graded (FIXME/TODO/XXX in `docs/development.md`); hedges in prose must be promoted to markers or deleted per `dsh-trim-cot-leakage`.
- Only 4 postmortems — young project (notes dated 2026-06 onward), but each postmortem already feeds standing rules (e.g. plugin export-form rule in `packages/AGENTS.md` cites `docs/postmortem/0001-acp-default-export-drops-inject.md`).
- Self-improving loop, concretely: conventions live in gated AGENTS.md tiers → every change ships a gated Agent Note → skills operationalize the notes → gates mechanize the skills' checkable parts → postmortems/notes feed new standing orders → archive skill prunes the corpus so context stays loadable. The agent can also literally modify its own runtime (`packages/self-modification/`, `pnpm run demo:cordis`).