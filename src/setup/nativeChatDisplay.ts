import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { LIVE_FRAME } from "../llm/adapter/liveTextPreview.js";
import { renderMarkdownLine, type MarkdownState } from "../utils/terminalMarkdown.js";

/**
 * What chat shows of a turn child's stderr. The child (`agent-loop run --json --stream`) prints its progress lines and
 * the provisional live reply there; chat turns them into a spinner and the reply rendered as Markdown while it streams.
 * The reply is framed by lines that start with LIVE_FRAME, a byte model text never carries, so a reply cannot end the
 * region early and pose as AMC. The child's setup lines (write scope, policy, confinement) are dropped: chat says those
 * from its own readiness check. Anything else (errors, warnings, refusals) is passed through with colour kept and every
 * other control character shown, never executed.
 */
export interface ChatContextReading { readonly promptTokens: number | null; readonly windowTokens: number | null }
export interface ChatDisplay {
  /** Feed a chunk of the child's stderr. */
  child(text: string): void;
  /** The child closed: flush what is left. */
  end(): void;
  /** Show the spinner (a terminal that can redraw) with this label until the next output. */
  busy(label: string): void;
  /** Remove the spinner line, if shown. */
  clear(): void;
  /** Start a new turn: forget the last turn's live text and context reading. */
  beginTurn(): void;
  /** The live reply text streamed in this turn, unrendered. */
  liveText(): string;
  /** The last context reading the child reported in this turn. */
  context(): ChatContextReading | null;
}

const LIVE_HEADER = new RegExp(`^${LIVE_FRAME}Live reply · session \\S+ · provisional`);
const LIVE_END = `\n${LIVE_FRAME}[Live preview `;
const LIVE_CLOSED = new RegExp(`^${LIVE_FRAME}\\[Live preview (ended|truncated)`);
const SETUP = [/^tool writes are scoped to: /, /^action policy: /, /^approval mode [a-z-]+: /, /^File tools are limited by /, /^this process is not OS-confined/];
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Streams one reply: plain prose word by word (wrapped), Markdown block lines (headings, lists, code) once complete. */
class LiveMarkdown {
  private readonly state: MarkdownState = { inCode: false };
  private pending = "";
  private mode: "undecided" | "prose" | "block" = "undecided";
  private col = 0;
  constructor(private readonly write: (text: string) => void, private readonly width: () => number | null) {}

  feed(text: string): void {
    const parts = text.split("\n");
    parts.forEach((part, at) => {
      this.pending += part;
      if (at < parts.length - 1) this.newline(); else this.progress();
    });
  }

  flush(): void { if (this.pending !== "" || this.col > 0) this.newline(); }

  private limit(): number {
    const width = this.width();
    return width === null || width < 21 ? Number.POSITIVE_INFINITY : Math.min(width, 200) - 1;
  }

  private decide(): void {
    if (this.state.inCode) { this.mode = "block"; return; }
    const text = this.pending;
    if (/^\s*(#{0,6}|[-*+_]{0,3}|\d{0,9}[.)]?|>|`{0,3}|~{0,3})$/.test(text)) return;
    this.mode = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|([-*_])\s*\2)/.test(text) ? "block" : "prose";
  }

  private progress(): void {
    if (this.mode === "undecided") this.decide();
    if (this.mode !== "prose") return;
    const cut = this.pending.lastIndexOf(" ");
    if (cut < 0) return;
    this.words(this.pending.slice(0, cut));
    this.pending = this.pending.slice(cut + 1);
  }

  private words(text: string): void {
    for (const word of text.split(" ")) {
      if (word === "") continue;
      const shown = escapeTerminalControls(word);
      const styled = /^`[^`]+`[.,;:!?)]*$/.test(shown) ? shown.replace(/`([^`]+)`/, (_m, code: string) => chalk.cyan(code))
        : /^\*\*[^*]+\*\*[.,;:!?)]*$/.test(shown) ? shown.replace(/\*\*([^*]+)\*\*/, (_m, bold: string) => chalk.bold(bold)) : shown;
      const length = stripVTControlCharacters(styled).length;
      if (this.col > 0 && this.col + 1 + length > this.limit()) { this.write("\n"); this.col = 0; }
      else if (this.col > 0) { this.write(" "); this.col += 1; }
      this.write(styled);
      this.col += length;
    }
  }

  private newline(): void {
    if (this.mode === "undecided") this.decide();
    if (this.mode === "prose" || (this.mode === "undecided" && this.col > 0)) { this.words(this.pending); this.write("\n"); }
    else for (const line of renderMarkdownLine(this.pending, this.state, this.width())) this.write(`${line}\n`);
    this.pending = ""; this.mode = "undecided"; this.col = 0;
  }
}

export function createChatDisplay(options: {
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
  readonly columns: () => number | null;
  /** A terminal that can redraw one line (not TERM=dumb). */
  readonly spinner: boolean;
}): ChatDisplay {
  let line = "";
  let region: { markdown: LiveMarkdown; tail: string } | null = null;
  let live = "";
  let reading: ChatContextReading | null = null;
  let timer: NodeJS.Timeout | null = null;
  let label = "";
  let started = 0;
  let frame = 0;
  const draw = () => { options.write(`\r\x1b[K${chalk.cyan(SPINNER[frame++ % SPINNER.length])} ${label} ${chalk.dim(`· ${Math.floor((Date.now() - started) / 1000)}s · Ctrl-C cancels`)}`); };
  const clear = () => {
    if (timer === null) return;
    clearInterval(timer); timer = null;
    options.write("\r\x1b[K");
  };
  const out = (text: string) => { clear(); options.write(text); };
  const busy = (next: string) => {
    if (!options.spinner) return;
    label = next;
    if (timer === null) { started = Date.now(); timer = setInterval(draw, 100); timer.unref(); }
    draw();
  };

  const onLine = (raw: string) => {
    const text = stripVTControlCharacters(raw).trimEnd();
    if (LIVE_HEADER.test(text)) { clear(); region = { markdown: new LiveMarkdown(out, options.columns), tail: "" }; return; }
    if (text.trim() === "" || LIVE_CLOSED.test(text)) {
      if (text.includes("truncated")) out(`${chalk.dim("(The live text was cut short; the recorded reply follows.)")}\n`);
      return;
    }
    if (/^turn \d+ started$/.test(text)) { busy("Working"); return; }
    const step = /^step (\d+\.\d+) → model$/.exec(text.trim());
    if (step) { busy(`step ${step[1]} · waiting for the model`); return; }
    const context = /^step \d+\.\d+ context: prompt (\d+|unmeasured) tokens(?: of (\d+))?/.exec(text.trim());
    if (context) { reading = { promptTokens: context[1] === "unmeasured" ? null : Number(context[1]), windowTokens: context[2] === undefined ? null : Number(context[2]) }; return; }
    if (/^turn \d+ ended: complete$/.test(text)) { clear(); return; }
    if (SETUP.some(pattern => pattern.test(text))) return;
    clear();
    // Colour (SGR) stays; any other control character is shown as \uXXXX.
    options.writeError(`${raw.split(/(\x1b\[[0-9;]*m)/).map((part, at) => at % 2 === 1 ? part : escapeTerminalControls(part)).join("")}\n`);
  };

  const outside = (text: string) => {
    const parts = (line + text).split("\n");
    line = parts.pop()!;
    for (let at = 0; at < parts.length; at++) {
      onLine(parts[at]!);
      // A header opens the live region: the rest of this chunk is reply text.
      if (region !== null) { const rest = [...parts.slice(at + 1), line].join("\n"); line = ""; inside(rest); return; }
    }
  };
  const inside = (text: string) => {
    const current = region!;
    const buffer = current.tail + text;
    const end = buffer.indexOf(LIVE_END);
    if (end >= 0) {
      const reply = buffer.slice(0, end);
      live += reply; current.markdown.feed(reply); current.markdown.flush();
      region = null;
      outside(buffer.slice(end + 1));
      return;
    }
    // Hold back a tail that could be the start of the end marker.
    let keep = 0;
    for (let n = Math.min(LIVE_END.length - 1, buffer.length); n > 0; n--) if (LIVE_END.startsWith(buffer.slice(-n))) { keep = n; break; }
    const reply = buffer.slice(0, buffer.length - keep);
    current.tail = buffer.slice(buffer.length - keep);
    live += reply; current.markdown.feed(reply);
  };

  return {
    child: text => { if (region === null) outside(text); else inside(text); },
    end: () => {
      if (region !== null) { const current = region; region = null; live += current.tail; current.markdown.feed(current.tail); current.markdown.flush(); }
      if (line !== "") { const rest = line; line = ""; onLine(rest); }
      clear();
    },
    busy, clear,
    beginTurn: () => { live = ""; reading = null; },
    liveText: () => live,
    context: () => reading
  };
}
