# Two RED empty-array cases held out of the root suite — 18 October 2026

Integration note, added on `rtd/codex-full-integration`; no other file in this receipt was changed.

`README.md` in this folder records Sid's direction for P0-22: "Leave this unresolved and continue after bounded qualification." Both literal empty-array assertions stay unresolved and unwaived: a successful `--json` result that is an empty array cannot carry `claimKind`, `statusDimensions` and `claimLabel`, and the corpus requires them.

The root suite cannot carry a failing or skipped test. In `tests/cliClaimLabels.e2e.test.ts` the two recipes still run their real command in strict mode (no exit 70, no Commander error, a successful parse), and carry `emptyArrayHeld` pointing at this file; only the strict claim-field check on their empty array is held here. A non-empty answer from either command is still checked in full.

- `amc passport search --capability p0-22-empty-capability --json` prints `[]`.
- `amc leaderboard show --json` prints `[]` for a workspace with no scored fleet agents.

The held assertion, as the corpus applies it to every other successful JSON result (`assertClaimFields`):

```ts
    // Deliberate literal acceptance: every successful registered JSON result needs claim fields.
    // [] cannot carry fields. Do not use vacuous every(), a skip or an exemption while its contract is pending.
    expect(value.length, `${path}: successful [] has no claim fields`).toBeGreaterThan(0);
```

To restore it: decide the JSON shape for an empty result (for example an object that carries the claim fields and the list), change both commands, and remove `emptyArrayHeld` from the two recipes.
