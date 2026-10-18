# P1-11 bounded evaluator qualification — 17 October 2026

The local source checkpoint is `a6909ac52ec7db1411696b82c4ef6c9cb61a89d2` on `codex/p1-11-evidence-qualification`. It adds one new typed evaluator test file and maintains 15 generated numeric spans across ten count surfaces. Existing production code, tests, authored prose, packages and guards are unchanged.

The fresh canonical cohort passes **88/88** in four files: 25 new evaluator tests and 63 existing compliance tests. The unchanged baseline passes 63/63. Test and production type checks, lint, build, published counts, gate reachability, threat model, architecture, docs drift and freeze checks pass. The clean-source helper separately passes frozen installation, build, doctor, and signed keyless one-turn and cross-process two-turn smoke checks; that helper runs no Vitest.

Four temporary source controls in the owned retained fresh clone produce the following actual results. Each is followed by an exact source restoration and a complete 88/88 run.

| Control | Passing | Failing | First sensitive assertion |
|---|---:|---:|---|
| Remove tenant comparison | 87 | 1 | Rejected-ref comparison at line 67, called from 124 |
| Skip recorded-time freshness refusal | 87 | 1 | Rejected-ref comparison at line 67, called from 147 |
| Let an attribute override derived tier | 87 | 1 | Admitted-tier comparison at line 266 |
| Drop replay refusal | 85 | 3 | Ref comparison at 67/168; duplicate admission at 177; foreign-decision ref at 67/183 |

All nine fresh/control runs retain the same 88 file/title identities, 29 passing hook entries and 29 passing hook values, with no unhandled or late errors. Later assertions in a failing body are masked. Source controls did not mutate compiled JavaScript or native binaries. Eight source/compiled pairs and 57 paths were bound between S and Q; 88 protected inputs and distinct native identities were preserved. Wrapper owned process groups closed naturally with ESRCH observations; this is not universal filesystem or descendant isolation.

These are already-derived unit inputs. They do not establish real cryptographic provenance, approval signatures, signed/compiled-plan integration or a positive public compliance report. The attribute-tier control is not the specification's raw metadata loader mutation. The process cwd remains borrowed R; the inherited source-literal census reads R/src, while evaluator imports and the remaining selected test modules resolve through the explicit S/Q roots.

Whole P1-11 remains open. `evidence/whole-issue-gaps.json` records public `plan:null`, the empty-score `null` versus requested zero, status spelling and applicability composition, real report/origin comparison, full suite/coverage, surface, docs/changeset and merged-PR gaps. Quality checks remain **RED** before and after: 1,268 duplicate and 2,724 dead-code findings, without waiver or baseline adoption. Numeric count maintenance does not satisfy semantic documentation acceptance.

Claude's source and variants, the missing shared reservation's last-known binding and pending private entry, all held decisions, the ignored D15 provider archive and F37 skip remain intact. Dependabot was excluded only from WIP; every PR's changed paths was checked for overlap. No PR, push, merge, release or tracker Done occurred. After this bounded receipt closes, P1-12 is next by plan priority and dependency depth.

Raw command logs and patches use the existing `amc-qualification-lossless-original/1` JSON envelope. Decode `dataBase64`, then check `original.bytes` and `original.sha256` to recover exact original bytes, including whitespace. The retained private producer originals were not changed. Compact reviews are included; oversized raw ownership observations remain private and are pinned by their sealed review. Post-assembly validation and ordinary Git checks are separate evidence.
