/** Explicit current input profiles, before the unchanged historical decoders. */
import { isUtf8 } from "node:buffer";
import { decodeDshSessionFrames } from "./dshSessionFrames.js";
import { parseDetectedDshSessionV4 } from "./dshSessionImportV4.js";
import { parseDetectedCurrentPiTelemetry } from "./piTelemetryCurrent.js";
import { SourceFormatError } from "./sourceFormatError.js";

export function parseVersionedHarnessImport(raw: Buffer, format: string, compressedDsh: boolean) {
  const text = compressedDsh ? decodeDshSessionFrames(raw) : raw.toString("utf8");
  const dshV4 = format === "jsonl" ? parseDetectedDshSessionV4(text) : null;
  if (dshV4 && !compressedDsh && !isUtf8(raw)) throw new SourceFormatError("DSH v4 source contains invalid UTF-8 bytes; no replacement decoding is admitted.", {
    code: "DSH_SESSION_REFUSED", format: "dsh-session", detectedVersion: 4, supported: "dsh-session v4", sourceRevision: dshV4.format.sourceRevision });
  if (compressedDsh && !dshV4) throw new SourceFormatError("Compressed DSH import requires an explicitly supported DSH v4 header; no historical migration or generic fallback is attempted.", {
    code: "DSH_SESSION_VERSION_UNSUPPORTED", format: "dsh-session", detectedVersion: null, supported: "compressed dsh-session v4", sourceRevision: null });
  const currentPi = format === "json" ? parseDetectedCurrentPiTelemetry(text) : null;
  return { text, dshV4, currentPi };
}
