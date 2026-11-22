/**
 * Console pages a first-time user found broken or confusing in the view-only demo (2026-11-14 browser audit): Fleet
 * crashed on an undefined helper, Login offered a second sign-in to a signed-in user, Agent/Drift/Work Orders disagreed
 * about the same run, Outcomes called zero metrics "all satisfied", Assurance showed an ERROR run's number as a score,
 * Home and Approvals asked the A4 routes the demo session is always refused, and greyed-out controls never said why.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { roleGateNoteText } from "../../src/console/assets/api.js";
import { renderScoreGauge } from "../../src/console/assets/components/scoreGauge.js";
import { loginCardHtml } from "../../src/console/assets/loginView.js";
import { plainCodeHtml } from "../../src/console/assets/plainError.js";
import * as dailyView from "../../src/console/assets/dailyView.js";
import { emptyState, moreInfo } from "../../src/console/assets/pageKit.js";

const app = readFileSync("src/console/assets/app.js", "utf8");
const bodyOf = (source: string, signature: string): string => {
  const start = source.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
};
const escape = (text: unknown) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

describe("Fleet", () => {
  test("the graph card's metric() helper is defined, escapes, and renders into the existing KPI grid", () => {
    const context = vm.createContext({ htmlEscape: escape });
    vm.runInContext(bodyOf(app, "function metric(label, value)"), context);
    const html = (context.metric as (label: string, value: unknown) => string)("Nodes", "<0>");
    expect(html).toContain('class="card studio-kpi"');
    expect(html).toContain("&lt;0&gt;");
    expect(bodyOf(app, "async function renderFleetLifecycle()")).toContain('<div class="studio-kpi-grid">');
    expect(app).not.toContain("metric-grid");
  });
});

describe("Login while signed in", () => {
  test("the login page asks who is signed in and shows them instead of the form", () => {
    const render = bodyOf(app, "async function renderPage()");
    expect(render).toMatch(/if \(page === "login"\) \{\s*const signedIn = await whoami\(\)\.catch\(\(\) => null\);\s*if \(signedIn\) renderSignedIn\(signedIn\);/);
    const signedIn = bodyOf(app, "function renderSignedIn(me)");
    expect(signedIn).toContain('" (view only)"');
    expect(signedIn).toContain('href="./home"');
    expect(signedIn).toContain('id="loginSignOutBtn"');
  });

  test("the demo note no longer sends a beginner to the emergency admin token", () => {
    const demo = loginCardHtml({ demoMode: true });
    const banner = demo.match(/<p class="banner">[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(banner).toContain("Local demo mode");
    expect(banner).not.toMatch(/admin token/i);
  });
});

describe("one run state across Agent, Drift and Work Orders", () => {
  const context = vm.createContext({ htmlEscape: escape, plainCodeHtml });
  vm.runInContext([bodyOf(app, "function shortId(value"), bodyOf(app, "function formatTime(value)"),
    bodyOf(app, "const UNTRUSTED_SEAL_LABEL"), bodyOf(app, "function runStateSummary(agentId, latestRun)"), bodyOf(app, "function runStateWarning(latestRun)")].join("\n"), context);
  const summary = context.runStateSummary as (agentId: string, run: unknown) => string;
  const warning = context.runStateWarning as (run: unknown) => string;

  test("no run says so in plain words; an unusable run keeps its warning visible", () => {
    expect(summary("default", null)).toContain("No run yet for agent <strong>default</strong>");
    expect(warning(null)).toBe("");
    const invalid = { runId: "run-1", ts: 0, status: "INVALID", trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS", claimEligible: false };
    expect(summary("default", invalid)).toContain('status <strong><span class="code-word" title="Code: INVALID">Does not check out</span></strong>');
    expect(summary("default", invalid)).toContain('claims <strong><span class="code-word" title="Code: BLOCKED">Blocked</span></strong>');
    expect(warning(invalid)).toContain("UNRELIABLE — DO NOT USE FOR CLAIMS");
    expect(warning(invalid)).toContain('class="status-bad"');
    expect(warning({ ...invalid, status: "VALID", trustLabel: "HIGH TRUST" })).toBe("");
  });

  test("Agent shows neither the file's own status nor its seal sentence when Studio's seal check fails", async () => {
    const root = { innerHTML: "" };
    let bars = 0;
    const report = { status: "VALID", integrityIndex: 0.99, trustLabel: "HIGH TRUST", evidenceCoverage: 0.9,
      layerScores: [{ avgFinalLevel: 3.25 }, { avgFinalLevel: 2.75 }],
      evidenceReadiness: { status: "READY", claimEligible: true, claimBoundary: "The artifact seal is valid, but no accepted evidence supports the score." } };
    const latestRun = { runId: "run-1", ts: 0, status: "VALID", trustLabel: "HIGH TRUST", claimEligible: true, sealVerified: false };
    const agent = vm.createContext({ ...dailyView, emptyState, moreInfo, htmlEscape: escape, plainCodeHtml, root, currentAgent: () => "default", card: (t: string, b: string) => `<h3>${t}</h3>${b}`,
      apiGet: async (path: string) => path.endsWith("/status") ? { latestRun } : report, renderBars: () => { bars += 1; }, bindFullScore: () => {}, document: { getElementById: () => null } });
    vm.runInContext([bodyOf(app, "function shortId(value"), bodyOf(app, "function formatTime(value)"), bodyOf(app, "const UNTRUSTED_SEAL_LABEL"),
      bodyOf(app, "function runStateSummary(agentId, latestRun)"), bodyOf(app, "function runStateWarning(latestRun)"), bodyOf(app, "async function renderAgent()")].join("\n"), agent);
    await (agent.renderAgent as () => Promise<void>)();
    expect(root.innerHTML).toContain('Artifact status: <strong><span class="code-word" title="Code: INVALID">Does not check out</span></strong>');
    expect(root.innerHTML).not.toMatch(/seal is valid|HIGH TRUST|0\.990|ELIGIBLE|READY|90\.0%|3\.000|layerBars/);
    expect(root.innerHTML).toContain('Evidence Readiness: <strong><span class="code-word" title="Code: UNVERIFIED">Not verified</span></strong>');
    expect(bars).toBe(0);
  });

  test("all three pages use the shared sentence, and none dumps raw JSON as its body", () => {
    expect(bodyOf(app, "async function renderAgent()")).toContain("runStateSummary(agentId, row.latestRun)");
    expect(bodyOf(app, "async function renderWorkOrders()")).toContain("jsonDetails(runStateSummary(agentId, status.latestRun), status)");
    const drift = app.slice(app.indexOf('if (page === "drift")'), app.indexOf('if (page === "benchmarks")'));
    expect(drift).toContain("jsonDetails(runStateSummary(agentId, status.latestRun), status)");
    expect(drift).not.toContain("JSON.stringify(status");
    expect(app).not.toContain("No run found.");
    expect(app).toContain('if (page === "workorders") return await renderWorkOrders();');
  });

  test("Compare summarises the comparison and keeps the JSON collapsed", () => {
    const compare = bodyOf(app, "async function renderCompare()");
    expect(compare).toContain('<div id="cmpOut" aria-live="polite"></div>');
    expect(compare).toContain("jsonDetails(");
    expect(compare).not.toContain("out.textContent = displayJson");
  });
});

describe("Outcomes with nothing tracked", () => {
  test("says Nothing tracked yet instead of all satisfied, and collapses the raw objects", () => {
    const outcomes = bodyOf(app, "async function renderOutcomes()");
    expect(outcomes).toContain("Nothing tracked yet, so there is nothing to satisfy.");
    expect(outcomes).toMatch(/metricRows\.length === 0\s*\? "<p class='muted'>Nothing tracked yet, so there is nothing to satisfy\.<\/p>"/);
    expect(outcomes).not.toContain("JSON.stringify(report.categoryScores");
    expect(outcomes).toContain('card("Report Metadata", jsonDetails(');
  });
});

describe("Assurance", () => {
  test("an ERROR run is shown as an error, never as a score", () => {
    const html = renderScoreGauge({ label: "Risk Assurance Score", score: 67.6, status: "ERROR" });
    expect(html).toContain("status-bad");
    expect(html).toContain("Error:");
    expect(html).not.toContain("67.6");
    expect(html).not.toContain("/100");
    expect(renderScoreGauge({ label: "Risk Assurance Score", score: 91, status: "PASS" })).toContain("91.0/100");
  });

  test("its write buttons are role-gated like the other write controls", () => {
    const assurance = readFileSync("src/console/assets/assurance.js", "utf8");
    expect(assurance).toContain('id="assuranceRunNow" data-roles="OWNER,OPERATOR"');
    expect(assurance).toContain('id="assuranceIssueCert" class="secondary" data-roles="OWNER,OPERATOR"');
    expect(assurance).toContain('id="assuranceRequestWaiver" class="secondary" data-roles="OWNER"');
  });
});

describe("the view-only line", () => {
  test("names amc up for the demo and the roles otherwise", () => {
    expect(roleGateNoteText({ userId: "local-demo", roles: ["VIEWER"] }))
      .toBe("View-only demo. To use this, start your own workspace: run amc up in a terminal.");
    expect(roleGateNoteText({ userId: "u1", roles: ["VIEWER", "AUDITOR"] }))
      .toBe("Your role (VIEWER, AUDITOR) cannot use the greyed-out controls on this page.");
  });

  test("applyRoleGates inserts it once, outside #app, only when it disabled a control", () => {
    const gates = bodyOf(readFileSync("src/console/assets/api.js", "utf8"), "export function applyRoleGates(");
    expect(gates).toContain('if (gated === 0 || !app || doc.getElementById("roleGateNote")) return;');
    expect(gates).toContain("app.parentNode.insertBefore(note, app);");
    expect(gates).toContain("note.textContent = roleGateNoteText(state.me);");
  });
});

describe("requests a VIEWER or the demo session is always refused", () => {
  test("Home and Approvals skip the A4 routes for the demo session before asking", () => {
    const a4 = bodyOf(readFileSync("src/console/assets/a4.js", "utf8"), "async function showHomeEntry()");
    expect(a4.indexOf('who?.userId === "local-demo"')).toBeGreaterThan(-1);
    expect(a4.indexOf('who?.userId === "local-demo"')).toBeLessThan(a4.indexOf("previewOptions()"));
    const approvals = bodyOf(readFileSync("src/console/assets/a4Approvals.js", "utf8"), "export async function a4Projects()");
    expect(approvals.indexOf('"local-demo") return [];')).toBeGreaterThan(-1);
    expect(approvals.indexOf('"local-demo") return [];')).toBeLessThan(approvals.indexOf("apiNativeRequest(API)"));
  });

  test("Org pages never recompute on open; the button that does is for OWNER or OPERATOR (C-01)", () => {
    expect(bodyOf(app, "async function loadLatestOrgScorecard()")).not.toContain("/org/scorecards/recompute");
    const empty = bodyOf(app, "function noScorecardCard(title, again)");
    expect(empty).toContain('<button id="orgScoreBuild" data-roles="OWNER,OPERATOR">');
    expect(empty).toContain('apiPost("/org/scorecards/recompute"');
    expect(app).toContain('<button id="orgRunStartBtn" data-roles="OWNER,OPERATOR">Run</button>');
  });
});

describe("operator inbox", () => {
  const source = readFileSync("src/console/assets/operator.js", "utf8");
  const start = source.indexOf("const previewOff =");
  const context = vm.createContext({ list: (value: unknown) => (Array.isArray(value) ? value : []) });
  vm.runInContext(source.slice(start, source.indexOf("\n}\n", start) + 2).replace("export function", "function"), context);
  const strip = context.withoutDisabledPreview as (inbox: unknown) => { inbox: { items: Array<{ id: string }>; sources: Record<string, string> }; a4Off: boolean };

  test("a switched-off A4 preview is not a mandatory blocker", () => {
    const out = strip({
      items: [{ id: "source:a4", kind: "source_unavailable", nextAction: "The a4 source could not be read (A4_PREVIEW_DISABLED); nothing it holds is shown as clear." },
        { id: "waiver:1", kind: "waiver_expiring", nextAction: "renew" }],
      sources: { a4: "unavailable", assuranceWaivers: "ok" }
    });
    expect(out.a4Off).toBe(true);
    expect(out.inbox.items.map((item) => item.id)).toEqual(["waiver:1"]);
    expect(out.inbox.sources).toEqual({ assuranceWaivers: "ok" });
  });

  test("any other unreadable A4 source stays a blocker", () => {
    const inbox = { items: [{ id: "source:a4", nextAction: "The a4 source could not be read (A4_STORE_CORRUPT); nothing it holds is shown as clear." }], sources: { a4: "unavailable" } };
    const out = strip(inbox);
    expect(out.a4Off).toBe(false);
    expect(out.inbox).toBe(inbox);
  });
});

describe("labels and plain subtitles", () => {
  test("the audited controls carry a visible or aria label", () => {
    for (const fragment of ['<select id="firewallMode" aria-label=', '<select id="firewallDirection" aria-label=', '<input id="firewallAgent" aria-label=',
      '<textarea id="firewallText" rows="7" aria-label=', '<label for="budgetsDraft">', '<select id="orgNodeSelect" aria-label=',
      '<span class="muted">First node</span>\n        <select id="cmpA">', '<span class="muted">Second node</span>\n        <select id="cmpB">',
      '<span class="muted">Team or group</span>\n        <select id="orgCommitNode">', '<span class="muted">Plan kind</span>\n        <select id="orgCommitKind">',
      '<span class="muted">Length</span>\n        <select id="orgCommitDays">']) {
      expect(app, fragment).toContain(fragment);
    }
  });

  test("added UI text avoids certified, compliant and guarantee wording", () => {
    const added = [bodyOf(app, "function runStateWarning(latestRun)"), bodyOf(app, "async function renderWorkOrders()"),
      bodyOf(app, "function renderSignedIn(me)"), bodyOf(app, "async function renderOrgCommitments()")].join("\n");
    expect(added).not.toMatch(/certif|compliant|guarantee/i);
  });
});

describe("load failures and untrusted text (2026-11-14 source audit)", () => {
  test("Evidence counts sections that failed to load, Transparency does not call a failed request a failed check", () => {
    expect(app).toContain("const missed = (empty) => () => { missedSections += 1; return empty; };");
    expect(app).toMatch(/\$\{missedSections\} section\(s\) could not load/);
    expect(app).toContain('merkleVerify ? (merkleVerify.ok ? "OK" : "FAILED") : "could not load');
  });

  test("the agent id from the URL and Ops server text are escaped; removing old records asks first", () => {
    expect(app).toContain("Issue lease for ${htmlEscape(currentAgent())}");
    const ops = readFileSync("src/console/assets/ops.js", "utf8");
    expect(ops).not.toMatch(/\+ String\(error\) \+/);
    expect(ops).not.toMatch(/"<pre>" \+ JSON\.stringify/);
    // Changed on purpose (C-16, C-07): the browser confirm box became a second press on the button.
    expect(ops).toMatch(/action\("retention-run", "\/ops\/retention\/run", \{ dryRun: false \}, [^)]*\n\s*"remove old records \(this cannot be undone\)"\);/);
    expect(ops).toContain("if (confirmWhat && !confirmPress(event.currentTarget, confirmWhat)) return;");
  });
});

describe("Records wording", () => {
  test("cards, columns and buttons say record, not proof, and buttons start with a capital", () => {
    const assurance = readFileSync("src/console/assets/assurance.js", "utf8");
    expect(app).not.toMatch(/Enforce Resource Proof|Finding Proofs|<th>Proof<\/th>|>activate changes<|>rollback previous</);
    expect(assurance).not.toContain("<th>Proof</th>");
    expect(app).toContain('moreInfo("Enforce resource records"');
    expect(app).toContain(">Roll back to previous</button>");
  });
});

describe("Tools page on a phone", () => {
  test("the Allowed Tools table stacks each row as labelled lines below 480 px", () => {
    const css = readFileSync("src/console/assets/styles.css", "utf8");
    expect(app).toContain('<table class="stack-table">');
    for (const label of ["Tool", "Action class", "Exec ticket", "Identity"]) expect(app).toContain(`<td data-label="${label}">`);
    expect(css).toMatch(/@media \(max-width: 480px\) \{\s*\.stack-table thead \{ display: none; \}/);
    expect(css).toContain(".stack-table td::before { content: attr(data-label);");
  });
});
