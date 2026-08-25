/**
 * The ADR-5 rollback, built as an EXCEPTION rather than as a default (P3.3).
 *
 * ADR-5 says AMC ships governed by default and that a dev/demo profile may flip
 * a default the other way — but "only via composition and only recorded as an
 * explicit ADR-5 exception note; a rollback state never silently becomes the
 * shipped default". This module is that sentence made executable. It is an
 * answerer, so it sits ahead of the approvals engine and can grant a question
 * without a human; everything else here exists to make sure nobody can get one
 * by accident.
 *
 * FIVE RULES, AND EACH ONE CLOSES A WAY THIS COULD BECOME A SILENT DEFAULT.
 *
 *   1. IT CANNOT BE CONSTRUCTED EMPTY. A tracked id, a reason, a named person
 *      who accepted the risk, an expiry, and the action classes it covers are
 *      ALL required and all validated. An exception nobody can attribute is not
 *      an exception, it is a hole.
 *   2. IT EXPIRES, AND THE WINDOW IS BOUNDED. An expiry further out than
 *      {@link MAX_EXCEPTION_WINDOW_MS} is refused at construction. An exception
 *      that outlives the release that introduced it is a default with extra
 *      paperwork.
 *   3. AFTER EXPIRY IT ABSTAINS — it does not deny. Abstention returns the
 *      question to the real approvals engine, which is where it belonged all
 *      along. Denying would be this answerer overruling a genuine quorum in the
 *      other direction, which is its own bug.
 *   4. IT COVERS ONLY THE ACTION CLASSES IT NAMES. Anything else falls through
 *      to the engine. There is no wildcard, deliberately: enumerating what you
 *      are turning off is the difference between an exception and a switch.
 *   5. EVERY GRANT IT MAKES IS IN THE SIGNED LOG, WITH THE NOTE INSIDE IT. The
 *      seam records `answeredBy: "answerer:<name>"` on the `approval/answer`
 *      row, so the name IS the audit channel and the note is rendered into it —
 *      see {@link exceptionAnswererName}. An auditor reading the session sees
 *      which exception granted the call, who signed it off and when it lapses,
 *      without needing the composition that ran.
 *
 * WHY THE NOTE IS CARRIED IN THE NAME AND NOT IN A FIELD OF ITS OWN. Because
 * adding one would mean a new session event type, and the spine's 24 types are
 * load-bearing for the verifier, the projections and the recovery rules. The
 * name is the field that already reaches the signed bytes; using it costs
 * nothing and changes nothing. If a later phase gives `approval/answer` a
 * structured policy-exception field, this should move into it.
 */
import { z } from "zod";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import type { ActionClass } from "../../types.js";
import type { AnsweredQuestion, ApprovalAnswer, ApprovalAnswerer } from "./approvalSeamTypes.js";

/**
 * The longest an exception may run: 30 days.
 *
 * Long enough for a demo, a spike or a customer trial; short enough that
 * renewing it is a decision somebody has to make again, in front of whoever
 * reviews the change.
 */
export const MAX_EXCEPTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const actionClassSchema = z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]);

/** A non-empty, non-blank human field. Blank strings are the commonest way to fake a note. */
const statedText = (what: string): z.ZodString =>
  z.string().trim().min(1, `the exception note must state ${what}`);

export const approvalExceptionNoteSchema = z.object({
  /** The tracked identifier: an ADR entry, an issue, a change record. */
  exceptionId: statedText("an exceptionId that the exception is tracked under"),
  /** Why this deployment is running without human approval. */
  reason: statedText("a reason"),
  /** The person who accepted the risk. A team name is not a person. */
  approvedBy: statedText("who approved it (approvedBy)"),
  /** When it lapses, as an ISO 8601 instant. */
  expiresAt: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), "expiresAt must be an ISO 8601 instant"),
  /** Exactly which action classes are auto-allowed. No wildcard. */
  actionClasses: z
    .array(actionClassSchema)
    .min(1, "the exception note must name at least one actionClass; there is no wildcard")
});

export type ApprovalExceptionNote = z.infer<typeof approvalExceptionNoteSchema>;

/**
 * Parse an exception note from whatever an operator supplied.
 *
 * @param raw - parsed JSON from an exception-note file, or an object.
 * @returns the validated note.
 * @throws Error naming every field that is missing or unusable. The message is
 * the whole user interface of this feature: somebody is turning a guardrail off,
 * and "invalid input" would tell them nothing about what the harness needs to
 * know before it lets them.
 */
export function parseApprovalExceptionNote(raw: unknown): ApprovalExceptionNote {
  const parsed = approvalExceptionNoteSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`this is not a usable ADR-5 approval exception note — ${problems}`);
  }
  return parsed.data;
}

/**
 * The answerer name, which is what the signed `approval/answer` row records.
 *
 * Everything an auditor needs to chase the exception is in here, in a shape that
 * stays greppable: the marker, the tracked id, who signed it off, and when it
 * lapses.
 */
export function exceptionAnswererName(note: ApprovalExceptionNote): string {
  return (
    `adr5-exception:${note.exceptionId} ` +
    `(approved by ${note.approvedBy}, expires ${new Date(Date.parse(note.expiresAt)).toISOString()}, ` +
    `classes ${[...note.actionClasses].sort().join("+")})`
  );
}

/** The banner a composition prints. Loud on purpose; an exception nobody sees is a default. */
export function describeApprovalException(note: ApprovalExceptionNote): string {
  return (
    `ADR-5 APPROVAL EXCEPTION ACTIVE — ${note.exceptionId}\n` +
    `  auto-allowing: ${[...note.actionClasses].sort().join(", ")}\n` +
    `  approved by:   ${note.approvedBy}\n` +
    `  expires:       ${new Date(Date.parse(note.expiresAt)).toISOString()}\n` +
    `  reason:        ${note.reason}\n` +
    "  Every call it grants is recorded in the signed session log under this id."
  );
}

export interface ApprovalExceptionOptions {
  /** Injected so a test can pin expiry. Production leaves it out. */
  readonly now?: () => number;
  /**
   * Called the first time a question arrives after the exception lapsed.
   *
   * The lapse is the interesting moment for an operator: from then on their
   * unattended run starts blocking on real approvals, and a silent transition
   * would look like a hang.
   */
  readonly onLapsed?: (note: ApprovalExceptionNote) => void;
}

/**
 * Build the answerer for one tracked exception.
 *
 * @param note - the tracked ADR-5 exception note.
 * @param options - clock and lapse notification.
 * @returns an answerer that grants only what the note names, only until it expires.
 * @throws Error when the note has already expired, or when its window is longer
 * than {@link MAX_EXCEPTION_WINDOW_MS}. Both are refused at CONSTRUCTION, where
 * the operator is still standing there to be told, rather than at the first
 * question of an unattended run.
 */
export function createApprovalExceptionAnswerer(
  note: ApprovalExceptionNote,
  options: ApprovalExceptionOptions = {}
): ApprovalAnswerer {
  const now = options.now ?? ((): number => Date.now());
  const expiresAt = Date.parse(note.expiresAt);
  const remaining = expiresAt - now();
  if (remaining <= 0) {
    throw new Error(
      `ADR-5 exception ${note.exceptionId} expired at ${note.expiresAt}; ` +
        "renew it deliberately or run with approvals on."
    );
  }
  if (remaining > MAX_EXCEPTION_WINDOW_MS) {
    throw new Error(
      `ADR-5 exception ${note.exceptionId} expires at ${note.expiresAt}, more than ` +
        `${MAX_EXCEPTION_WINDOW_MS / (24 * 60 * 60 * 1000)} days out. An exception that outlives ` +
        "the release that introduced it is a default; shorten the window."
    );
  }

  const covered = new Set<ActionClass>(note.actionClasses);
  let lapseReported = false;

  return {
    name: exceptionAnswererName(note),
    answer(question: AnsweredQuestion): Promise<ApprovalAnswer | null> {
      if (now() >= expiresAt) {
        if (!lapseReported) {
          lapseReported = true;
          options.onLapsed?.(note);
        }
        // Abstain, never deny: the question goes back to the approvals engine,
        // which is the party that was always supposed to decide it.
        return Promise.resolve(null);
      }
      if (!covered.has(question.actionClass)) return Promise.resolve(null);
      return Promise.resolve("allow");
    }
  };
}
