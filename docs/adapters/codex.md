# Codex: observe mode only

AMC does not control Codex tool calls. Codex 0.165.0 has a blocking PreToolUse hook, but the call runs when the hook
errors, times out, exits with a code other than 0 or 2, or has not been trusted. An AMC control hook there would look
like enforcement it cannot deliver. The review of the pinned contract is in `docs/source-reviews/P2-17-codex-hooks.md`
in the repository.

What AMC offers instead is **observation**: a Codex PostToolUse hook that reports each tool call Codex ran to AMC.

The shortest way to set it up is `amc` in the project folder, then "Watch Codex as it works" in the start menu: it runs `amc up` and the observe install below, after asking. By hand:

```sh
amc up
amc connect hooks install --provider codex --agent my-agent --mode observe --dry-run
amc connect hooks install --provider codex --agent my-agent --mode observe
amc connect hooks status --provider codex
amc connect hooks remove --provider codex
```

The install writes `.codex/hooks.json` with one PostToolUse command hook that runs AMC's forwarder. It also writes a

The install also adds one command hook for each session hook Codex documents (SessionStart, SessionEnd,
UserPromptSubmit, Stop, SubagentStart, SubagentStop, PreCompact, PostCompact, Interrupt; https://learn.chatgpt.com/docs/hooks,
read 2026-11-16), labelled "AMC records this session event". AMC records each as Codex's own report: prompts and
messages as SHA-256 and length only, never their text. A payload AMC cannot read is recorded as unreadable, so these
hooks are never refused. SessionEnd and Interrupt get 3 seconds, the most Codex allows them.
signed manifest and a dedicated observe lease under `.amc/hooks/`. It never edits a `.codex/hooks.json` it did not
write. Codex runs a project hook only after you trust the folder and the hook in Codex (start `codex` there, accept
the folder, then run `/hooks` and trust the hook labelled "AMC records this tool call"), so nothing is observed until
then. `amc connect hooks install`
and `status` print these steps. `amc login codex` runs Codex's own sign-in.

## What AMC claims

- **Observed:** for each report, the tool name, the tool call id and the SHA-256 of the session id, the tool input
  and the tool output, recorded with a signed receipt. The contents themselves are never stored.
- **Not covered:** any control of Codex calls; calls Codex does not report; sessions where Codex did not run the hook.
- **No qualified version:** the observe hook has not been run against the pinned Codex binary yet. The
  [support matrix](SUPPORT_MATRIX.md) shows the current state.

The forwarder always exits 0 and prints nothing, so it never changes what Codex does. A report AMC could not record is
written to the hook's stderr only.
