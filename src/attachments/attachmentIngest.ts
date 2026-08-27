import { detonateAttachment } from "../shield/attachmentDetonation.js";
import { sha256Hex } from "../utils/hash.js";
import type { SessionService } from "../session/sessionService.js";

/**
 * Content-addressed attachments, gated on the way in (plan P6.3).
 *
 * An attachment is untrusted content entering the model's context, so it gets
 * two things: a content address, and a gate.
 *
 * WHY GATING ON `detonateAttachment` IS DEFENSIBLE HERE, when gating an MCP
 * mount on `analyzeMcpSecurity`'s score was not. Both are crude detectors. The
 * difference is which way their errors fall. Detonation refuses on a dangerous
 * extension, so its failure mode is a false REFUSAL — an operator is told no
 * about a file that was fine, notices immediately, and can rename or inline it.
 * The MCP score's failure mode was false TRUST: a hostile manifest reading
 * SECURE, which nobody notices because nothing looks wrong. A detector may gate
 * when it fails closed.
 *
 * It also gives `detonateAttachment` its first production consumer. Until now it
 * was one re-export and one test — a verdict nothing acted on.
 *
 * WHAT THIS DOES NOT CLAIM. Detonation reads a filename and scans content for
 * patterns; it does not execute anything and cannot tell a benign PDF from a
 * malicious one. A document that passes is a document nothing objected to, which
 * is not the same as a safe one — and text inside an accepted file still reaches
 * the model as instructions it may follow. That is the prompt-injection surface
 * every context-bearing file has, and no extension check addresses it.
 */

export type AttachmentIngest =
  | { readonly ok: true; readonly sha256: string; readonly mimeType: string }
  | { readonly ok: false; readonly reason: string };

/** Extensions whose bytes the model reads as an image part rather than as text. */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function ingestAttachment(params: {
  readonly session: SessionService;
  readonly filename: string;
  readonly content: string | Buffer;
}): AttachmentIngest {
  const bytes = typeof params.content === "string"
    ? Buffer.from(params.content, "utf8")
    : params.content;

  // Detonate BEFORE recording. A refused attachment must leave no row and no
  // surface part: the whole point of the gate is that the model never sees it,
  // and a recorded-then-rejected attachment would be on the surface already.
  const verdict = detonateAttachment(params.filename, bytes.toString("utf8"));
  if (!verdict.safe) {
    return {
      ok: false,
      reason: `refusing to attach ${params.filename}: ${verdict.threats.join("; ")}`
    };
  }

  params.session.recordUserAttachment({
    filename: params.filename,
    content: bytes,
    kind: IMAGE_TYPES.has(verdict.mimeType) ? "image" : "text",
    mimeType: verdict.mimeType
  });

  return { ok: true, sha256: sha256Hex(bytes), mimeType: verdict.mimeType };
}
