/** C0 (except tab and newline), DEL and C1: what a terminal reads as cursor and colour control. */
export const TERMINAL_CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/;

/**
 * Bidi marks, embeddings, overrides and isolates: no cursor control, but they reorder what a person reads (a tool name
 * or a result line from an MCP server can make an approval line read backwards). Escaped with the controls.
 */
const BIDI_CONTROLS = "؜‎‏‪-‮⁦-⁩";

/** Shown, never interpreted: each control or bidi character as a visible `\uXXXX`. */
export function escapeTerminalControls(text: string): string {
  return text.replace(new RegExp(`${TERMINAL_CONTROLS.source.slice(0, -1)}${BIDI_CONTROLS}]`, "g"), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** One line of text for a harness note: newlines and every other control shown as escapes, bidi marks too, capped. */
export function oneLineText(text: string, max = 256): string {
  return escapeTerminalControls(JSON.stringify(text.slice(0, max)).slice(1, -1));
}
