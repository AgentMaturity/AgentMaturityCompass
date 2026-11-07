---
"agent-maturity-compass": minor
---

Native command hooks: `<workspace>/.amc/hooks.json` (Claude Code's file shape) runs operator commands on every platform for `PreToolUse` (deny-capable), `PostToolUse`, `UserPromptSubmit` (deny-capable) and `Stop`. A hook observes or denies, never allows, rewrites arguments or adds context (D55); `allow` is an abstention, `ask`, `updatedInput`, `additionalContext` and `continue:false` deny. The file runs only after `amc native-extension hooks trust --sha256 <digest>` accepted its exact bytes on this machine; an untrusted or changed file fails closed. Hooks are composed inside the toolset, so delegated children and ACP/SDK sessions carry the same guard.

freeze-exception: SH-EXT — `amc native-extension hooks inspect|trust|test` (3 command paths): the only way to review, accept and exercise a hooks file without running a turn.
