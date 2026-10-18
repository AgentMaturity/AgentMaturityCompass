# P0-47 repaired Node24 qualification — 14 October 2026

Source: `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1` in `/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass`. Node `v24.21.0`, pnpm `10.33.0`, scoped PATH and `GIT_NO_LAZY_FETCH=1`. The compiled output remains the accepted-main build because candidate commits only change tests, metadata and archives.

| Check | Exit | Seconds | Passed / failed / pending / todo |
|---|---:|---:|---|
| repaired-linked-parity | 0 | 97.581 | 7118 / 0 / 0 / 0 |
| repaired-typecheck-tests | 0 | 32.127 | not applicable |
| repaired-freeze | 0 | 1.335 | not applicable |

The exact 26-file linked corpus and helper/manifest cases are recorded in the JSON. Actual default logs and Vitest JSON are retained under `/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass/tmp/p0-47-node24-qualification-20261014` with distinct `repaired-` names.

Earlier `0fef1989` Node24 baseline failure reports/logs are preserved byte-for-byte: `True`. Freeze script and baseline unchanged: `True`. Final HEAD: `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1`. Final status: `clean`.

No full suite, coverage, mutations, cleanup, commits or publication were performed. Other fixtures and Claude work were untouched.

## Freeze output

```text
> agent-maturity-compass@1.2.0 check:freeze /Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass
> node scripts/check-freeze.mjs

Freeze guard passed: {"cliCommandPaths":1236,"cliInventoryPaths":1236,"stationPacks":41,"stationPackQuestions":632}
```
