/**
 * HTML to markdown or plain text for `web_fetch` (SH-TOOLS-03), with no dependency and no DOM.
 *
 * One linear pass over the input with an iterative hand-written tokenizer (tags, comments, CDATA, text), a small
 * element table, and a stack of open inline marks. Linear is a security property, not a nicety: the input is remote
 * and attacker-chosen up to the signed byte cap, and the body runs on the main thread, so every step here consumes
 * input it never revisits (the tag scanner never retries at the next `<`, and trailing newlines are counted, never
 * re-measured). Rendering is lossy by design: `script`, `style`, `noscript`, `template`, `svg`, `iframe`, `object`,
 * `embed`, `title` and comments are dropped with their content (a `<script/>` still drops to its `</script>`, as a
 * browser reads it); every attribute but `href`, `src` and `alt` is ignored; entities are decoded; whitespace collapses
 * as a browser collapses it outside `pre`. `head` is not dropped as an element, because its end tag is optional and a
 * page that omits it would vanish: its children either render nothing or are dropped themselves. Table rows and
 * cells close implicitly at the next row, cell or table end, as in HTML. Links are resolved against the response URL
 * and kept only for `http`, `https` and `mailto`. The `html` format keeps the raw body, and the receipt digests the
 * body as received, so the evidence is never the rendering.
 */

const DROP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "embed", "title", "math"]);
const RAW_TEXT = new Set(["script", "style", "textarea"]);
const BLOCK = new Set(["p", "div", "section", "article", "main", "header", "footer", "nav", "aside", "blockquote", "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "br", "dl", "dt", "dd", "figure", "figcaption", "details", "summary", "form", "fieldset", "address"]);
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);
/** `nbsp` becomes an ordinary space: the model reads text, it does not lay it out. */
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", copy: "©", reg: "®",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•", times: "×", euro: "€", pound: "£", yen: "¥", deg: "°" };
/** The most input one tag may span; past it the text is text. */
const MAX_TAG_CHARS = 65_536;

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

type Token = { kind: "text"; text: string } | { kind: "open"; name: string; attrs: Record<string, string>; selfClosing: boolean } | { kind: "close"; name: string };

function attributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1]!.toLowerCase();
    if (name === "href" || name === "src" || name === "alt") attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

const isNameStart = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
const isNameChar = (code: number): boolean => isNameStart(code) || (code >= 48 && code <= 57) || code === 58 || code === 45;

/**
 * Scan one tag starting at `lt` (`html[lt] === "<"` and a name follows). Returns where the tag ends (after `>`), or
 * the index where scanning gave up: no `>` within MAX_TAG_CHARS, in which case the caller treats the span as text and
 * continues after it, never retrying inside it. Quoted attribute values may contain `>`.
 */
function scanTag(html: string, lt: number): { readonly end: number; readonly found: boolean; readonly nameEnd: number } {
  const limit = Math.min(html.length, lt + MAX_TAG_CHARS);
  let i = lt + 1;
  if (html.charCodeAt(i) === 47) i++;
  while (i < limit && isNameChar(html.charCodeAt(i))) i++;
  const nameEnd = i;
  while (i < limit) {
    const code = html.charCodeAt(i);
    if (code === 62) return { end: i + 1, found: true, nameEnd };
    if (code === 34 || code === 39) {
      const quote = html.indexOf(html[i]!, i + 1);
      i = quote === -1 || quote >= limit ? limit : quote + 1;
      continue;
    }
    i++;
  }
  return { end: limit, found: false, nameEnd };
}

/** Iterative: no recursion, so nesting depth never matters; every character is consumed once. */
export function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < html.length) {
    const lt = html.indexOf("<", at);
    if (lt === -1) { tokens.push({ kind: "text", text: html.slice(at) }); break; }
    if (lt > at) tokens.push({ kind: "text", text: html.slice(at, lt) });
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      at = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<![CDATA[", lt)) {
      const end = html.indexOf("]]>", lt + 9);
      tokens.push({ kind: "text", text: html.slice(lt + 9, end === -1 ? html.length : end) });
      at = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      at = end === -1 ? html.length : end + 1;
      continue;
    }
    const closing = html[lt + 1] === "/";
    if (!isNameStart(html.charCodeAt(lt + (closing ? 2 : 1)))) { tokens.push({ kind: "text", text: "<" }); at = lt + 1; continue; }
    const tag = scanTag(html, lt);
    if (!tag.found) { tokens.push({ kind: "text", text: html.slice(lt, tag.end) }); at = tag.end; continue; }
    const name = html.slice(lt + (closing ? 2 : 1), tag.nameEnd).toLowerCase();
    at = tag.end;
    if (closing) { tokens.push({ kind: "close", name }); continue; }
    const source = html.slice(tag.nameEnd, tag.end - 1);
    const raw = RAW_TEXT.has(name);
    tokens.push({ kind: "open", name, attrs: name === "a" || name === "img" ? attributes(source) : {}, selfClosing: !raw && (VOID.has(name) || /\/\s*$/.test(source)) });
    if (raw) {
      // Raw-text elements: everything to the matching close tag is one text token (left out for script/style, which
      // the renderer drops anyway), and a self-closing slash does not end them, as in a browser.
      const close = new RegExp(`</${name}\\s*>`, "ig");
      close.lastIndex = at;
      const match = close.exec(html);
      if (name === "textarea") tokens.push({ kind: "text", text: html.slice(at, match === null ? html.length : match.index) });
      tokens.push({ kind: "close", name });
      at = match === null ? html.length : match.index + match[0].length;
    }
  }
  return tokens;
}

function safeUrl(raw: string | undefined, base: string): string | null {
  if (raw === undefined) return null;
  try {
    const url = new URL(raw.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" ? url.href : null;
  } catch {
    return null;
  }
}

export interface RenderOptions {
  readonly format: "markdown" | "text";
  /** The response URL, for resolving relative links. */
  readonly base: string;
}

const isBlank = (char: string | undefined): boolean => char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";

/**
 * Trailing blanks off every line and runs of blank lines folded to one, in one pass. Not `/[ \t]+\n/g`: on a long run
 * of blanks with no newline after it (a `pre` of spaces) that regex retries at every blank, which is quadratic.
 */
function tidy(text: string): string {
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    let end = line.length;
    while (end > 0 && (line.charCodeAt(end - 1) === 32 || line.charCodeAt(end - 1) === 9)) end--;
    if (end === 0 && kept.length > 0 && kept[kept.length - 1] === "") continue;
    kept.push(end === line.length ? line : line.slice(0, end));
  }
  return kept.join("\n").trim();
}

/** Render an HTML document as markdown or plain text. Never throws on malformed input. */
export function renderHtml(html: string, options: RenderOptions): string {
  const md = options.format === "markdown";
  const out: string[] = [];
  let trailingNewlines = 0;
  let dropDepth = 0;
  let preDepth = 0;
  const lists: Array<{ ordered: boolean; count: number }> = [];
  const links: Array<string | null> = [];
  let cell = false;
  let rowCells: string[] = [];
  let tableRows: string[][] = [];
  const push = (text: string): void => {
    if (text === "") return;
    out.push(text);
    let count = 0;
    while (count < text.length && text[text.length - 1 - count] === "\n") count++;
    trailingNewlines = count === text.length ? trailingNewlines + count : count;
  };
  const emit = (text: string): void => { if (cell) rowCells[rowCells.length - 1] = `${rowCells[rowCells.length - 1] ?? ""}${text}`; else push(text); };
  const newline = (count = 1): void => {
    if (cell || out.length === 0) return;
    if (trailingNewlines < count) push("\n".repeat(count - trailingNewlines));
  };
  const endRow = (): void => {
    cell = false;
    if (rowCells.length > 0) tableRows.push(rowCells.map((text) => text.trim().replace(/\|/g, "\\|")));
    rowCells = [];
  };
  const flushTable = (): void => {
    endRow();
    if (tableRows.length === 0) return;
    let width = 0;
    for (const row of tableRows) width = Math.max(width, row.length);
    const rows = tableRows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
    if (md) {
      push(rows.map((row, index) => `| ${row.join(" | ")} |${index === 0 ? `\n| ${row.map(() => "---").join(" | ")} |` : ""}`).join("\n"));
    } else push(rows.map((row) => row.join("\t")).join("\n"));
    push("\n\n");
    tableRows = [];
  };
  for (const token of tokenize(html)) {
    if (token.kind === "text") {
      if (dropDepth > 0) continue;
      const text = decodeEntities(token.text);
      if (preDepth > 0) { emit(text); continue; }
      const collapsed = text.replace(/[ \t\r\n\f]+/g, " ");
      if (collapsed === "") continue;
      const last = cell ? rowCells[rowCells.length - 1] ?? "" : out[out.length - 1] ?? "";
      const afterBlank = last === "" || isBlank(last[last.length - 1]);
      emit(collapsed === " " && afterBlank ? "" : afterBlank ? collapsed.replace(/^ /, "") : collapsed);
      continue;
    }
    const { name } = token;
    if (DROP.has(name)) { if (token.kind === "open" && !token.selfClosing) dropDepth++; else if (token.kind === "close" && dropDepth > 0) dropDepth--; continue; }
    if (dropDepth > 0) continue;
    if (token.kind === "open") {
      if (name === "pre") { newline(2); if (md) push("```\n"); preDepth++; continue; }
      if (/^h[1-6]$/.test(name)) { newline(2); if (md) push(`${"#".repeat(Number(name[1]))} `); continue; }
      if (name === "ul" || name === "ol") { newline(lists.length === 0 ? 2 : 1); lists.push({ ordered: name === "ol", count: 0 }); continue; }
      if (name === "li") {
        newline(1);
        const list = lists[lists.length - 1] ?? { ordered: false, count: 0 };
        list.count++;
        push(`${"  ".repeat(Math.max(0, lists.length - 1))}${md ? (list.ordered ? `${list.count}. ` : "- ") : (list.ordered ? `${list.count}. ` : "• ")}`);
        continue;
      }
      if (name === "br") { if (cell) emit(" "); else push("\n"); continue; }
      if (name === "hr") { newline(2); push(md ? "---\n\n" : "\n"); continue; }
      if (name === "img") { const src = safeUrl(token.attrs.src, options.base); const alt = token.attrs.alt ?? ""; if (md && src !== null) emit(`![${alt}](${src})`); else if (alt !== "") emit(alt); continue; }
      if (name === "a") { const href = safeUrl(token.attrs.href, options.base); links.push(href); if (md && href !== null) emit("["); continue; }
      if (md && (name === "strong" || name === "b")) { emit("**"); continue; }
      if (md && (name === "em" || name === "i")) { emit("_"); continue; }
      if (md && name === "code" && preDepth === 0) { emit("`"); continue; }
      if (name === "table") { flushTable(); newline(2); continue; }
      if (name === "tr") { endRow(); continue; }
      if (name === "td" || name === "th") { cell = true; rowCells.push(""); continue; }
      if (name === "blockquote") { newline(2); if (md) push("> "); continue; }
      if (BLOCK.has(name)) { newline(name === "div" || name === "dd" || name === "dt" ? 1 : 2); continue; }
      continue;
    }
    if (name === "pre") { if (preDepth > 0) preDepth--; newline(1); if (md) push("```\n"); push("\n"); continue; }
    if (/^h[1-6]$/.test(name)) { newline(2); continue; }
    if (name === "ul" || name === "ol") { lists.pop(); newline(lists.length === 0 ? 2 : 1); continue; }
    if (name === "a") { const href = links.pop() ?? null; if (md && href !== null) emit(`](${href})`); continue; }
    if (md && (name === "strong" || name === "b")) { emit("**"); continue; }
    if (md && (name === "em" || name === "i")) { emit("_"); continue; }
    if (md && name === "code" && preDepth === 0) { emit("`"); continue; }
    if (name === "td" || name === "th") { cell = false; continue; }
    if (name === "tr") { endRow(); continue; }
    if (name === "table") { flushTable(); continue; }
    if (BLOCK.has(name)) { newline(name === "li" || name === "div" || name === "dd" || name === "dt" ? 1 : 2); continue; }
  }
  flushTable();
  return tidy(out.join(""));
}
