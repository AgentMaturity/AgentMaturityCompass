import { assertScheduleOwner, readSchedules, scheduleStatus } from "./scheduleStore.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import type { ActionClass } from "../types.js";

export interface NativeScheduleAdmission {
  readonly workspace: string;
  readonly expectedSchedulesDigest: string;
  readonly expectedToolsDigest: string;
  readonly approvalClass: ActionClass;
}

/** Public execution needs explicit, unchanged signed policy; status never supplies authority. */
export function assertNativeScheduleAdmission(init: NativeScheduleAdmission): void {
  assertScheduleOwner(init.workspace);
  const read = readSchedules(init.workspace);
  if (!read.ok) throw new Error(read.reason);
  if (!/^[a-f0-9]{64}$/.test(init.expectedSchedulesDigest) || read.digest !== init.expectedSchedulesDigest) {
    throw new Error("Native schedules are absent or changed. Review native-schedule list and supply the exact signed --expect-digest before execution.");
  }
  const tools = loadVerifiedToolsConfigSnapshot(init.workspace);
  if (!/^[a-f0-9]{64}$/.test(init.expectedToolsDigest) || !tools.signatureValid || tools.config === null
    || tools.digestSha256 !== init.expectedToolsDigest) {
    throw new Error("Native schedule execution requires the unchanged signed tools policy. Review amc tools and supply its exact --expect-tools-digest; no policy was signed or widened.");
  }
  // The existing approval seam selects ONE class. Do not mislabel a different
  // class's scheduled tools as lower-risk merely to reuse that seam.
  for (const schedule of read.schedules.filter(item => item.enabled)) {
    if (schedule.scope === undefined || schedule.scope.length === 0
      || schedule.scope.some(actionClass => actionClass !== init.approvalClass)) {
      throw new Error(`Schedule ${schedule.id} must declare a signed scope containing only the explicitly selected approval class ${init.approvalClass}. Use separate reviewed owners/configurations for different classes.`);
    }
  }
  scheduleStatus(init.workspace, Date.now()); // Corrupt operational state refuses before composition.
}

export interface NativeScheduleService {
  /** Settles only after the timer and actual active pass have released ownership. */
  readonly closed: Promise<void>;
  stop(): Promise<void>;
}

/** Explicit foreground lifecycle. Construction is not an import-time daemon. */
export function startNativeScheduleService<T>(init: {
  readonly pollMs: number;
  readonly runPass: (signal: AbortSignal) => Promise<T>;
  readonly onResult: (result: T) => void | Promise<void>;
  readonly signal?: AbortSignal;
}): NativeScheduleService {
  if (!Number.isSafeInteger(init.pollMs) || init.pollMs < 1_000 || init.pollMs > 2_147_483_647) {
    throw new Error("--poll-ms must be an integer from 1000 through 2147483647.");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const cancel = () => {
    controller.abort();
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    wake?.();
  };
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) cancel();
  const closed = (async () => {
    try {
      while (!controller.signal.aborted) {
        const result = await init.runPass(controller.signal);
        await init.onResult(result);
        if (controller.signal.aborted) break;
        await new Promise<void>(resolve => {
          wake = resolve;
          timer = setTimeout(() => { timer = undefined; wake = undefined; resolve(); }, init.pollMs);
          if (controller.signal.aborted) cancel();
        });
        wake = undefined;
      }
    } finally {
      cancel();
      init.signal?.removeEventListener("abort", cancel);
      wake = undefined;
    }
  })();
  return { closed, stop: async () => { cancel(); await closed; } };
}
