/**
 * LIVE-UX-08: the docs viewer treated an in-page `#anchor` link as a doc route and showed the welcome page (11 public
 * guides, INSTALL.md's Option B link included), and QUICKSTART's SDK block installed the npm 1.1.1 release. docs.js is
 * evaluated unmodified: PUBLIC_DOCS is a script-level const, so the real allowlist decides.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

type Route = { available: boolean; docName?: string; section?: string } | null;
const context: Record<string, unknown> = { URL, console };
runInNewContext(readFileSync("website/docs/docs.js", "utf8"), context, { filename: "website/docs/docs.js" });
const resolveLink = context.resolveRenderedGuideLink as (docName: string, href: string) => Route;

describe("resolveRenderedGuideLink", () => {
  test("an in-page anchor stays on the current guide and names the section", () => {
    expect(resolveLink("QUICKSTART", "#2-run-amc-in-your-agent-project")).toEqual({
      available: true, docName: "QUICKSTART", section: "2-run-amc-in-your-agent-project"
    });
    expect(resolveLink("INSTALL", "#option-b-from-github-development")).toEqual({
      available: true, docName: "INSTALL", section: "option-b-from-github-development"
    });
    expect(resolveLink("INSTALL", "#caf%C3%A9")).toMatchObject({ section: "café" });
  });

  test("a bare # is left alone, and cross-guide and external links resolve as before", () => {
    expect(resolveLink("QUICKSTART", "#")).toBeNull();
    expect(resolveLink("QUICKSTART", "INSTALL.md#option-b")).toEqual({ available: true, docName: "INSTALL", section: "option-b" });
    expect(resolveLink("QUICKSTART", "https://example.com/x")).toBeNull();
    expect(resolveLink("QUICKSTART", "NOT_A_PUBLIC_GUIDE.md")).toEqual({ available: false });
  });
});

describe("QUICKSTART truth", () => {
  const quickstart = readFileSync("docs/QUICKSTART.md", "utf8");

  test("the 1.1.1 sentences say most steps apply in an older form and connect hooks is new", () => {
    expect(quickstart).toContain("1.1.1 has most of the evidence-score steps");
    expect(quickstart).toContain("in an older form; `amc connect hooks` (step 3) is new in the source build");
    expect(quickstart).toContain("Most of steps 2 to 5 apply in their 1.1.1 form; `amc connect hooks` (step 3) is new in the source build.");
  });

  test("the SDK block installs the source build's tarball, not the npm 1.1.1 release", () => {
    const sdk = quickstart.slice(quickstart.indexOf("### TypeScript SDK path"));
    const block = sdk.slice(sdk.indexOf("```bash"), sdk.indexOf("```", sdk.indexOf("```bash") + 7));
    expect(block).not.toContain("npm install agent-maturity-compass");
    expect(block).toContain("npm install <the .tgz that npm pack --ignore-scripts wrote in the checkout>   # not the npm 1.1.1 release");
    expect(block).toContain("npx amc init --coding");
  });
});
