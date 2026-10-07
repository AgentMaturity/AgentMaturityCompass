/**
 * Time limits for provider hook forwarding.
 *
 * Claude Code treats a hook that times out as a non-blocking error and runs the tool, so the
 * forwarder must reach a decision well inside the installed hook timeout. The budget is:
 * HOOK_FORWARD_DEADLINE_MS + forwarder cold start (p95) + 1,000 ms <= timeout.
 * Measured cold start of `node dist/cli.js connect hooks forward` (empty stdin, exit 2) on macOS
 * arm64, Node 25.5, 10 runs: p95 1,534 ms, so 5,000 + 1,534 + 1,000 = 7,534 ms fits the 10 s
 * timeout and leaves the Bridge 5 s. Linux was not measured for this budget.
 */
export const CLAUDE_HOOK_TIMEOUT_SECONDS = 10;
export const HOOK_FORWARD_DEADLINE_MS = 5_000;

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
