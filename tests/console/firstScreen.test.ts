/**
 * The console's first screen. A first-time user met a modal guide that opened by itself, a nine-field jargon strip,
 * three identical primary buttons and static "Authentication required." text. Home is now: one plain status line, one
 * hero card with one primary action, one progress line, and everything else under "More".
 */
import { readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { activationHelpHtml, installWelcomeGuide, progressLineText } from "../../src/console/assets/welcomeGuide.js";
import { initShell, topbarHtml } from "../../src/console/assets/shell.js";
import { FakeDocument } from "./fakeDom.js";

const app = readFileSync("src/console/assets/app.js", "utf8");
const fnBody = (name: string) => app.slice(app.indexOf(name), app.indexOf("\n}\n", app.indexOf(name)));

describe("welcome guide", () => {
  test("never opens by itself, even on a first visit with empty storage", () => {
    const doc = new FakeDocument();
    const win = { location: { search: "" }, localStorage: { getItem: () => null, setItem: () => undefined } };
    (installWelcomeGuide as unknown as (d: unknown, w: unknown) => void)(doc, win);
    expect(doc.getElementById("welcomeGuide")).toBeNull();
  });
});

describe("hero card", () => {
  const hero = fnBody("function firstUseCard(agentId, demoMode)");

  test("is the quieter second card: Watch an agent I already use, and Try a sample task (Native Tasks with the sample prompt)", () => {
    expect(hero.match(/class="button"/g) ?? []).toHaveLength(0);
    expect(hero).toContain('class="button secondary" id="firstUsePrimary" href="${htmlEscape(primaryActionHref(agentId))}"');
    for (const button of hero.match(/<button[^>]*>/g) ?? []) expect(button).toContain('class="secondary"');
    expect(hero).toContain("See what an AI agent really does");
    expect(hero).toContain('"Try a sample task"');
    expect(hero).toContain("No setup. Runs on this computer with no model or tools.");
    expect(hero).toContain(">Watch an agent I already use</button>");
    // Without the build card, the sample task is the page's one primary action.
    expect(readFileSync("src/console/assets/styles.css", "utf8")).toContain("#a4HomeCard[hidden] ~ #app #firstUsePrimary");
    expect(hero).toContain("I already have records: score them");
    expect(hero).toContain("Available in your own workspace: in the app choose Studio &gt; Open My Workspace, or run <code>amc up</code> in a terminal.");
  });

  // studio-ui redesign: Home's "Run a task" tile carries the first action (the top bar keeps it only in the demo).
  test("the primary label and link follow the workspace", async () => {
    const demo = topbarHtml({ demoMode: true, agent: "a b" } as never);
    expect(demo).toContain('href="./native-tasks?agent=a%20b&amp;sample=1">Try a demo task</a>');
    const { homeStartHtml } = await import("../../src/console/assets/homeView.js");
    expect(homeStartHtml({ agentId: "a b", demoMode: false })).toMatch(/id="homeRunTile" href="\.\/native-tasks\?agent=a%20b&amp;sample=1">[\s\S]*Run a task/);
    expect(homeStartHtml({ agentId: "a", demoMode: true })).toContain("Try a demo task");
  });

  test("Home's order: the first steps as a route, its steps and the progress line folded, the other ways in, then More", () => {
    const home = fnBody("async function renderHome()");
    const at = (text: string) => home.indexOf(text);
    expect(at("homeStartHtml(")).toBeGreaterThan(-1);
    expect(at("homeStartHtml(")).toBeLessThan(at("activationRouteHtml("));
    expect(at("activationRouteHtml(")).toBeLessThan(at("<summary>Show all steps</summary>"));
    expect(at("<summary>Show all steps</summary>")).toBeLessThan(at("progressLineText("));
    expect(at("progressLineText(")).toBeLessThan(at('card("Activation path"'));
    expect(at('moreInfo("Other ways in", firstUseCard(agentId, demoMode))')).toBeGreaterThan(at('card("Activation path"'));
    const more = at('<details id="homeMore" class="home-more">');
    expect(more).toBeGreaterThan(at('moreInfo("Other ways in"'));
    for (const block of ["quick-action-grid", "studio-kpi-grid", "Overall Trend", "renderApiQuickstart("]) expect(at(block), block).toBeGreaterThan(more);
    expect(home).toContain("${latestRun ? `");
    expect(home).toContain('getElementById("homeMore")?.querySelector("summary")?.after(claimStrip)');
    expect(home).not.toContain("welcomeCardHtml");
  });
});

describe("progress line", () => {
  test("counts the four outcomes and names the next one in plain words", () => {
    expect(progressLineText(null)).toBe("Your progress: 0 of 4. Next: run one task with a real model or your connected agent (the stand-in model does not count).");
    expect(progressLineText({ agentId: "default", progress: { completed: 0, total: 4 }, milestones: [] })).toMatch(/^Your progress for agent default: 0 of 4\./);
    const rows = (statuses: string[]) => ["connected_agent", "observed_action", "control_decision", "signed_proof"]
      .map((id, index) => ({ id, status: statuses[index] }));
    expect(progressLineText({ progress: { completed: 2, total: 4 }, milestones: rows(["COMPLETE", "COMPLETE", "WAITING", "WAITING"]) }))
      .toBe("Your progress: 2 of 4. Next: turn on control mode.");
    expect(progressLineText({ progress: { completed: 4, total: 4 }, milestones: rows(["COMPLETE", "COMPLETE", "COMPLETE", "COMPLETE"]) }))
      .toBe("Your progress: 4 of 4. All steps done.");
    expect(progressLineText({ progress: { completed: 0, total: 4 }, milestones: rows(["BLOCKED", "WAITING", "WAITING", "WAITING"]) }))
      .toContain("Needs attention");
  });

  test("step 3 names the control-mode command itself instead of pointing at a Next line that shows another command", () => {
    const help = activationHelpHtml({ id: "control_decision", status: "WAITING" }, "<x>");
    expect(help).not.toContain("shown under Next");
    expect(help).toContain("amc connect hooks install --provider claude-code --agent &lt;x&gt; --mode control");
  });
});

describe("status strip and session line", () => {
  test("one plain line first; the nine fields and their help sit under Details; kill switch and freeze stay outside", () => {
    const banner = fnBody("async function refreshUnifiedBanner()");
    const write = banner.slice(banner.indexOf("bannerEl.innerHTML = `${killLine}${freezeLine}"));
    expect(write.indexOf("plainStatusLine(")).toBeLessThan(write.indexOf('<details class="uc-details">'));
    expect(write.indexOf('<details class="uc-details">')).toBeLessThan(write.indexOf("<strong>Unified Clarity</strong>"));
    expect(write.indexOf("${bannerHelpHtml()}")).toBeLessThan(write.indexOf("</details>"));
    const plain = fnBody("function plainStatusLine(");
    expect(plain).toContain('"Demo workspace"');
    expect(plain).toContain('"No results yet"');
    expect(plain).toContain("Records check out");
    expect(plain).toContain("<strong>Needs attention:</strong>");
  });

  test("a newest run whose seal fails is named as a problem, never \"Records check out\"", () => {
    const context = vm.createContext({ htmlEscape: (text: string) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
      currentWorkspaceLabel: () => "local" });
    vm.runInContext(fnBody("function plainStatusLine(") + "\n}", context);
    const line = context.plainStatusLine as (state: Record<string, unknown>) => string;
    const healthy = { readOnly: false, notaryBroken: false, transparencyOk: true, hasResult: true };
    const broken = line({ ...healthy, latestSealVerified: false });
    expect(broken).toContain("<strong>Needs attention:</strong>");
    expect(broken).toContain("does not pass its seal check");
    expect(broken).not.toContain("Records check out");
    expect(broken).not.toContain("Results ready");
    expect(line({ ...healthy, latestSealVerified: true })).toContain("Results ready · Records check out");
    expect(line({ ...healthy, hasResult: false, latestSealVerified: null })).toContain("No results yet · Records check out");
    const banner = fnBody("async function refreshUnifiedBanner()");
    expect(banner).toContain("latestSealVerified: agentStatus?.latestRun ? agentStatus.latestRun.sealVerified === true : null");
  });

  test("a run whose seal fails never shows the file's own trust label, integrity or claim state", () => {
    const context = vm.createContext({ htmlEscape: (text: string) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
      formatTime: String, shortId: String });
    const src = app.slice(app.indexOf("const UNTRUSTED_SEAL_LABEL"), app.indexOf("// Studio has no work-order read route"));
    vm.runInContext(src.replace("const UNTRUSTED_SEAL_LABEL", "var UNTRUSTED_SEAL_LABEL"), context);
    const tampered = { runId: "r1", status: "VALID", trustLabel: "HIGH TRUST", claimEligible: true, sealVerified: false };
    const summary = (context.runStateSummary as (a: string, r: unknown) => string)("a", tampered);
    expect(summary).toContain("UNTRUSTED (seal check fails)");
    expect(summary).not.toContain("HIGH TRUST");
    expect(summary).toContain("status <strong>INVALID</strong>");
    expect(summary).not.toContain("ELIGIBLE");
    expect((context.runStateWarning as (r: unknown) => string)(tampered)).toContain("does not pass its seal check");
    expect((context.runStateWarning as (r: unknown) => string)({ ...tampered, sealVerified: true })).toBe("");
    const banner = fnBody("async function refreshUnifiedBanner()");
    const guard = banner.slice(banner.indexOf("if (runSealFails(agentStatus.latestRun))"));
    expect(guard.slice(0, guard.indexOf("}"))).toMatch(/trustLabel = UNTRUSTED_SEAL_LABEL;\s+integrity = null;\s+claimEligible = false;/);
    expect(banner.indexOf("if (runSealFails(agentStatus.latestRun))")).toBeGreaterThan(banner.indexOf("trustLabel = String(report.trustLabel"));
    expect(banner.indexOf("if (runSealFails(agentStatus.latestRun))")).toBeLessThan(banner.indexOf("<summary>Details</summary>"));
  });

  test("one wording: Signed in as <name>, with (view only) for a viewer", () => {
    expect(app).not.toContain("Logged in as");
    expect(app).toContain('setStatus(`Signed in as ${me.username}${viewOnly ? " (view only)" : ""}`);');
  });
});

describe("top bar", () => {
  // studio-ui redesign: Sign out is the person at the foot of the rail, so the top bar never carries it.
  test("has no Open Standard shortcut and no Sign out; it opens the guide", () => {
    const me = { username: "demo" };
    expect(topbarHtml({ me } as never)).not.toContain("Open Standard");
    expect(topbarHtml({ me, demoMode: true } as never)).not.toContain("Sign out");
    expect(topbarHtml({ me, demoMode: false } as never)).not.toContain("Sign out");
    expect(topbarHtml({} as never)).toContain('id="guideOpenLink" href="./home?guide=1" title="How AMC works">');
    expect(topbarHtml({} as never)).toContain('<span class="visually-hidden">How AMC works</span></a>');
  });
});

describe("before the scripts start", () => {
  test.each(["home", "login"])("%s.html says Starting AMC, has a noscript line and a delayed help note, no static auth text", (name) => {
    const html = readFileSync(`src/console/pages/${name}.html`, "utf8");
    expect(html).toContain('<div id="ucBanner" class="card banner muted">Starting AMC…</div>');
    expect(html).not.toContain("Authentication required.");
    expect(html).toMatch(/<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
    expect(html).toContain('<p class="boot-note muted">Still blank? Press ⌘R (Ctrl+R). If it stays blank, run <code>amc doctor</code> in a terminal.</p>');
  });

  test("the note appears by CSS after a delay and the shell removes it once scripts run", () => {
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    expect(styles).toMatch(/\.boot-note \{\s*visibility: hidden;\s*animation: boot-note-show 0s linear 8s forwards;/);
    const doc = new FakeDocument();
    doc.body.appendChild(doc.el("main", {}, [doc.el("p", { class: "boot-note muted" }, "Still blank?")]));
    initShell(doc);
    expect(doc.querySelectorAll(".boot-note")).toHaveLength(0);
  });

  test("no console page keeps the old static banner or status text", () => {
    for (const file of readdirSync("src/console/pages").filter((name) => name.endsWith(".html"))) {
      const html = readFileSync(`src/console/pages/${file}`, "utf8");
      expect(html, file).not.toContain("Unified Clarity loading");
      expect(html, file).not.toContain(">Authentication required.</p>");
    }
  });
});
