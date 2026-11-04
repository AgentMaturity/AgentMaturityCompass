# P0-48 Node24 foreign-runner qualification — 14 October 2026

QUALIFIED_SCOPED_FOREIGN_RUNNER at `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c` on Node `v24.21.0` / pnpm `10.33.0`.

- `build`: exit 0, 27.522 seconds; {}
- `normal-all-before`: exit 0, 26.964 seconds; {"path": "/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass/tmp/p0-48-node24-foreign-20261014T143551Z/normal-all-before.json", "sha256": "b3a4d130e3087710aa6c3a11fae2a485ab9e15fc5ee6f43b8f61de0305df3de0", "success": true, "numTotalTests": 12, "numPassedTests": 12, "numFailedTests": 0, "numPendingTests": 0, "numTodoTests": 0}
- `spy-removed-selected`: exit 0, 3.297 seconds; {"path": "/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass/tmp/p0-48-node24-foreign-20261014T143551Z/spy-removed-selected.json", "sha256": "5c753c093bd182bd0a822538bce42dff3ef469dc2272a5ec087f9318da619896", "success": true, "numTotalTests": 12, "numPassedTests": 1, "numFailedTests": 0, "numPendingTests": 11, "numTodoTests": 0}
- `restored-all-after`: exit 0, 26.53 seconds; {"path": "/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass/tmp/p0-48-node24-foreign-20261014T143551Z/restored-all-after.json", "sha256": "380e9b3de908ec0a0ff4e90041b7b04a3f5da21e6337cb60447c6af49357310d", "success": true, "numTotalTests": 12, "numPassedTests": 12, "numFailedTests": 0, "numPendingTests": 0, "numTodoTests": 0}

The actual stdout-spy removal keeps the recorded-output/refusal assertions and all5MiB input intact. Giant-line measurement: `{"rawLogBytes": 5243457, "maxLineBytes": 5242950, "longestLineXBytes": 5242880, "linesAtLeast1MiB": 1, "linesAtLeast4MiB": 1, "longestLineSha256": "ea7cfc125f39621709153c3603c93c2b31445460151c6e924bd77c9b34105976", "lineContentsNotEmitted": true}`. Its contents were redirected entirely into a file and never surfaced in tool output.

The selected probe filters11other cases as pending; it is not whole-file zero-pending qualification. Both ordinary whole-file runs require12passed/0failed/pending/todo.

Source unchanged: `True`; final Git status: `''`. Exact diff, commands, actual assertion statuses and source/log/report hashes are in the JSON.
