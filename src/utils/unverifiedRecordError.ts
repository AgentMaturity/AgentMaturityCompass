/**
 * A read that refuses to show a record because it does not pass its signature check (an edited or unsigned file).
 * Studio answers 409 with these words and code, so a page never shows such a record as a trusted result.
 */
export class UnverifiedRecordError extends Error {
  constructor(readonly code: "RUN_UNVERIFIED" | "TARGETS_UNVERIFIED", message: string) {
    super(message);
    this.name = "UnverifiedRecordError";
  }
}
