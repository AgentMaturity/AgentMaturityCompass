# P0-47 read-only qualification preflight — 14 October 2026

This is queue preparation, not qualification. No builds, tests, source mutations, PRs or publication were performed. The inspected source is accepted main `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c` in `/Users/sid/.codex/worktrees/p0-29-qualification/AgentMaturityCompass`.

Authority: [merged PR #38](https://github.com/AgentMaturity/AgentMaturityCompass/pull/38) at `a54e4ec84f6f4350909ec2294b59fec176ec9172`, and D-15 lines 5–49 in `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs/decisions.md` (full-file SHA256 `f4a23e966d0f949dd0d418a0896b0797aeedacafbd21dd9d1242d32467c04c00`). A dedicated P0-47 spec was not found.

## Existing implementation and preserved baseline

The existing script is `scripts/snapshot-plan-edit.mjs`; the helper is `tests/helpers/landedSource.ts`; regression coverage is `tests/planEditsManifest.test.ts`; the manifest and instructions are `unused-code/plan-edits/manifest.json` and `README.md`. The manifest has 55 snapshots across 29 issues. All 99 recorded tracked source/archive files are currently byte-equal to accepted main. All 55 archive hashes and base ancestries match in this read-only inspection; non-dist archives also equal their recorded base blobs. This is static evidence, not executed test evidence.

The original P0-47 meta-freeze preserves `tests/privateModuleHelperVisibility.test.ts` from base `51f425bf33ae5ce35b4328b33d17be26af44dad2`, archive `unused-code/plan-edits/P0-47/tests/privateModuleHelperVisibility.test.ts.landed`, SHA256 `100d9d4cac5105f958d03deb6b460a2598b1a9feee386e1302575c047581e2c5`. The exact original routed parity corpus is 19 files; the current unused-code-linked parity/helper manifest corpus is 26 test files. Their names and full hashes are in the JSON.

Approved commits `80abdaf02` and `742330c5` supersede the old package.json refusal. They permit and test package snapshots while retaining the package-entry pin. Current package.json is registered by P0-09. Do not restore the refusal mentioned in the historical PR body.

| Probe source | Existing owner | Historical red failures | Compiled pin that the script auto-snapshots |
|---|---|---:|---|
| `src/types.ts` | P0-44 | 3 | `none for its own outputs` |
| `src/index.ts` | P0-08 | 3 | `dist/index.d.ts` |
| `src/sdk/nativeAgentClient.ts` | P0-06 | 3 | `dist/sdk/nativeAgentClient.d.ts` |
| `src/workspace.ts` | P1-25 | 2 | `none for its own outputs` |

Every source probe adds `export const p47Probe = 1;` and rebuilds dist. Existing main registrations must remain unchanged. On current main, a new P0-99 registration correctly refuses and freeze comparisons already read snapshots. Therefore reproduce red-before/pass-after in separate disposable historical fixtures at `b552b69cd220d7d73b63a58685f77bb2bbb26c8f`, overlaying current approved tooling. Historical fixture results must be labelled separately from current-main qualification. No existing manifest removal or archive rewriting is required.

## Exact commands for the subsequent qualification

These commands have not been executed. Run current-main commands only in a fresh owned checkout; never in the preserved authoring tree or this active P0-29 checkout. Every historical fixture is also owned and disposable, with receipts retained.

### Current-main baseline, in a fresh owned checkout at acceptedMain; run Node 22 and Node 24 in separate owned checkouts

```bash
set -euo pipefail
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export GIT_NO_LAZY_FETCH=1
test "$(git rev-parse HEAD)" = 5ea5e866a42acd5c8228a712e9b8c1d9f18c745c
pnpm install --frozen-lockfile
mkdir -p tmp/p0-47
npm run build > tmp/p0-47/build.log 2>&1
npx --no-install vitest run tests/planEditsManifest.test.ts --reporter=default --reporter=json --outputFile.json=tmp/p0-47/helper-manifest.json > tmp/p0-47/helper-manifest.log 2>&1
npx --no-install vitest run $(git grep -l 'unused-code/' -- tests | rg '\.test\.ts$') --reporter=default --reporter=json --outputFile.json=tmp/p0-47/parity.json > tmp/p0-47/parity.log 2>&1
npm run typecheck > tmp/p0-47/typecheck.log 2>&1
npm run typecheck:tests > tmp/p0-47/typecheck-tests.log 2>&1
npm run lint > tmp/p0-47/lint.log 2>&1
npm run check:freeze > tmp/p0-47/freeze.log 2>&1
npm run check:clean-source > tmp/p0-47/clean-source.log 2>&1
npm run test:coverage -- --exclude 'tests/performance/**' --coverage.reportOnFailure --reporter=default --reporter=json --reporter=hanging-process --outputFile.json=tmp/p0-47/full-tests.json > tmp/p0-47/full-tests.log 2>&1
npx --no-install vitest run tests/performance --no-file-parallelism --reporter=default --reporter=json --outputFile.json=tmp/p0-47/performance.json > tmp/p0-47/performance.log 2>&1
npm run check:coverage > tmp/p0-47/per-file-coverage.log 2>&1
git status --porcelain=v1 --untracked-files=all > tmp/p0-47/after-tests.txt
test ! -s tmp/p0-47/after-tests.txt
```

For Node 24 use /opt/homebrew/opt/node@24/bin in a separate owned checkout with a fresh frozen install. Every check must retain its actual exit code. Do not describe full test success from passed case counts alone: JSON success must be true, failures/pending/todo must be zero, and global and per-file coverage must pass.

### Four real source/declaration probes on the historical unregistered baseline, with current approved tooling

```bash
set -euo pipefail
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export GIT_NO_LAZY_FETCH=1
p47_repo=/Users/sid/.codex/worktrees/p0-29-qualification/AgentMaturityCompass
p47_main=5ea5e866a42acd5c8228a712e9b8c1d9f18c745c
p47_base=b552b69cd220d7d73b63a58685f77bb2bbb26c8f
p47_runroot=$(mktemp -d /private/tmp/amc-p0-47-probes-20261014.XXXXXX)
for p47_source in src/types.ts src/index.ts src/sdk/nativeAgentClient.ts src/workspace.ts; do
  p47_slug=$(printf '%s' "$p47_source" | tr '/.' '--')
  p47_fixture="$p47_runroot/$p47_slug"
  git -C "$p47_repo" worktree add --detach "$p47_fixture" "$p47_base"
  for p47_tool in scripts/snapshot-plan-edit.mjs tests/helpers/landedSource.ts tests/planEditsManifest.test.ts; do
    git -C "$p47_repo" show "$p47_main:$p47_tool" > "$p47_fixture/$p47_tool"
  done
  (
    cd "$p47_fixture"
    pnpm install --frozen-lockfile
    mkdir -p tmp/p0-47
    npm run build > tmp/p0-47/base-build.log 2>&1
    npx --no-install vitest run $(git grep -l 'unused-code/' -- tests | rg '\.test\.ts$') --reporter=default --reporter=json --outputFile.json=tmp/p0-47/baseline.json > tmp/p0-47/baseline.log 2>&1
    printf '\nexport const p47Probe = 1;\n' >> "$p47_source"
    npm run build > tmp/p0-47/red-build.log 2>&1
    set +e
    npx --no-install vitest run $(git grep -l 'unused-code/' -- tests | rg '\.test\.ts$') --reporter=default --reporter=json --outputFile.json=tmp/p0-47/red.json > tmp/p0-47/red.log 2>&1
    p47_red=$?
    set -e
    test "$p47_red" -ne 0
    printf '%s\n' "$p47_red" > tmp/p0-47/red.exit
    # Only this disposable fixture's one probe source is restored. No main archive or manifest is touched.
    git restore --source "$p47_base" -- "$p47_source"
    npm run build > tmp/p0-47/restored-base-build.log 2>&1
    node scripts/snapshot-plan-edit.mjs --issue P0-99 --base "$p47_base" "$p47_source" > tmp/p0-47/snapshot.log 2>&1
    printf '\nexport const p47Probe = 1;\n' >> "$p47_source"
    npm run build > tmp/p0-47/green-build.log 2>&1
    npx --no-install vitest run $(git grep -l 'unused-code/' -- tests | rg '\.test\.ts$') --reporter=default --reporter=json --outputFile.json=tmp/p0-47/green.json > tmp/p0-47/green.log 2>&1
    git restore --source "$p47_base" -- "$p47_source"
    npm run build > tmp/p0-47/final-base-build.log 2>&1
  )
done
printf '%s\n' "$p47_runroot"
```

The current script/helper/test copies are measured tooling overlay, not a current-main suite claim. Retain all four fixtures and receipts for review. Confirm each red report fails the source/declaration freeze assertions relevant to that probe and each green report is success=true with zero failed/pending/todo. Historical expected failures were 3,3,3,2; report fresh outcomes exactly. No existing registration is removed or rewritten.

### Actual live-read helper mutation, current-main owned checkout only

```bash
set -euo pipefail
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
p47_helper=tests/helpers/landedSource.ts
p47_backup=$(mktemp /private/tmp/amc-p0-47-landedSource.XXXXXX)
cp "$p47_helper" "$p47_backup"
trap 'cp "$p47_backup" "$p47_helper"' EXIT
python3 - <<'MUTATION'
from pathlib import Path
p=Path('tests/helpers/landedSource.ts')
s=p.read_text()
needle='if (!edit) return readFileSync(resolve(root, key));'
assert s.count(needle)==1
p.write_text(s.replace(needle,'if (true) return readFileSync(resolve(root, key));'))
MUTATION
set +e
npx --no-install vitest run tests/planEditsManifest.test.ts --reporter=default --reporter=json --outputFile.json=tmp/p0-47/live-read-helper-mutant.json > tmp/p0-47/live-read-helper-mutant.log 2>&1
p47_helper_red=$?
npx --no-install vitest run $(git grep -l 'unused-code/' -- tests | rg '\.test\.ts$') --reporter=default --reporter=json --outputFile.json=tmp/p0-47/live-read-parity-mutant.json > tmp/p0-47/live-read-parity-mutant.log 2>&1
p47_parity_red=$?
set -e
cp "$p47_backup" "$p47_helper"
cmp "$p47_backup" "$p47_helper"
test "$p47_helper_red" -ne 0
test "$p47_parity_red" -ne 0
trap - EXIT
```

Inspect actual archive-vs-live failures, not process exit alone. No fs mock is involved. Repeat current-main passing checks after byte restoration.

### Actual omitted-SHA helper mutation, current-main owned checkout only

```bash
set -euo pipefail
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
p47_helper=tests/helpers/landedSource.ts
p47_backup=$(mktemp /private/tmp/amc-p0-47-landedSource.XXXXXX)
cp "$p47_helper" "$p47_backup"
trap 'cp "$p47_backup" "$p47_helper"' EXIT
python3 - <<'MUTATION'
from pathlib import Path
p=Path('tests/helpers/landedSource.ts')
s=p.read_text()
needle='    if (sha256(bytes) !== edit.sha256) throw new Error("Plan-edit snapshot changed: " + edit.archivePath);\n'
assert s.count(needle)==1
p.write_text(s.replace(needle,'    // Qualification mutant: archive hash guard omitted.\n'))
MUTATION
set +e
npx --no-install vitest run tests/planEditsManifest.test.ts --testNamePattern 'throws when an archive no longer matches its manifest sha256' --reporter=default --reporter=json --outputFile.json=tmp/p0-47/omitted-sha-mutant.json > tmp/p0-47/omitted-sha-mutant.log 2>&1
p47_sha_red=$?
set -e
cp "$p47_backup" "$p47_helper"
cmp "$p47_backup" "$p47_helper"
test "$p47_sha_red" -ne 0
trap - EXIT
```

The selected tampered-archive assertion must fail because no error is thrown. Restore exact helper bytes, rerun helper/manifest positive checks, and verify all recorded source/archive hashes. No manifest entry is deleted or reassigned.

## Acceptance integrity and missing evidence

Archive reads and behavioral imports/transpilation remain direct live/archived reads. The merged diff changes freeze-comparison reads to landedBytes/landedText and introduces no node:fs mock. Existing assertion inputs and expected values must be preserved. The live-read and omitted-SHA mutations must be actual disk mutations in the owned checkout, fail the real checks, and be restored byte-for-byte before final positive qualification.

- No dedicated specs/P0-47.md exists in the recovered specs inventory; merged PR #38 plus D-15 decisions are the recovered authority.
- PR #38 names four probes, their one-line edit and historical failure counts (3,3,3,2), but no committed executable real-probe runner or retained per-probe raw logs/JSON receipts were found. These historical counts are not fresh evidence.
- The linked Claude artifact has not been read directly; the locally recovered D-15 text records option A and references PR #38.
- There is no approved instruction to delete/reassign existing snapshots on current main. Current-main red-before reproduction cannot be claimed by silently removing registered downstream archives.

Current-main full suite/typechecks/lint, global and per-file coverage, real four-probe red/green receipts, actual guard mutation receipts, and final clean-tree/hash-restoration evidence are all outstanding. The PR historical counts do not establish current readiness.

