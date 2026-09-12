import { StringDecoder } from "node:string_decoder";

/**
 * A streaming UTF-8 decoder with exact-value redaction. Only a possible secret
 * prefix is held back: holding an arbitrary long tail would hide an interactive
 * password/input prompt indefinitely. Observers never receive undecoded bytes
 * or half a Unicode code point. Retention belongs to TerminalSession, not here.
 */
export class TerminalOutput {
  private readonly decoder = new StringDecoder("utf8");
  private readonly secrets: readonly string[];
  private pending = "";
  private ended = false;

  constructor(private readonly emit: (text: string) => void, scrubValues: readonly string[] = []) {
    if (scrubValues.length > 128 || scrubValues.some(value => typeof value !== "string" || value.length > 8192) ||
        scrubValues.reduce((sum, value) => sum + value.length, 0) > 65_536) {
      throw new RangeError("Terminal redaction values exceed the bounded scrub budget.");
    }
    this.secrets = [...new Set(scrubValues.filter(value => value.length > 0))].sort((a, b) => b.length - a.length);
  }

  push(bytes: Buffer): void {
    if (this.ended) return;
    this.pending += this.decoder.write(bytes);
    this.flush(false);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.pending += this.decoder.end();
    this.flush(true);
  }

  private flush(final: boolean): void {
    let at = 0;
    let output = "";
    while (at < this.pending.length) {
      const remaining = this.pending.slice(at);
      if (!final && this.secrets.some(secret => remaining.length < secret.length && secret.startsWith(remaining))) break;
      const match = this.secrets.find(secret => this.pending.startsWith(secret, at));
      if (match) {
        output += "[amc:redacted]";
        at += match.length;
      } else {
        const length = this.pending.codePointAt(at)! > 0xffff ? 2 : 1;
        output += this.pending.slice(at, at + length);
        at += length;
      }
    }
    this.pending = this.pending.slice(at);
    if (output) this.emit(output);
  }
}
