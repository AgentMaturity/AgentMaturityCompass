import { z } from "zod";

/** Lowercase hex SHA-256 digest. */
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
/** UTC ISO 8601 timestamp ending in Z. */
export const isoTimeSchema = z.iso.datetime();
export const nonEmpty = z.string().min(1);

/** How strongly a boundary held: `enforced` must name the boundary that held it. Same vocabulary as claim enforcement. */
export const enforcementLevelSchema = z.discriminatedUnion("level", [
  z.strictObject({ level: z.enum(["none", "advisory", "observed"]) }),
  z.strictObject({ level: z.literal("enforced"), boundary: nonEmpty })
]);

/** A granted exception to a control: who issued it and until when. */
export const exceptionRefSchema = z.strictObject({ exceptionId: nonEmpty, issuer: nonEmpty, expiresAt: isoTimeSchema });
