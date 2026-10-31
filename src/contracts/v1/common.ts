import { z } from "zod";

/** Lowercase hex SHA-256 digest. */
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
// The time rule the published schemas carry, zod 4.4's: a real calendar date and hh:mm with optional seconds and
// fraction. zod 4.5's z.iso.datetime() requires seconds, and a published $id never changes meaning (spec/README.md).
const DATE = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
const TIME = "(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?";
/** UTC ISO 8601 timestamp ending in Z. */
export const isoTimeSchema = z.stringFormat("datetime", new RegExp(`^${DATE}T(?:${TIME}(?:Z))$`));
/** The same, or with a ±hh:mm offset: AEP 0.1's event times (website/schemas/observed-aep-action-event-0.1.schema.json). */
export const isoTimeOffsetSchema = z.stringFormat("datetime", new RegExp(`^${DATE}T(?:${TIME}(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$`));
export const nonEmpty = z.string().min(1);

/** How strongly a boundary held: `enforced` must name the boundary that held it. Same vocabulary as claim enforcement. */
export const enforcementLevelSchema = z.discriminatedUnion("level", [
  z.strictObject({ level: z.enum(["none", "advisory", "observed"]) }),
  z.strictObject({ level: z.literal("enforced"), boundary: nonEmpty })
]);

/** A granted exception to a control: who issued it and until when. */
export const exceptionRefSchema = z.strictObject({ exceptionId: nonEmpty, issuer: nonEmpty, expiresAt: isoTimeSchema });
