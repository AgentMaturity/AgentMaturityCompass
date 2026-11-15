import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";

/**
 * A small Markdown renderer for a terminal: headings, lists, quotes, fenced code and inline `code`/**bold**, word-wrapped
 * at the terminal width. Text is escaped before it is styled, so model text can never draw its own terminal controls.
 * Colour follows chalk, which the CLI turns off for NO_COLOR, --no-color, TERM=dumb and a non-terminal.
 */
export interface MarkdownState { inCode: boolean }

const WIDTH_CAP = 200;

function visibleLength(text: string): number {
  return stripVTControlCharacters(text).length;
}

/** Word-wrap one line to `width` columns (null: no wrap), indenting continuation lines with `indent`. */
export function wrapLine(text: string, width: number | null, indent?: string): string[] {
  if (text.includes("\n")) return text.split("\n").flatMap(line => wrapLine(line, width, indent));
  const limit = width === null ? null : Math.min(width, WIDTH_CAP) - 1;
  if (limit === null || limit < 20 || visibleLength(text) <= limit) return [text];
  // Continuation lines keep the line's own indentation unless the caller names one.
  const lead = /^ */.exec(text)![0];
  indent ??= lead;
  const lines: string[] = [];
  let current = lead;
  for (const word of text.slice(lead.length).split(" ")) {
    const candidate = current.trim() === "" ? current + word : `${current} ${word}`;
    if (visibleLength(candidate) <= limit || stripVTControlCharacters(current).trim() === "") { current = candidate; continue; }
    lines.push(current);
    current = indent + word;
  }
  if (current !== "") lines.push(current);
  return lines;
}

function inline(text: string): string {
  return text
    .replace(/(?<!`)`([^`\n]+)`(?!`)/g, (_m, code: string) => chalk.cyan(code))
    .replace(/\*\*([^*]+)\*\*/g, (_m, bold: string) => chalk.bold(bold));
}

/** Render one complete source line; returns the terminal lines it becomes. */
export function renderMarkdownLine(source: string, state: MarkdownState, width: number | null): string[] {
  const line = escapeTerminalControls(source.replace(/\r$/, ""));
  if (/^\s*(```|~~~)/.test(line)) {
    state.inCode = !state.inCode;
    const label = line.trim().replace(/^(```|~~~)/, "");
    return state.inCode && label ? [chalk.dim(`  ${label}`)] : [];
  }
  if (state.inCode) return [chalk.cyan(`  ${line}`)];
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) return wrapLine(chalk.bold(heading[1]!.length <= 2 ? chalk.underline(heading[2]!) : heading[2]!), width);
  const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
  if (bullet) {
    const pad = `${bullet[1]!}  `;
    return wrapLine(`${pad}• ${inline(bullet[2]!)}`, width, `${pad}  `);
  }
  const numbered = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line);
  if (numbered) {
    const pad = `${numbered[1]!}  `;
    return wrapLine(`${pad}${numbered[2]!} ${inline(numbered[3]!)}`, width, `${pad}${" ".repeat(numbered[2]!.length + 1)}`);
  }
  const quote = /^>\s?(.*)$/.exec(line);
  if (quote) return wrapLine(chalk.dim(`│ ${quote[1]!}`), width, chalk.dim("│ "));
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return [chalk.dim("─".repeat(Math.min(width ?? 40, 40)))];
  return wrapLine(inline(line), width);
}

/** Render a whole Markdown text. */
export function renderMarkdown(text: string, width: number | null): string[] {
  const state: MarkdownState = { inCode: false };
  return text.split("\n").flatMap(line => renderMarkdownLine(line, state, width));
}
