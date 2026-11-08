import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../src/workspace.js";
import { signToolsConfig, toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import type { NativeReceipt, NativeReceiptRecorder } from "../src/tools/builtin/nativeToolBreadth/nativeReceipt.js";
import { decodeEntities, renderHtml } from "../src/tools/builtin/nativeToolBreadth/htmlToMarkdown.js";
import { webFetchTool } from "../src/tools/builtin/webFetchTool.js";

/**
 * web_fetch HTML rendering (SH-TOOLS-03): the renderer is lossy on purpose and never lets an element through that a
 * browser would execute; the tool delivers markdown by default, text or the raw html on request, and the receipt
 * names the format and digests the body as received.
 */
const base = "https://docs.example.org/guide/intro.html";
const md = (html: string): string => renderHtml(html, { format: "markdown", base });
const text = (html: string): string => renderHtml(html, { format: "text", base });

describe("renderHtml", () => {
  it("renders headings, paragraphs, emphasis, inline code, lists and resolved links", () => {
    const out = md(`<html><head><title>T</title><style>p{}</style></head><body>
      <h1>Title</h1><p>Some <strong>bold</strong> and <em>it</em> with <code>x &lt; y</code>.</p>
      <ul><li>one <a href="../api/">API</a></li><li>two<ul><li>nested</li></ul></li></ul>
      <ol><li>first</li><li>second</li></ol></body></html>`);
    expect(out).toBe([
      "# Title", "", "Some **bold** and _it_ with `x < y`.", "",
      "- one [API](https://docs.example.org/api/)", "- two", "  - nested", "", "1. first", "2. second"
    ].join("\n"));
    expect(out).not.toContain("T\n");
  });

  it("drops script, style, noscript, template, svg, iframe and comments with their content, as elements", () => {
    const out = md(`<p>before</p><script>alert("<b>x</b>")</script><style>.a{}</style><noscript><img src=x></noscript>
      <template><p>t</p></template><svg><text>s</text></svg><iframe src="https://e.org"></iframe><!-- <p>c</p> --><p>after</p>`);
    expect(out).toBe("before\n\nafter");
    // The property: no element tag survives; the text `&lt;script&gt;` is text and may.
    expect(md("<p>say &lt;script&gt; aloud</p>")).toBe("say <script> aloud");
    expect(/<(script|style|iframe|svg|img|a)\b/i.test(md(`<p>a<script>1</script><img src="/i.png" alt="pic"><a href="/x">l</a></p>`))).toBe(false);
  });

  it("keeps only http, https and mailto links and resolves relative ones; images carry alt and src", () => {
    const out = md(`<a href="javascript:alert(1)">js</a> <a href="data:text/html,hi">data</a> <a href="mailto:a@b.c">mail</a>
      <a href="/root">root</a> <a href="https://other.org/p">abs</a><img src="pics/a.png" alt="A pic"><img src="javascript:x" alt="bad">`);
    expect(out).toBe("js data [mail](mailto:a@b.c) [root](https://docs.example.org/root) [abs](https://other.org/p)![A pic](https://docs.example.org/guide/pics/a.png)bad");
  });

  it("fences pre blocks verbatim, renders tables as pipe rows and blockquotes", () => {
    const out = md(`<pre><code>if (a &lt; b) {\n  go();\n}</code></pre>
      <table><tr><th>Name</th><th>Size</th></tr><tr><td>a|b</td><td>1</td></tr></table><blockquote>q</blockquote>`);
    expect(out).toBe("```\nif (a < b) {\n  go();\n}\n```\n\n| Name | Size |\n| --- | --- |\n| a\\|b | 1 |\n\n> q");
  });

  it("text format carries no markdown syntax", () => {
    expect(text(`<h1>T</h1><p><strong>b</strong> <a href="/x">l</a> <code>c</code></p><ul><li>i</li></ul>`)).toBe("T\n\nb l c\n\n• i");
  });

  it("never throws on malformed input and decodes entities", () => {
    for (const bad of ["<p", "<p>unclosed <b>bold", "</div></div>", "<a href='x", "<!-- open", "<![CDATA[raw <b>", "<" + "<".repeat(100), "&#xZZ; &unknown; &#0;"]) {
      expect(() => md(bad)).not.toThrow();
    }
    expect(md("<p>&amp;&lt;&gt;&quot;&#39;&#x41;&nbsp;&hellip;&unknown;</p>")).toBe("&<>\"'A …&unknown;");
    expect(decodeEntities("&#1114112;")).toBe("&#1114112;");
    const deep = `${"<div>".repeat(5_000)}deep${"</div>".repeat(5_000)}`;
    expect(md(deep)).toBe("deep");
  });
});

let server: Server;
let origin: string;
let workspace: string;
let calls = 0;
const exec = (args: Record<string, unknown>): ToolExecution => ({
  token: `t${++calls}`, callId: `c${calls}`, rootCallId: `c${calls}`, name: "web_fetch", agentId: "default", workspace,
  actionClass: "NETWORK_EXTERNAL", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: args, parentToken: null
});
const PAGE = `<html><head><title>Guide</title><script>steal()</script></head><body><h1>Guide</h1><p>Read <a href="/next">next</a>.</p></body></html>`;

beforeAll(async () => {
  process.env.AMC_VAULT_PASSPHRASE ??= "html-render-fixture-pass";
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://x");
    if (url.pathname === "/page") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(PAGE); return; }
    if (url.pathname === "/x.xhtml") { response.setHeader("content-type", "application/xhtml+xml"); response.end(PAGE); return; }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ html: "<b>not rendered</b>" }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-html-fetch-")));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const tools = YAML.parse(readFileSync(toolsConfigPath(workspace), "utf8")) as { tools: { allowedTools: unknown[] } };
  tools.tools.allowedTools.push({ name: "web_fetch", actionClass: "NETWORK_EXTERNAL", allow: { hostAllowlist: [origin, "127.0.0.1"] } });
  writeFileSync(toolsConfigPath(workspace), YAML.stringify(tools));
  signToolsConfig(workspace);
}, 60_000);

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  rmSync(workspace, { recursive: true, force: true });
});

describe("web_fetch format", () => {
  const fetchTool = () => {
    const receipts: NativeReceipt[] = [];
    const record: NativeReceiptRecorder = (_execution, receipt) => { receipts.push(receipt); };
    return { receipts, tool: webFetchTool({ record, resolve: async () => ["127.0.0.1"] }) };
  };

  it("delivers HTML as markdown by default, under the untrusted fence, with the format and rendered size on the receipt", async () => {
    const { tool, receipts } = fetchTool();
    const result = await tool.body(exec({ url: `${origin}/page` }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain(`# Guide\n\nRead [next](${origin}/next).`);
    expect(result.output).not.toContain("steal()");
    expect(result.output).not.toContain("<h1>");
    const receipt = receipts.at(-1) as Record<string, unknown>;
    expect(receipt).toMatchObject({ auditType: "NATIVE_WEB_FETCH", decision: "allow", format: "markdown", bytes: Buffer.byteLength(PAGE) });
    expect(receipt.renderedBytes).toBeLessThan(PAGE.length);
  });

  it("delivers plain text, the raw html on request, and treats xhtml as html", async () => {
    const { tool, receipts } = fetchTool();
    expect((await tool.body(exec({ url: `${origin}/page`, format: "text" }))).output).toContain("Guide\n\nRead next.");
    expect(receipts.at(-1)).toMatchObject({ format: "text" });
    const raw = await tool.body(exec({ url: `${origin}/page`, format: "html" }));
    expect(raw.output).toContain("<h1>Guide</h1>");
    expect(raw.output).toContain("steal()");
    expect(receipts.at(-1)).toMatchObject({ format: "html", renderedBytes: Buffer.byteLength(PAGE) });
    expect((await tool.body(exec({ url: `${origin}/x.xhtml` }))).output).toContain("# Guide");
  });

  it("leaves non-HTML bodies alone whatever the format, and refuses an unknown format before any request", async () => {
    const { tool, receipts } = fetchTool();
    const json = await tool.body(exec({ url: `${origin}/data.json`, format: "markdown" }));
    expect(json.output).toContain("<b>not rendered</b>");
    expect(receipts.at(-1)).toMatchObject({ format: "html" });
    await expect(tool.body(exec({ url: `${origin}/page`, format: "pdf" }))).rejects.toThrow();
  });
});
