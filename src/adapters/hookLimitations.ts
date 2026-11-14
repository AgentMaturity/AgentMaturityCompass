/** What an installed provider hook does and does not cover, printed at install and reported by status (moved out of hookIntegration.ts). */
import type { HookMode } from "./hookProviders/installFiles.js";

export function limitations(provider: "claude-code" | "gemini-cli", mode: HookMode): string[] {
  if (provider === "claude-code" && mode === "control") {
    return [
      "enforced at Claude Code PreToolUse for mapped tools, in sessions registered under this installation, on qualified Claude Code versions only; other tools, MCP tools included, are denied",
      "UserPromptSubmit admits a prompt only with a valid lease, verified signed policies and no active freeze; AMC never receives the prompt text",
      "SessionStart, Stop, PostToolUse and PostToolUseFailure are observed; AMC never forces Claude Code to continue; control never asks (a Claude Code ask is not AMC approval)",
      "a session registration is a lease-holder attestation checked against disk, not proof that Claude Code ran a hook; sessions without one are not governed",
      "not covered: OS containment, what an allowed Bash command starts, anything once a hook is removed or disabled; .claude/settings.local.json is user-editable, so regulated deployments use managed settings",
    ];
  }
  return [
    mode === "control"
      ? "control is loopback-only; raw provider input is evaluated in memory and never retained"
      : "observation only; no provider control decision is returned",
    mode === "control"
      ? "provider-local ask is a control response, not proof that AMC approval quorum was met"
      : "tool arguments, cwd, transcript path, and raw session ID are not forwarded",
    provider === "gemini-cli"
      ? "Gemini CLI does not expose a general provider tool-call ID in the pinned contract, so action identity is derived"
      : "Claude Code tool_use_id is used when present; otherwise action identity is derived",
    "Codex is supported in observe mode only (amc connect hooks install --provider codex); Cursor, OpenCode, and other providers remain unsupported until their native contracts are pinned and fixture-tested"
  ];
}
