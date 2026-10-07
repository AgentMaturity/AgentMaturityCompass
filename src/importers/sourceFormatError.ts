/** A recognized source format that this importer refuses; its message is safe to show (no source values). */
export class SourceFormatError extends Error {
  override readonly name: string = "SourceFormatError";
  readonly code: string;
  readonly format: string;
  readonly detectedVersion: string | number | null;
  readonly supported: string;
  readonly sourceRevision: string | null;

  constructor(message: string, detail: { code: string; format: string; detectedVersion: string | number | null; supported: string; sourceRevision: string | null }) {
    super(message);
    this.code = detail.code;
    this.format = detail.format;
    this.detectedVersion = detail.detectedVersion;
    this.supported = detail.supported;
    this.sourceRevision = detail.sourceRevision;
  }
}

/** A numeric header version, or null; other values are never echoed because they are source content. */
export function headerVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
