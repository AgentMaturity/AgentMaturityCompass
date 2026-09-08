import { z } from "zod";
import { lstatSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { EvidenceEvent } from "../types.js";
import { readEventPayload } from "../session/eventPayload.js";
import { sha256Hex } from "../utils/hash.js";
import { redactSdkText } from "../sdk/amcEvidence.js";
import { loadNativeValidationConfiguration, selectNativeValidationChecks } from "../setup/nativeValidationConfig.js";
import type { NativeValidationResult } from "../agent/nativeValidation.js";
import { NativeTaskServiceError, type NativeTaskValidationConfiguration, type NativeTaskValidationSelection, type NativeTaskValidationOutput } from "./nativeTaskTypes.js";

export const nativeTaskValidationSelectionSchema = z.object({
  configSha256: z.string().regex(/^[a-f0-9]{64}$/),
  checkIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)).min(1).max(8)
}).strict().refine(value => new Set(value.checkIds).size === value.checkIds.length, "Select distinct checks.");

/** Operator file only. Public inspection never returns commands, file paths or output. */
export function inspectNativeTaskValidation(path: string | undefined, demo: boolean): NativeTaskValidationConfiguration {
  if (demo) return { ready: false, configSha256: null, checks: [], message: "Sign in to select public validation checks. Demo tasks cannot execute checks." };
  if (!path) return { ready: false, configSha256: null, checks: [], message: "No public checks are configured by the Studio operator. Validation will be not requested." };
  try {
    const loaded = loadNativeValidationConfiguration(path);
    return { ready: true, configSha256: loaded.sha256, checks: loaded.config.checks.map(({ id, title }) => ({ id, title })),
      message: "Select optional public checks. They run after a completed turn using signed bash policy, budgets and approvals; passing checks do not prove general correctness." };
  } catch {
    return { ready: false, configSha256: null, checks: [], message: "The operator's public-check configuration is unavailable. No check commands were exposed or executed." };
  }
}

/** Checked before admission, every follow-up and process resume; core also verifies the exact file bytes. */
export function assertNativeTaskValidationPin(path: string | undefined, selection: NativeTaskValidationSelection | undefined): void {
  if (!selection) return;
  if (!path) throw new NativeTaskServiceError("VALIDATION_CHANGED", 409, "The task's public-check configuration is no longer available. Review setup and create a new task.");
  try { selectNativeValidationChecks(loadNativeValidationConfiguration(path, selection.configSha256), selection.checkIds); }
  catch { throw new NativeTaskServiceError("VALIDATION_CHANGED", 409, "The selected checks no longer match their pinned configuration. Review setup and create a new task; no replacement check was executed."); }
}

/** A missing/foreign signed result can never be presented as a passing selected check. */
export function nativeTaskValidationView(selection: NativeTaskValidationSelection | undefined, result: NativeValidationResult | undefined,
  waiting: boolean, interrupted: boolean): NativeValidationResult {
  if (!selection) return { status: "not-requested", turn: null, configSha256: null, checks: [] };
  const sameSelection = result?.configSha256 === selection.configSha256 && result.checks.length === selection.checkIds.length
    && result.checks.every((check, index) => check.id === selection.checkIds[index]);
  if (!waiting && !interrupted && sameSelection) return result!;
  const status = waiting ? "pending" : "unavailable";
  return { status, turn: null, configSha256: selection.configSha256,
    checks: selection.checkIds.map(id => ({ id, title: id, status, callId: null, exitCode: null, timedOut: false,
      reason: waiting ? null : "No matching authenticated result is available for this admission. Refresh signed evidence before making a claim.", outputEventId: null })) };
}

/** Called only after session authentication; payload bytes must separately match their signed digest. */
export function readNativeTaskValidationOutputs(workspace: string, rows: readonly EvidenceEvent[], result: NativeValidationResult): NativeTaskValidationOutput[] {
  return result.checks.flatMap(check => {
    if (!check.outputEventId) return [];
    const row = rows.find(row => row.id === check.outputEventId);
    if (!row) return [];
    const output: NativeTaskValidationOutput = { checkId: check.id, outputEventId: row.id, payloadSha256: row.payload_sha256,
      status: "unavailable", text: null, truncated: false, redacted: false, bytes: null };
    try {
      const meta = JSON.parse(row.meta_json);
      if (row.event_type !== "audit" || meta.kind !== "native-validation" || meta.phase !== "check-result"
        || meta.checkId !== check.id || meta.turn !== result.turn || meta.configSha256 !== result.configSha256) return [output];
      if (row.payload_pruned === 1) return [{ ...output, status: "pruned" as const }];
      const maxRead = 2 * 1024 * 1024;
      if (row.payload_inline != null) {
        if (Buffer.byteLength(row.payload_inline) > maxRead) return [output];
      } else if (row.payload_path ?? row.canonical_payload_path) {
        const path = resolve(workspace, (row.payload_path ?? row.canonical_payload_path)!);
        if (!path.startsWith(`${resolve(workspace)}${sep}`)) return [output];
        const info = lstatSync(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > maxRead) return [output];
      }
      const payload = readEventPayload(workspace, row);
      if (payload.status !== "ok" || payload.bytes.length > maxRead || sha256Hex(payload.bytes) !== row.payload_sha256) return [output];
      const original = new TextDecoder("utf-8", { fatal: true }).decode(payload.bytes), redacted = redactSdkText(original);
      // Redact before shortening so a credential crossing the display cutoff is still removed.
      const encoded = Buffer.from(redacted), maxDisplay = 16 * 1024;
      return [{ ...output, status: "available" as const, text: new TextDecoder("utf-8", { fatal: true }).decode(encoded.subarray(0, maxDisplay), { stream: encoded.length > maxDisplay }),
        truncated: encoded.length > maxDisplay, redacted: original !== redacted, bytes: payload.bytes.length }];
    } catch { return [output]; }
  });
}
