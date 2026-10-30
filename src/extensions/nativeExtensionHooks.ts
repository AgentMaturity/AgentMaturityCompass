import { z } from "zod";
import type { ToolExecution } from "../tools/toolTypes.js";
import type { NativeExecutableRunner } from "../plugins/nativeExecutableRunner.js";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { nativeExecutableExtensionError } from "./nativeExecutableExtension.js";
import { nativeExtensionHookEventSchema, type NativeExtensionHookEvent, type NativeExtensionHookKind } from "./nativeExtensionHookSchema.js";

export interface NativeExtensionHookFailure {
  readonly extensionId: string;
  readonly manifestDigest: string;
  readonly kind: NativeExtensionHookKind;
  readonly code: string;
}
const decision = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("deny"), reason: z.string().trim().min(1).max(256) }).strict(),
  z.object({ decision: z.enum(["allow", "abstain"]) }).strict()
]);
const identity = (runner: NativeExecutableRunner): string => `${runner.id} sha256 ${runner.manifestDigest}`;
const safeText = (text: string): string => redactSecrets(text, () => "<AMC_REDACTED>").redacted.replace(/[\x00-\x1f\x7f]/g, " ");

/** Only metadata crosses the process boundary. No caller object, tool data or control handle is shared. */
function view(event: NativeExtensionHookEvent): NativeExtensionHookEvent {
  return Object.freeze(nativeExtensionHookEventSchema.parse({ kind: event.kind,
    ...(event.turn === undefined ? {} : { turn: event.turn }), ...(event.step === undefined ? {} : { step: event.step }),
    ...(event.toolName === undefined ? {} : { toolName: safeText(event.toolName) }),
    ...(event.actionClass === undefined ? {} : { actionClass: event.actionClass }),
    ...(event.requestedMode === undefined ? {} : { requestedMode: event.requestedMode }) }));
}

/** One load's bounded, isolated notifications and monotonic pre-tool decisions. */
export class NativeExtensionHooks {
  private readonly failures: NativeExtensionHookFailure[] = [];
  private readonly prepared = new WeakMap<ToolExecution, { readonly runners: readonly NativeExecutableRunner[]; readonly reason: string | undefined }>();
  constructor(private readonly runners: () => readonly NativeExecutableRunner[]) {}
  get active(): boolean { return this.runners().some(runner => runner.hookNames().length > 0); }
  reports(): readonly NativeExtensionHookFailure[] { return this.failures.map(report => ({ ...report })); }

  private report(runner: NativeExecutableRunner, kind: NativeExtensionHookKind, error: unknown): NativeExtensionHookFailure {
    const report = Object.freeze({ extensionId: runner.id, manifestDigest: runner.manifestDigest, kind,
      code: nativeExecutableExtensionError(error).code });
    this.failures.push(report);
    if (this.failures.length > 128) this.failures.shift();
    return report;
  }

  async observe(event: NativeExtensionHookEvent, signal?: AbortSignal): Promise<readonly NativeExtensionHookFailure[]> {
    if (event.kind === "pre-tool") return [];
    const reports: NativeExtensionHookFailure[] = [];
    for (const runner of this.runners().filter(candidate => candidate.hookNames().includes(event.kind))) {
      try { await runner.invoke("hook", event.kind, view(event), signal); }
      catch (error) { reports.push(this.report(runner, event.kind, error)); }
    }
    return reports;
  }

  /** Awaited after approvals in every pipeline path, including journaled and Code Mode sub-calls. */
  readonly prepare = async (execution: ToolExecution): Promise<void> => {
    const runners = this.runners().filter(runner => runner.hookNames().includes("pre-tool"));
    let reason: string | undefined;
    for (const runner of runners) {
      try {
        const output = await runner.invoke("hook", "pre-tool", view({ kind: "pre-tool", toolName: execution.name,
          actionClass: execution.actionClass, requestedMode: execution.requestedMode }), execution.signal);
        const parsed = decision.safeParse(JSON.parse(output));
        if (!parsed.success) throw new Error("invalid deny-only hook response");
        if (parsed.data.decision === "deny") { reason = `${identity(runner)}: ${safeText(parsed.data.reason)}`; break; }
      } catch (error) {
        const report = this.report(runner, "pre-tool", error);
        reason = `${identity(runner)}: pre-tool hook unavailable (${report.code})`; break;
      }
    }
    this.prepared.set(execution, { runners, reason });
  };

  /** Synchronous guard: no await separates current policy/authority rechecks from the tool effect. */
  readonly guard = (execution: ToolExecution): string | undefined => {
    const current = this.runners().filter(runner => runner.hookNames().includes("pre-tool"));
    const prepared = this.prepared.get(execution);
    if (!prepared) return current[0] ? `${identity(current[0])}: pre-tool hook was not evaluated` : undefined;
    if (prepared.reason !== undefined) return prepared.reason;
    const changed = [...prepared.runners, ...current].find(runner => !prepared.runners.includes(runner) || !current.includes(runner));
    if (changed) return `${identity(changed)}: pre-tool hook load changed during the call`;
    for (const runner of current) {
      try { runner.assertCurrent(); }
      catch (error) {
        const report = this.report(runner, "pre-tool", error);
        return `${identity(runner)}: pre-tool hook unavailable (${report.code})`;
      }
    }
    return undefined;
  };
}
