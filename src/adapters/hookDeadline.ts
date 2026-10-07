/**
 * Time limits for provider hook forwarding.
 *
 * Claude Code treats a hook that times out as a non-blocking error and runs the tool, so the
 * forwarder must reach a decision well inside the installed hook timeout. The budget is:
 * HOOK_FORWARD_DEADLINE_MS + forwarder cold start (p95) + 1,000 ms <= timeout.
 * Measured cold start of `node dist/cli.js connect hooks forward` (empty stdin, exit 2) on macOS
 * arm64, Node 25.5, 10 runs: p95 1,534 ms, so 5,000 + 1,534 + 1,000 = 7,534 ms fits the 10 s
 * timeout and leaves the Bridge 5 s. Linux was not measured for this budget. The budget does not
 * rest on that number alone: forwardDeadlineMs() subtracts the start-up the process actually
 * spent, so a slower host gets a shorter Bridge budget instead of overrunning the timeout.
 */
export const CLAUDE_HOOK_TIMEOUT_SECONDS = 10;
export const HOOK_FORWARD_DEADLINE_MS = 5_000;
const HOOK_TIMEOUT_MARGIN_MS = 1_000;

/**
 * The forwarder deadline left once start-up is paid: at most HOOK_FORWARD_DEADLINE_MS, and never
 * past `timeoutMs` minus the margin, measured from process start. Both providers install a 10 s timeout.
 */
export function forwardDeadlineMs(
  timeoutMs = CLAUDE_HOOK_TIMEOUT_SECONDS * 1000,
  startedMs = process.uptime() * 1000,
): number {
  return Math.max(0, Math.min(HOOK_FORWARD_DEADLINE_MS, Math.floor(timeoutMs - HOOK_TIMEOUT_MARGIN_MS - startedMs)));
}

export class HookDeadlineError extends Error {
  constructor(deadlineMs: number) {
    super(`provider hook forwarding exceeded its ${deadlineMs} ms deadline`);
    this.name = "HookDeadlineError";
  }
}

/**
 * Runs `work` with one AbortSignal that fires at the deadline. The returned promise rejects with
 * HookDeadlineError at the deadline even if `work` ignores the signal.
 */
export async function withHookDeadline<T>(
  deadlineMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new HookDeadlineError(deadlineMs);
      controller.abort(error);
      reject(error);
    }, deadlineMs);
  });
  try {
    return await Promise.race([work(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** A fetch signal bounded by both the per-request timeout and the caller's deadline. */
export function boundedFetchSignal(timeoutMs: number, deadline?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return deadline ? AbortSignal.any([timeout, deadline]) : timeout;
}
