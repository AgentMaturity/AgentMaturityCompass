---
"agent-maturity-compass": minor
---

Native command hooks: `<workspace>/.amc/hooks.json` (Claude Code's file shape) runs operator commands on every platform for `PreToolUse` (deny-capable), `PostToolUse`, `UserPromptSubmit` (deny-capable) and `Stop`. A hook observes or denies, never allows, rewrites arguments or adds context (D55); `allow` is an abstention, `ask`, `updatedInput`, `additionalContext` and `continue:false` deny. The file runs only after `amc native-extension hooks trust --sha256 <value>` accepted its trust value (its digest bound to every file under `.amc/hooks/`) on this machine; an untrusted, changed or missing-after-trust file fails closed, and `hooks untrust` retires the acceptance. Hooks are composed inside the toolset, so in-process delegated children and ACP/SDK sessions carry the same guard, and `UserPromptSubmit` runs before a prompt is queued on `agent-loop run`, chat and shared ACP/SDK/Studio sessions; foreign delegation (`--delegate-provider claude-cli`) is refused while a hooks file is present, because a foreign child does not run it.

freeze-exception: SH-EXT — `amc native-extension hooks`, `hooks inspect`, `hooks trust`, `hooks untrust`, `hooks test` (5 command paths: the group and four subcommands): the only way to review, accept, retire and exercise a hooks file without running a turn.
