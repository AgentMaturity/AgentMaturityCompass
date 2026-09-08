import type { StreamChunk } from "../streamChunk.js";

export type LiveTextPreviewEvent = {
  readonly sessionId: string;
  readonly headerEventId: string;
  readonly trust: "provisional";
} & ({ readonly kind: "text"; readonly text: string } | { readonly kind: "end"; readonly truncated: boolean });

/** Presentation only. It never dispatches tools or supplies committed request history. */
export class LiveTextPreview {
  private buffer = "";
  private delivered = 0;
  private stopped = false;
  private truncated = false;
  private readonly secret: string;
  constructor(private readonly input: { sessionId: string; headerEventId: string; secret: string | null;
    notify?: (event: LiveTextPreviewEvent) => void }) {
    this.secret = this.clean(input.secret ?? "");
  }

  push(chunk: StreamChunk): void {
    if (this.stopped || this.truncated || !this.input.notify || chunk.type !== "text-delta") return;
    // Retain a possible credential suffix across chunk and block boundaries.
    // Reasoning, arguments and tool payloads never enter the presentation channel.
    // Scrub the displayed representation, so removing a control character
    // cannot join two apparently harmless fragments into a credential.
    this.buffer += this.clean(chunk.text);
    const secret = this.secret;
    if (secret) this.buffer = this.buffer.split(secret).join("<redacted>".includes(secret) ? "" : "<redacted>");
    const keep = secret ? secret.length - 1 : 0;
    let safeLength = Math.max(0, this.buffer.length - keep);
    if (safeLength > 0 && /[\uD800-\uDBFF]/.test(this.buffer[safeLength - 1]!)) safeLength--;
    this.emit(this.buffer.slice(0, safeLength));
    this.buffer = this.buffer.slice(safeLength);
  }

  finish(): void {
    if (this.stopped) return;
    if (this.secret) this.buffer = this.buffer.split(this.secret).join("<redacted>".includes(this.secret) ? "" : "<redacted>");
    this.emit(this.buffer); this.buffer = ""; this.stopped = true;
    this.notify({ kind: "end", truncated: this.truncated });
  }

  private emit(text: string): void {
    if (!text || this.truncated) return;
    if (this.delivered >= 1024 * 1024) { this.truncated = true; return; }
    // Terminal control sequences are not model output the terminal may execute.
    const bytes = Buffer.from(text);
    const remaining = 1024 * 1024 - this.delivered;
    if (bytes.length > remaining) this.truncated = true;
    let cut = Math.min(bytes.length, remaining);
    while (cut > 0 && cut < bytes.length && (bytes[cut]! & 0xc0) === 0x80) cut--;
    const bounded = bytes.subarray(0, cut).toString("utf8");
    this.delivered += cut;
    if (bounded) this.notify({ kind: "text", text: bounded });
  }

  private clean(text: string): string { return text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ""); }

  private notify(event: { kind: "text"; text: string } | { kind: "end"; truncated: boolean }): void {
    try { this.input.notify?.({ ...event, sessionId: this.input.sessionId, headerEventId: this.input.headerEventId, trust: "provisional" }); }
    catch { /* A failed presentation sink cannot change execution or its signed outcome. */ }
  }
}
