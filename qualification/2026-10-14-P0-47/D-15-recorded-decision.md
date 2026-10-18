## D-15 · Snapshot frozen files on edit before the first change

**Gate** G0 · **Epic** E01 Decisions needed from Sid · **Decide by** 2026-10-05 · **Route** Needs-Sid (owner: Sid) · **Tags** Decision

**Blocked by** none · **Blocks** P0-53 · **Old Linear issues** none · **Plan refs** P0-47 (PR #38 implements the rule); `scripts/snapshot-plan-edit.mjs`; `unused-code/plan-edits/README.md`; `tests/helpers/landedSource.ts`

Recorded on 5 Oct 2026 as option A. On `main` at `2a592a00`, `unused-code/plan-edits/manifest.json` holds 49 snapshots registered by 24 issues.

### Decision needed

How does a plan issue edit a file that a restoration parity test freezes byte for byte without breaking that proof?

### Why now and what it blocks

- The root patch that landed on `main` on 5 Oct 2026 added restoration parity tests. They compare live files byte for byte with archived originals under `unused-code/`, which freezes about 190 files.
- The frozen files include `src/types.ts`, `src/index.ts`, `src/sdk/nativeAgentClient.ts` and `src/workspace.ts`, so P0-06 and P0-08 could not land without a rule.
- **P0-47** builds the snapshot tooling. **P0-53** registers the A4 keys, which must match the tool's issue-key pattern `^P[0-3]-[0-9]{2}$`.

### Options

| Option | What it means | Cost | Risk | Reversibility |
|---|---|---|---|---|
| A. Snapshot on edit (recorded) | Before an issue edits a frozen file, `node scripts/snapshot-plan-edit.mjs --issue <KEY> --base <base-commit> <path>...` archives the file's bytes at the base commit to `unused-code/plan-edits/<KEY>/<path>.landed` and registers them in `unused-code/plan-edits/manifest.json`. Freeze comparisons read that copy through `tests/helpers/landedSource.ts`; behaviour checks keep loading live code. | One command and one committed manifest row per frozen file | Low: an edit without a snapshot still fails the parity suite | Remove the manifest rows and their archives |

No other option was recorded.

### Recommendation

Option A, which Sid recorded. The historical proof stays intact, and every later edit of a frozen file is listed by issue key.

### Inputs and who to consult

- `unused-code/plan-edits/README.md`: how to tell whether a file is frozen (edit it, then run `npx vitest run $(git grep -l 'unused-code/' -- tests)`), the manifest fields and the rules for `dist/` outputs.
- No outside consultation is needed.

### How to record it

1. Already recorded on 5 Oct 2026; nothing more to record.
2. Each issue that edits a frozen file runs the command once, before rebuilding `dist/`, with its key and the commit its branch started from.
3. It commits `manifest.json` and the new `.landed` archive with the edit. The first issue to edit a file archives it; the script refuses a path that is already registered.

### Acceptance criteria

- `unused-code/plan-edits/manifest.json` on `main` names `"decision": "D-15"` and lists each snapshot by path and issue.
- `tests/planEditsManifest.test.ts` validates the manifest and checks every archive against its `baseCommit`.
