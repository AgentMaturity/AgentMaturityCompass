/**
 * The console secondary-pages lane (2026-11-16, tester report C-01 to C-30): opening a page writes nothing, a missing
 * value snapshot is not a green "OK", failures and results read in plain words, outside text is escaped, the menu says
 * who is signed in, and refusals about what the caller sent are 4xx with words instead of a 500.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { plainErrorText } from "../../src/console/assets/plainError.js";
import { codeWords, keyWords, recordRows, recordDetails, workspacePath } from "../../src/console/assets/pageKit.js";
import { renderValueEvidenceBanner } from "../../src/console/assets/components/valueEvidenceBanner.js";
import { renderNavSession } from "../../src/console/assets/shell.js";
import { renderPassportPage } from "../../src/console/assets/passport.js";
import { renderStandardPage } from "../../src/console/assets/standard.js";
import { studioInputError, studioSetupError } from "../../src/studio/studioInputErrors.js";
import { assertNewUsername, createUserRecord, UsernamePolicyError } from "../../src/auth/userSchema.js";
import { autoAnswerFromLatestRun } from "../../src/diagnostic/autoAnswer/autoAnswerEngine.js";
import { mechanicGapFromLatestRun } from "../../src/mechanic/mechanicAnalysisPublication.js";
import { readMechanicTargets } from "../../src/mechanic/targetsStore.js";

const asset = (name: string) => readFileSync(`src/console/assets/${name}`, "utf8");
const filesUnder = (dir: string): string[] => existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]) : [];

describe("C-01: opening a page writes nothing", () => {
  test("auto-answer, the mechanic gap and the targets read a workspace with no run without writing a file", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-readonly-"));
    expect(autoAnswerFromLatestRun(workspace, "default")).toBeNull();
    expect(mechanicGapFromLatestRun({ workspace, scopeType: "WORKSPACE" })).toBeNull();
    expect(readMechanicTargets(workspace).mechanicTargets.mode).toBe("DESIRED");
    expect(filesUnder(workspace)).toEqual([]);
  });

  test("the pages that used to write on open only read; writing is a button", () => {
    const simulator = asset("simulator.js"), wizard = asset("upgradeWizard.js"), passport = asset("passport.js"), app = asset("app.js");
    expect(simulator).toContain('show(await apiGet("/mechanic/simulations/latest")');
    expect(simulator.indexOf('apiPost("/mechanic/simulate"')).toBeGreaterThan(simulator.indexOf('getElementById("simRunBtn")'));
    expect(wizard).not.toContain("ensurePlan");
    expect(wizard.indexOf('apiPost("/mechanic/plan/create"')).toBeGreaterThan(wizard.indexOf('getElementById("makePlanBtn")'));
    expect(passport).not.toContain("/passport/badge");
    expect(app.slice(app.indexOf("async function loadLatestOrgScorecard()"), app.indexOf("function noScorecardCard"))).not.toContain("apiPost");
    for (const name of ["value.js", "valueAgent.js"]) {
      const source = asset(name);
      expect(source, name).not.toMatch(/"VALUE_EVIDENCE_INSUFFICIENT"\].includes/);
    }
    expect(asset("valueAgent.js")).not.toContain("/value/report");
  });
});

describe("C-02: no value data is not a green OK", () => {
  test("a missing snapshot says there is no value data and how to start", () => {
    const html = renderValueEvidenceBanner(null);
    expect(html).toContain("No value data yet.");
    expect(html).not.toContain("status-ok");
    expect(renderValueEvidenceBanner({ status: "INSUFFICIENT_EVIDENCE", reasons: ["<b>x</b>"] })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("C-10: errors in plain words", () => {
  test("class names, codes and server phrases become sentences with a next step", () => {
    expect(plainErrorText(new Error("ConsoleApiError: registryId required"))).toBe("registryId required");
    expect(plainErrorText({ message: "internal server error" })).toMatch(/^AMC Studio hit a problem it did not expect/);
    expect(plainErrorText({ message: "requires role: AUDITOR" })).toBe("This needs the auditor role. A workspace owner can give it to you on the Users page.");
    expect(plainErrorText({ message: "missing or invalid token" })).toBe("You are signed out. Sign in again to go on.");
    expect(plainErrorText({ message: "Error: action p1-approval_policy_apply requires approval request before execution" })).toMatch(/needs an approval first/);
    expect(plainErrorText({ message: "transition_illegal: agent default cannot move from proposed to proposed" })).toBe("It is already proposed; nothing to change.");
    expect(plainErrorText({ message: "BODY_INVALID: approvalRequestId must match pattern /^apprreq_[a-f0-9]{32}$/" })).toMatch(/not in the form AMC expects/);
    expect(plainErrorText(new TypeError("Failed to fetch"))).toMatch(/AMC did not answer/);
  });

  test("ConsoleApiError prints plain words wherever a page shows String(error)", async () => {
    const { ConsoleApiError } = await import("../../src/console/assets/api.js");
    expect(String(new ConsoleApiError("requires role: OWNER", 403, "HTTP_ERROR"))).toBe("This needs the owner role. A workspace owner can give it to you on the Users page.");
  });
});

describe("C-09: records read as rows, escaped", () => {
  test("rows escape outside text, shorten workspace paths, show times as dates and keep the record closed", () => {
    const html = recordRows({ lastCertStatus: "<img src=x onerror=alert(1)>", dbPath: "/private/tmp/w/.amc/evidence.sqlite", createdTs: 1794772410081, nested: { a: 1 } });
    expect(html).not.toContain("<img");
    expect(html).toContain("Last cert status");
    expect(html).toContain(".amc/evidence.sqlite");
    expect(html).not.toContain("/private/tmp");
    expect(html).not.toContain("1794772410081</td>");
    expect(html).toContain('<details class="record"><summary>Show the record</summary>');
    expect(recordDetails({ x: "</pre><script>" })).not.toContain("<script>");
    expect(keyWords("riskAssuranceScore")).toBe("Risk assurance score");
    expect(workspacePath("C:\\w\\.amc\\x.json")).toBe(".amc/x.json");
    expect(codeWords("GATE_FAIL_LOW_INTEGRITY")).toBe('<span title="GATE_FAIL_LOW_INTEGRITY">low integrity</span>');
    const maintenance = recordRows({ ts: 1794772410081, dbSizeBytes: 2850816, prunedBlobRows: 0, status: "READY" }, { record: false });
    for (const words of ["Time", "Database size", "2.9 MB", "Attachments removed", '<span title="READY">Ready</span>']) expect(maintenance).toContain(words);
    expect(maintenance).not.toContain("2850816");
  });
});

describe("menu session link", () => {
  const nav = () => {
    const link = { innerHTML: "Sign in", title: "", onclick: null as unknown };
    return { link, doc: { querySelector: (selector: string) => (selector === 'nav a[href="./login"]' ? link : null) } };
  };

  test("signed in, the menu says who and offers Sign out; signed out, Sign in", () => {
    const { link, doc } = nav();
    let signedOut = false;
    renderNavSession(doc, { userId: "u1", username: "<b>ann</b>" }, () => { signedOut = true; });
    expect(link.innerHTML).toBe('Sign out<small class="nav-desc">Signed in as &lt;b&gt;ann&lt;/b&gt;</small>');
    (link.onclick as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
    expect(signedOut).toBe(true);
    renderNavSession(doc, null);
    expect(link.innerHTML).toBe("Sign in");
    expect(link.onclick).toBeNull();
    renderNavSession(doc, { userId: "local-demo", username: "demo" });
    expect(link.innerHTML).toBe("Sign in");
  });
});

describe("C-04, C-08, C-17: refusals are 4xx with words", () => {
  test("known input refusals map to 404 or 400; anything else stays a 500", () => {
    expect(studioInputError("/advisories/x/ack", new Error("advisory not found: <x>"))?.status).toBe(404);
    expect(studioInputError("/plugins/remove", new Error("plugin is not installed: x"))?.status).toBe(404);
    expect(studioInputError("/plugins/install", new Error("registry not configured in workspace: x"))?.status).toBe(404);
    expect(studioInputError("/org/runs", new Error("Unknown org role(s): X"))?.status).toBe(400);
    const missing = studioInputError("/bench/publish", Object.assign(new Error("ENOENT: no such file, stat '/private/x'"), { code: "ENOENT" }));
    expect(missing?.status).toBe(400);
    expect(missing?.body.error).not.toContain("/private");
    expect(studioInputError("/other", Object.assign(new Error("ENOENT"), { code: "ENOENT" }))).toBeNull();
    expect(studioInputError("/x", new Error("database is locked"))).toBeNull();
  });

  test("assurance with no agent to test is a 409 that names the fix", () => {
    const refusal = studioSetupError({ code: "AGENT_RESPONDER_UNAVAILABLE", reason: "no model configured for the agent under test", remediation: "Set AMC_ASSURANCE_MODEL=<model-id>." });
    expect(refusal?.status).toBe(409);
    expect(refusal?.body.error).toContain("no model configured");
    expect(refusal?.body.error).toContain("AMC_ASSURANCE_MODEL");
    expect(refusal?.body.error).toContain("From the console: stop AMC Studio and start it again with AMC_ASSURANCE_MODEL set");
    expect(studioSetupError(new Error("other"))).toBeNull();
  });

  test("a new username is letters, digits, dots, dashes, underscores or @, at most 64", () => {
    for (const bad of ["<img src=x onerror=alert(1)>", "qa viewer", "a".repeat(65), "", "x\u202Ey"]) {
      expect(() => assertNewUsername(bad), bad).toThrow(UsernamePolicyError);
    }
    for (const good of ["ann", "ann.lee-2_x@corp", "zoë_用户", "सिद्धार्थ", "jose\u0301"]) expect(() => assertNewUsername(good), good).not.toThrow();
    expect(createUserRecord({ username: "jose\u0301", roles: ["VIEWER"], passwordHash: "h" }).username).toBe("jos\u00e9");
    expect(() => createUserRecord({ username: "qa viewer", roles: ["VIEWER"], passwordHash: "h" })).toThrow(UsernamePolicyError);
    expect(createUserRecord({ username: "  ann  ", roles: ["VIEWER"], passwordHash: "h" }).username).toBe("ann");
    expect(studioInputError("/a4/x", new UsernamePolicyError("Username must be 1 to 64 letters, digits, dots, dashes, underscores or @, with no spaces."))?.status).toBe(400);
  });
});

describe("C-16: no browser prompt or alert boxes on these pages", () => {
  test("the secondary pages ask inline", () => {
    for (const name of ["app.js", "assurance.js", "audit.js", "auditBinder.js", "auditRequests.js", "northstar.js", "passport.js"]) {
      expect(asset(name), name).not.toMatch(/window\.prompt\(|[^.\w]alert\(/);
    }
  });
});

describe("Passport page with no passport yet", () => {
  test("it says so and shows no UNTRUSTED or UNKNOWN status tiles", async () => {
    const root = { innerHTML: "" };
    const saved = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = { getElementById: () => null };
    try {
      await renderPassportPage({
        root, currentAgent: () => "<b>bot</b>", card: (title: string, body: string) => `<section><h3>${title}</h3>${body}</section>`,
        apiGet: async (path: string) => path === "/agents" ? { agents: [{ id: "default" }] } : path.startsWith("/passport/cache") ? { passport: null } : {},
        apiPost: async () => ({})
      });
    } finally {
      (globalThis as { document?: unknown }).document = saved;
    }
    expect(root.innerHTML).toContain("No passport yet for <strong>&lt;b&gt;bot&lt;/b&gt;</strong>");
    expect(root.innerHTML).not.toMatch(/UNTRUSTED|UNKNOWN|Risk avg/);
  });
});

describe("Open Standard before any schema exists", () => {
  const render = async (verify: unknown) => {
    const root = { innerHTML: "" };
    const g = globalThis as { document?: unknown; window?: unknown };
    const saved = [g.document, g.window];
    g.document = { getElementById: () => null };
    g.window = { location: { href: "http://127.0.0.1/console/standard" } };
    try {
      await renderStandardPage({
        root, card: (title: string, body: string) => `<section><h3>${title}</h3>${body}</section>`,
        apiGet: async (path: string) => path === "/standard/schemas" ? { schemas: [], verify } : {},
        apiPost: async () => ({})
      });
    } finally {
      [g.document, g.window] = saved;
    }
    return root.innerHTML;
  };

  test("a bundle whose schema files were removed still says the check failed", async () => {
    const html = await render({ ok: false, errors: ["schema missing: a.json"], meta: { schemas: [{ name: "a.json" }] } });
    expect(html).toContain("The schema bundle does not check out");
    expect(html).not.toContain("No schemas yet");
  });

  test("it names the next step instead of a failed bundle check or raw ok=false", async () => {
    const root = { innerHTML: "" };
    const g = globalThis as { document?: unknown; window?: unknown };
    const saved = [g.document, g.window];
    g.document = { getElementById: () => null };
    g.window = { location: { href: "http://127.0.0.1/console/standard" } };
    try {
      await renderStandardPage({
        root, card: (title: string, body: string) => `<section><h3>${title}</h3>${body}</section>`,
        apiGet: async (path: string) => path === "/standard/schemas" ? { schemas: [], verify: { ok: false, errors: ["meta.json missing"] } } : {},
        apiPost: async () => ({})
      });
    } finally {
      [g.document, g.window] = saved;
    }
    expect(root.innerHTML).toContain("No schemas yet: press Generate Schemas to write them.");
    expect(root.innerHTML).not.toMatch(/NOT VERIFIED|ok=|meta\.json/);
  });
});
