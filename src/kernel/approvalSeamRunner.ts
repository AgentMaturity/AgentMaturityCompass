/**
 * One approval, put through the COMPOSED tree (plan P3.3).
 *
 * WHY THIS MODULE EXISTS. Two reasons, and the second is the important one.
 *
 * First, mechanics: `amc approvals ask` has to reach `ctx.amcApproval`, and a
 * CLI module may not import the vendored Cordis packages — the architecture gate
 * forbids it, because those packages are not in the published npm tarball and a
 * CLI that imported one would throw ERR_MODULE_NOT_FOUND on a normal install. So
 * the composition lives here, under src/kernel/, and the CLI reaches it by a
 * relative dynamic import it is allowed to make and is prepared to find missing.
 * This mirrors agentLoopRunner.ts exactly.
 *
 * Second, and the reason it is not optional: without it the approval seam would
 * be a subsystem whose only callers were its own tests. P2.4 shipped one of
 * those — anchoring existed, verified, and nobody could invoke it — and the note
 * that followed said it plainly: a guarantee nobody can invoke is not a
 * guarantee. This gives an operator a real path to the seam, and it is the plan's
 * own verification clause made runnable: raise a question through the composed
 * tree, block on the real quorum-capable approvals engine while a human decides
 * in another terminal, and print the two signed audit rows it produced.
 *
 * THE SESSION IS OPENED, TURNED AND CLOSED HERE. The audit pair must sit inside
 * an open turn (see SessionService.recordApproval for why), so this opens one
 * around the question and closes it in a `finally`. An unsealed session with no
 * close is reported by the verifier as INTERRUPTED, which is the right verdict
 * for a process that died and the wrong one for a command that finished.
 */
import { Context } from "./amcRuntime.js";
import { createHash } from "node:crypto";
import { SessionService } from "../session/sessionService.js";
import { amcVersion } from "../version.js";
import type { ApprovalAsk, ApprovalDecision } from "../approvals/seam/approvalSeamTypes.js";
import { approvalServices, APPROVAL_SEAM } from "./services/approvalServices.js";
import type { ApprovalSeamService } from "./services/approvalServices.js";

export interface ComposedApprovalOptions {
  readonly workspace: string;
  readonly agentId: string;
  /** The question. `signal` is supplied by the caller so Ctrl-C can withdraw it. */
  readonly ask: ApprovalAsk;
  /**
   * Called once the approvals engine has raised the request.
   *
   * An operator cannot answer a question whose id they do not have, and the id
   * only exists after the engine has minted it — so it is pushed out here rather
   * than left for them to find by listing the inbox.
   */
  readonly onRaised?: (event: { readonly approvalId: string; readonly approvalRequestId: string }) => void;
}

export interface ComposedApprovalOutcome {
  readonly sessionId: string;
  readonly decision: ApprovalDecision;
}

/** Read a composed service off the tree by the name its seam declares. */
function serviceOn<T>(ctx: Context, name: string): T {
  const found = (ctx as unknown as Record<string, T | undefined>)[name];
  if (found === undefined) {
    throw new Error(`composition did not provide ${name}; the fiber booted but registered no service`);
  }
  return found;
}

/**
 * What this run was composed from, as a digest, for the `session/open` row.
 *
 * Commits to the plugin that decided the question and to the action class whose
 * signed policy rule governed it — the two facts that determine what could have
 * been granted.
 */
function compositionDigestOf(options: ComposedApprovalOptions): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        plugins: [approvalServices.name],
        actionClass: options.ask.actionClass,
        toolName: options.ask.toolName,
        version: amcVersion
      })
    )
    .digest("hex");
}

/**
 * Compose the seam, ask ONE question to completion, and tear the tree down.
 *
 * "To completion" means the answer is in hand and both audit rows are committed.
 * The turn is ended with the reason the answer earned: `complete` when somebody
 * decided (allow or deny are both decisions), `blocked` when nobody did — an
 * `unavailable` question is precisely a turn that could not proceed.
 */
export async function runComposedApproval(
  options: ComposedApprovalOptions
): Promise<ComposedApprovalOutcome> {
  const session = new SessionService(options.workspace);
  session.open({
    agentId: options.agentId,
    harnessVersion: amcVersion,
    compositionDigest: compositionDigestOf(options),
    policyDigest: createHash("sha256").update(options.ask.actionClass).digest("hex")
  });
  const sessionId = session.sessionId;
  const ctx = new Context();
  const fibers: { dispose(): Promise<void> }[] = [];
  let turnOpen = false;

  try {
    const approvalFiber = ctx.plugin(approvalServices, {
      session,
      workspace: options.workspace,
      agentId: options.agentId,
      ...(options.onRaised === undefined ? {} : { onRaised: options.onRaised })
    });
    await approvalFiber.await();
    fibers.push(approvalFiber);

    const approval = serviceOn<ApprovalSeamService>(ctx, APPROVAL_SEAM.name);
    session.startTurn({ trigger: "user" });
    turnOpen = true;
    session.startStep();

    const decision = await approval.request(options.ask);

    session.endStep({ stopReason: decision.answer, usage: null });
    session.endTurn({ reason: decision.proceed ? "complete" : "blocked" });
    session.sealTurn();
    turnOpen = false;
    return { sessionId, decision };
  } finally {
    for (const fiber of [...fibers].reverse()) {
      await fiber.dispose();
    }
    if (turnOpen) {
      // The question threw rather than settling. Close the turn as `error` so
      // the log records a turn that failed, not one that is still open — an open
      // turn is the shape a CRASH produces, and a tidy failure that forged a
      // crash would mislead the verifier.
      try {
        session.endTurn({ reason: "error" });
        session.sealTurn();
      } catch {
        // Nothing more can be written for this session; the verifier will report
        // it as interrupted, which is then the honest verdict.
      }
    }
    try {
      session.close({ reason: "completed" });
    } catch {
      // Swallowed HERE and only here: the caller's own error (or its outcome)
      // is the real result, and throwing from a finally would replace it.
    }
  }
}
