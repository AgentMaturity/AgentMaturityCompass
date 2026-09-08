/**
 * The approval seam as a composed service (P3.3).
 *
 * `ctx.amcApproval` is the loop's human-in-the-loop. A consumer that declares
 * `inject: ["amcApproval"]` stays PENDING until a host has composed one, which
 * is the point: a tool pipeline that could not find an approval seam must not
 * quietly proceed as though everything were pre-approved. Absence has to be
 * visible, and PENDING is how a Cordis tree makes it visible.
 *
 * WHY THE SERVICE IS SESSION-SCOPED. The audit pair is written into ONE
 * session's spine, and a `SessionService` is that session's single writer. A
 * seam shared across sessions would be a second writer into somebody else's log.
 * Fan-out to several agents is fan-out to several sessions, which is P6.1's
 * problem, not a registry to pre-build here.
 *
 * WHAT DISPOSAL DOES, AND WHY IT IS SO LITTLE. Nothing. The seam holds no
 * resource of its own: the answerers belong to the plugins that registered them
 * (whose own effects remove them), the engine's state is signed files on disk,
 * and an in-flight question is bounded by the signed request's TTL. Adding a
 * disposer that abandoned pending questions would produce `unavailable` rows for
 * questions the engine may still legitimately settle — a fabricated verdict at
 * shutdown, which is worse than no disposer at all.
 *
 * This module lives under src/kernel/ because it imports workspace packages the
 * published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import { ApprovalSeam, type ApprovalSeamInit } from "../../approvals/seam/approvalSeam.js";
import type {
  ApprovalAnswerer,
  ApprovalAsk,
  ApprovalDecision
} from "../../approvals/seam/approvalSeamTypes.js";

export const APPROVAL_SEAM = defineSeam("amcApproval");

export type ApprovalServiceConfig = ApprovalSeamInit;

/**
 * The approval seam, on the tree.
 *
 * Delegation, not reimplementation. Every rule that matters — the audit pair's
 * ordering, the three-valued normalization, the answerer-only clamp, the
 * create-then-poll wait bounded by the signed TTL — has exactly one
 * implementation, in src/approvals/seam/, and this class must not acquire a
 * second one.
 */
export class ApprovalSeamService extends AmcSeam {
  private readonly seam: ApprovalSeam;

  constructor(ctx: Context, config: ApprovalServiceConfig) {
    super(ctx, APPROVAL_SEAM.name);
    this.seam = new ApprovalSeam(config);
  }

  /** Ask, and wait. Blocks until answered; `unavailable` fails closed. */
  request(ask: ApprovalAsk): Promise<ApprovalDecision> {
    return this.seam.request(ask);
  }

  /**
   * Register an answerer ahead of the engine, bound to the CALLING fiber.
   *
   * The unregister is wrapped in `ctx.effect`, so a plugin that supplied a UI
   * answerer and was then unloaded stops being consulted. Without that binding a
   * disposed plugin's answerer would keep claiming questions and answering them
   * from a scope that no longer exists.
   */
  use(answerer: ApprovalAnswerer): void {
    const remove = this.seam.use(answerer);
    this.ctx.effect(() => remove, `amcApproval answerer ${answerer.name}`);
  }

  /** The answerers ahead of the engine, in dispatch order. */
  get answererNames(): readonly string[] {
    return this.seam.answererNames;
  }
}

/**
 * Registers the approval seam.
 *
 * A single-service plugin rather than a group: it is complete on its own, and
 * the thing it needs (a session with an open turn) is something a host composes
 * first and hands in.
 */
export const approvalServices = {
  name: "amc-approval-services",
  apply(ctx: Context, config: ApprovalServiceConfig): void {
    ctx.plugin(ApprovalSeamService, config);
  }
};
