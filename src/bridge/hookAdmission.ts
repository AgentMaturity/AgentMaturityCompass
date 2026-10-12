/**
 * Admission at Claude Code's UserPromptSubmit (P1-23): before a prompt reaches the model, AMC checks that the agent's
 * Claude Code hook lease is valid (`hook:control`, unexpired, unrevoked), that the signed ToolHub config, Action Policy
 * and Approval Policy verify, and that no freeze is active. A failed check blocks the prompt with
 * `AMC admission denied: <reason>`. AMC never receives or stores the prompt text: AMC's forwarder sends only its
 * length and SHA-256, and those are what the signed admission row records. Admission is not a claim about tool calls.
 */
import { join } from "node:path";
import { z } from "zod";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { claudeSessionSha256 } from "../adapters/hookProviders/claudeCode.js";
import { verifyManagedLease } from "../adapters/managedHookLease.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { observationId, recordHookAudit, sessionRegistered, type HookObservationResult } from "./claudeCodeObservations.js";
import { HookControlError } from "./hookProviders.js";

export type HookAdmission = { readonly admitted: true } | { readonly admitted: false; readonly reason: string };

const SIGNED_POLICIES = [
  ["ToolHub config", verifyToolsConfigSignature],
  ["Action Policy", verifyActionPolicySignature],
  ["Approval Policy", verifyApprovalPolicySignature],
] as const;

/** Whether `agentId` may start a Claude Code turn in `workspace` at `now`. Any read or verification failure refuses. */
export function checkHookAdmission(workspace: string, agentId: string, now: number): HookAdmission {
  const deny = (reason: string): HookAdmission => ({ admitted: false, reason });
  try {
    const lease = verifyManagedLease({ workspace, tokenPath: join(workspace, ".amc", "hooks", "claude-code.lease"), expectedAgentId: agentId, mode: "control" });
    if (!lease.valid || !lease.payload) return deny(`the hook lease is not valid (${lease.error ?? "verification failed"})`);
    if (lease.payload.expiresTs <= now) return deny("the hook lease has expired");
    for (const [label, verify] of SIGNED_POLICIES) {
      if (!verify(workspace).valid) return deny(`the ${label} signature does not verify`);
    }
    const freeze = activeFreezeStatus(workspace, agentId);
    if (freeze.active) return deny(`a freeze is active (${freeze.incidentIds.join(", ")})`);
    return { admitted: true };
  } catch (error) {
    return deny(`admission could not be evaluated (${error instanceof Error ? error.message : String(error)})`);
  }
}

const promptSchema = z.strictObject({
  hook_event_name: z.literal("UserPromptSubmit"),
  session_id: z.string().min(1).max(256),
  prompt_id: z.string().min(1).max(256).optional(),
  prompt: z.strictObject({ sha256: z.string().regex(/^[a-f0-9]{64}$/), length: z.number().int().nonnegative() }),
});

/** The control route's UserPromptSubmit: admit or refuse, and record the decision with the prompt's length and digest only. */
export function admitClaudeCodePrompt(input: { workspace: string; authenticatedAgentId: string; rawInput: string; now?: number }):
  HookObservationResult & HookAdmission {
  let parsed: z.infer<typeof promptSchema>;
  try {
    parsed = promptSchema.parse(JSON.parse(input.rawInput));
  } catch {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, "Claude Code UserPromptSubmit does not match its schema");
  }
  const now = input.now ?? Date.now();
  // Admission is a decision, not an after-the-fact observation: it is never capped.
  const registered = sessionRegistered(input.workspace, input.authenticatedAgentId, parsed.session_id);
  const admission = checkHookAdmission(input.workspace, input.authenticatedAgentId, now);
  const sessionSha256 = claudeSessionSha256(parsed.session_id);
  // The prompt's digest and UTF-8 length are what AMC's forwarder reports from Claude Code's payload; the text never arrives.
  const record = { kind: "amc.claude-code-admission/v1", agentId: input.authenticatedAgentId, sessionSha256, admitted: admission.admitted,
    reason: admission.admitted ? null : admission.reason, promptTextStored: false,
    reported: { by: "claude-code", promptId: parsed.prompt_id ?? null, promptSha256: parsed.prompt.sha256, promptLength: parsed.prompt.length } };
  const recorded = recordHookAudit({ workspace: input.workspace, now, sessionSha256, id: observationId("ccadmit", [input.authenticatedAgentId, sessionSha256, parsed.prompt_id], now),
    meta: { admissionSchemaVersion: 1, ...record }, body: record, receipt: { kind: "guard_check", providerId: "hook-admission:claude-code" },
    underRegistration: registered });
  return { ...recorded, ...admission };
}
