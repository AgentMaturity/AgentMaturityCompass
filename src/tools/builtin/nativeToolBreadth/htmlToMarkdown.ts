/**
 * HTML to markdown or plain text for `web_fetch` (SH-TOOLS-03), with no dependency and no DOM.
 *
 * One linear pass over the input with an iterative tokenizer (tags, comments, CDATA, text), a small element table,
 * and a stack of open inline marks. Rendering is lossy by design: `script`, `style`, `noscript`, `template`, `svg`,
 * `iframe`, `object`, `embed` and comments are dropped with their content; every attribute but `href`, `src` and
 * `alt` is ignored; entities are decoded; whitespace collapses as a browser collapses it outside `pre`. Links are
 * resolved against the response URL and kept only for `http`, `https` and `mailto`. The `html` format keeps the raw
 * body, and the receipt digests the body as received, so the evidence is never the rendering.
 */

const DROP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "embed", "head", "title", "math"]);
const BLOCK = new Set(["p", "div", "section", "article", "main", "header", "footer", "nav", "aside", "blockquote", "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "br", "dl", "dt", "dd", "figure", "figcaption", "details", "summary", "form", "fieldset", "address"]);
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", copy: "©", reg: "®",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•", times: "×", euro: "€", pound: "£", yen: "¥", deg: "°" };

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

/** Iterative: no recursion, so nesting depth never matters. */
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
    const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/.exec(html.slice(lt, lt + 65_536));
    if (match === null) { tokens.push({ kind: "text", text: "<" }); at = lt + 1; continue; }
    const name = match[2]!.toLowerCase();
    if (match[1] === "/") tokens.push({ kind: "close", name });
    else {
      tokens.push({ kind: "open", name, attrs: attributes(match[3] ?? ""), selfClosing: /\/\s*$/.test(match[3] ?? "") || VOID.has(name) });
      // Raw-text elements: everything to the matching close tag is one text token (dropped for script/style).
      if (name === "script" || name === "style" || name === "textarea") {
        const close = new RegExp(`</${name}\\s*>`, "i");
        const rest = html.slice(lt + match[0].length);
        const closeAt = rest.search(close);
        tokens.push({ kind: "text", text: closeAt === -1 ? rest : rest.slice(0, closeAt) });
        tokens.push({ kind: "close", name });
        at = closeAt === -1 ? html.length : lt + match[0].length + closeAt + rest.slice(closeAt).match(close)![0].length;
        continue;
      }
    }
    at = lt + match[0].length;
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

/** Render an HTML document as markdown or plain text. Never throws on malformed input. */
export function renderHtml(html: string, options: RenderOptions): string {
  const md = options.format === "markdown";
  const out: string[] = [];
  let dropDepth = 0;
  let preDepth = 0;
  const lists: Array<{ ordered: boolean; count: number }> = [];
  const links: Array<string | null> = [];
  let cell = false;
  let rowCells: string[] = [];
  let tableRows: string[][] = [];
  const emit = (text: string): void => { if (cell) rowCells[rowCells.length - 1] = `${rowCells[rowCells.length - 1] ?? ""}${text}`; else out.push(text); };
  const newline = (count = 1): void => {
    if (cell) return;
    const joined = out.join("");
    const trailing = joined.length - joined.replace(/\n+$/, "").length;
    if (joined.length === 0) return;
    if (trailing < count) out.push("\n".repeat(count - trailing));
  };
  const flushTable = (): void => {
    if (tableRows.length === 0) return;
    const width = Math.max(...tableRows.map((row) => row.length));
    const rows = tableRows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
    if (md) {
      out.push(rows.map((row, index) => `| ${row.join(" | ")} |${index === 0 ? `\n| ${row.map(() => "---").join(" | ")} |` : ""}`).join("\n"));
    } else out.push(rows.map((row) => row.join("\t")).join("\n"));
    out.push("\n\n");
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
      emit(collapsed === " " && (last === "" || /\s$/.test(last)) ? "" : (last === "" || /\s$/.test(last)) ? collapsed.replace(/^ /, "") : collapsed);
      continue;
    }
    const { name } = token;
    if (DROP.has(name)) { if (token.kind === "open" && !token.selfClosing) dropDepth++; else if (token.kind === "close" && dropDepth > 0) dropDepth--; continue; }
    if (dropDepth > 0) continue;
    if (token.kind === "open") {
      if (name === "pre") { newline(2); if (md) out.push("```\n"); preDepth++; continue; }
      if (/^h[1-6]$/.test(name)) { newline(2); if (md) out.push(`${"#".repeat(Number(name[1]))} `); continue; }
      if (name === "ul" || name === "ol") { newline(lists.length === 0 ? 2 : 1); lists.push({ ordered: name === "ol", count: 0 }); continue; }
      if (name === "li") {
        newline(1);
        const list = lists[lists.length - 1] ?? { ordered: false, count: 0 };
        list.count++;
        out.push(`${"  ".repeat(Math.max(0, lists.length - 1))}${md ? (list.ordered ? `${list.count}. ` : "- ") : (list.ordered ? `${list.count}. ` : "• ")}`);
        continue;
      }
      if (name === "br") { if (cell) emit(" "); else out.push("\n"); continue; }
      if (name === "hr") { newline(2); out.push(md ? "---\n\n" : "\n"); continue; }
      if (name === "img") { const src = safeUrl(token.attrs.src, options.base); const alt = token.attrs.alt ?? ""; if (md && src !== null) emit(`![${alt}](${src})`); else if (alt !== "") emit(alt); continue; }
      if (name === "a") { const href = safeUrl(token.attrs.href, options.base); links.push(href); if (md && href !== null) emit("["); continue; }
      if (md && (name === "strong" || name === "b")) { emit("**"); continue; }
      if (md && (name === "em" || name === "i")) { emit("_"); continue; }
      if (md && name === "code" && preDepth === 0) { emit("`"); continue; }
      if (name === "table") { newline(2); tableRows = []; continue; }
      if (name === "tr") { rowCells = []; continue; }
      if (name === "td" || name === "th") { cell = true; rowCells.push(""); continue; }
      if (name === "blockquote") { newline(2); if (md) out.push("> "); continue; }
      if (BLOCK.has(name)) { newline(name === "div" || name === "dd" || name === "dt" ? 1 : 2); continue; }
      continue;
    }
    if (name === "pre") { if (preDepth > 0) preDepth--; newline(1); if (md) out.push("```\n"); out.push("\n"); continue; }
    if (/^h[1-6]$/.test(name)) { newline(2); continue; }
    if (name === "ul" || name === "ol") { lists.pop(); newline(lists.length === 0 ? 2 : 1); continue; }
    if (name === "a") { const href = links.pop() ?? null; if (md && href !== null) emit(`](${href})`); continue; }
    if (md && (name === "strong" || name === "b")) { emit("**"); continue; }
    if (md && (name === "em" || name === "i")) { emit("_"); continue; }
    if (md && name === "code" && preDepth === 0) { emit("`"); continue; }
    if (name === "td" || name === "th") { cell = false; continue; }
    if (name === "tr") { cell = false; if (rowCells.length > 0) tableRows.push(rowCells.map((text) => text.trim().replace(/\|/g, "\\|"))); rowCells = []; continue; }
    if (name === "table") { cell = false; flushTable(); continue; }
    if (BLOCK.has(name)) { newline(name === "li" || name === "div" || name === "dd" || name === "dt" ? 1 : 2); continue; }
  }
  flushTable();
  return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
