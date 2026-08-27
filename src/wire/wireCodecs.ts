import { z } from "zod";
import { WORK_STATES } from "./workAcceptance.js";

/**
 * One declaration per method, read by both ends (plan P7.1a).
 *
 * THE DRIFT THIS EXISTS TO STOP. The server validated params by hand in
 * ./wireMethods.ts and the client validated results by hand in ./wireClient.ts,
 * so the same two methods were described twice, in two files, by two sets of
 * ad-hoc checks. Nothing made them agree. Adding a field to a result meant
 * remembering to teach the other side about it, and forgetting was silent: the
 * server would send something the client dropped, or the client would insist on
 * something the server never sent. Here each method is described ONCE and both
 * sides decode against that description.
 *
 * The states are not redefined either. They belong to ./workAcceptance.ts, which
 * is the module that decides them; this file imports that array rather than
 * restating it, because a wire that disagreed with the ledger about what states
 * exist would be a bug nobody could see from either file alone.
 *
 * WHY ZOD IS SAFE HERE, given this repo has recorded that `.strict()` is not a
 * prototype-pollution defence and that a strict schema returning `ok` is not
 * evidence the payload was clean. Both are true, and neither applies at this
 * point in the pipeline: ./wireJson.ts has already refused duplicate keys,
 * reserved keys, unsafe numbers and over-deep nesting over the RAW BYTES, before
 * any value existed to hand a schema. Zod is deciding shape here, not safety.
 *
 * `.strict()` still earns its place, for the reason it does on `.amc/agents.yaml`:
 * a member the sender believes it set and the receiver silently drops is a
 * message that does not do what it plainly says.
 */

const nonEmpty = z.string().min(1);

/**
 * Params and results for every method the wire serves.
 *
 * Kept as one object rather than spread across the method registry so that the
 * two can be checked against each other -- a method with no codec, or a codec for
 * no method, is caught by a test rather than discovered at run time.
 */
export const WIRE_CODECS = {
  "work/accept": {
    params: z
      .object({
        prompt: nonEmpty,
        providerId: nonEmpty,
        // Absent and null are different statements: absent means the caller
        // expressed no preference, null means it explicitly wants none.
        model: nonEmpty.nullable().optional()
      })
      .strict(),
    result: z
      .object({
        workSessionId: nonEmpty,
        receipt: nonEmpty,
        receiptId: nonEmpty,
        requestSha256: nonEmpty
      })
      .strict()
  },
  "work/describe": {
    params: z.object({ receipt: nonEmpty }).strict(),
    result: z
      .object({
        workSessionId: nonEmpty,
        state: z.enum(WORK_STATES)
      })
      .strict()
  }
} as const;

export type WireMethodName = keyof typeof WIRE_CODECS;

export type WireParams<M extends WireMethodName> = z.infer<(typeof WIRE_CODECS)[M]["params"]>;
export type WireResult<M extends WireMethodName> = z.infer<(typeof WIRE_CODECS)[M]["result"]>;

export const WIRE_METHOD_NAMES = Object.keys(WIRE_CODECS) as readonly WireMethodName[];

export type Decoded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function decodeParams<M extends WireMethodName>(
  method: M,
  value: unknown
): Decoded<WireParams<M>> {
  return decode(WIRE_CODECS[method].params, value, "params") as Decoded<WireParams<M>>;
}

export function decodeResult<M extends WireMethodName>(
  method: M,
  value: unknown
): Decoded<WireResult<M>> {
  return decode(WIRE_CODECS[method].result, value, "result") as Decoded<WireResult<M>>;
}

function decode(schema: z.ZodTypeAny, value: unknown, what: string): Decoded<unknown> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, reason: `${what} ${describeIssues(parsed.error.issues)}` };
}

/**
 * Say which field was wrong, never what was in it.
 *
 * A refusal travels back to the sender and into logs on both sides. The sender
 * already knows what it sent, and the log does not need a copy of a value chosen
 * by the far end -- that is the same rule ./ndjsonFraming.ts follows when it
 * reports an ordinal instead of a record.
 */
function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${where}: ${issue.message}`;
    })
    .join("; ");
}
