/**
 * LIVE-UX-01: the console sign-in card. A new user who had just run `amc up` met a card with no word on how an account is
 * created, placeholder-only inputs outside any form (Enter did nothing), and "Login failed: users config signature
 * invalid; login blocked" when users.yaml did not exist yet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { loginCardHtml, loginFailureText } from "../../src/console/assets/loginView.js";

const local = loginCardHtml({ demoMode: false, hostMode: false });
const formOf = (html: string) => html.slice(html.indexOf("<form"), html.indexOf("</form>") + "</form>".length);
const outsideForm = (html: string) => html.replace(formOf(html), "");

describe("loginCardHtml", () => {
  test("local mode names amc user add first and amc user init with its replace warning", () => {
    expect(local).toContain("amc user add --username");
    expect(local).toContain("amc user init --username");
    expect(local).toContain("replaces any existing logins");
    expect(local.indexOf("amc user add --username")).toBeLessThan(local.indexOf("amc user init --username"));
    expect(local).not.toContain("amc host user add");
  });

  test("the form holds the three labelled fields and the submit button, with the ids the e2e pages use", () => {
    const form = formOf(local);
    expect(form).toContain('<form id="loginForm" method="post"');
    expect(form.match(/<label for="/g) ?? []).toHaveLength(3);
    for (const id of ["loginUser", "loginPass", "pairCode"]) {
      expect(form).toContain(`<label for="${id}">`);
      expect(form).toContain(`id="${id}"`);
    }
    expect(form).toContain('autocomplete="username"');
    expect(form).toContain('autocomplete="current-password"');
    expect(form).toMatch(/<button id="loginBtn" type="submit"/);
    expect(form.match(/<button/g) ?? []).toHaveLength(1);
    expect(form).not.toContain("adminTokenBtn");
    expect(form).not.toContain("pairCodeCreateBtn");
  });

  test("every button outside the form is type=button, so it never submits the login", () => {
    const buttons = outsideForm(local).match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) expect(button).toContain('type="button"');
    expect(outsideForm(local)).toMatch(/<button id="adminTokenBtn" type="button"/);
    expect(outsideForm(local)).toMatch(/<button id="pairCodeCreateBtn" type="button"/);
  });

  test("pairing sits in a collapsed details after the form, with the QR and the OWNER note", () => {
    const details = local.indexOf("<details>\n        <summary>Pair another device (LAN mode)</summary>");
    expect(details).toBeGreaterThan(local.indexOf("</form>"));
    const block = local.slice(details, local.indexOf("</details>", details));
    expect(block).not.toMatch(/<details[^>]*\sopen/);
    expect(block).toContain('id="pairQr"');
    expect(block).toContain("OWNER role required");
    expect(block).toContain("amc studio lan enable");
    expect(block).toContain('<pre id="authOut" class="muted" aria-live="polite">');
  });

  test("host mode names the host administrator's command and never amc user init", () => {
    const host = loginCardHtml({ demoMode: false, hostMode: true });
    expect(host).toContain("amc host user add");
    expect(host).not.toContain("amc user init");
    expect(host).not.toContain("amc user add");
  });

  test("demo mode keeps the demo banner and names neither command", () => {
    const demo = loginCardHtml({ demoMode: true, hostMode: false });
    expect(demo).toContain("Local demo mode creates a no-login session");
    expect(demo).not.toContain("amc user init");
    expect(demo).not.toContain("amc user add");
    expect(demo).not.toContain("amc host user add");
  });

  test.each([[false, false], [false, true], [true, false]])("no inline handler or javascript: URL (demo %s, host %s)", (demoMode, hostMode) => {
    const html = loginCardHtml({ demoMode, hostMode });
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toContain("javascript:");
  });
});

describe("loginFailureText", () => {
  test("Studio's missing users.yaml reply becomes the first-account step", () => {
    const text = loginFailureText("users config missing; login blocked");
    expect(text).toContain("No console account exists yet in this workspace");
    expect(text).toContain("amc user init --username <you>");
    expect(text).not.toContain("Login failed");
  });

  test.each(["users config signature invalid; login blocked", "invalid credentials", "pairing required before login"])("other errors stay verbatim: %s", (message) => {
    expect(loginFailureText(message)).toBe(`Login failed: ${message}`);
  });
});

describe("app.js wires the form", () => {
  const app = readFileSync("src/console/assets/app.js", "utf8");
  const auth = app.slice(app.indexOf("function renderAuthScreen()"), app.indexOf("\n}\n", app.indexOf("function renderAuthScreen()")));

  test("the card comes from loginView.js and the submit handler prevents the native post first", () => {
    expect(app).toContain('from "./loginView.js"');
    expect(auth).toContain("loginCardHtml(");
    expect(auth).toMatch(/getElementById\("loginForm"\)\?\.addEventListener\("submit", async \(event\) => \{\s*event\.preventDefault\(\);/);
    expect(auth).toContain("loginFailureText(errText(error))");
    expect(auth).not.toMatch(/getElementById\("loginBtn"\)\?\.addEventListener/);
  });

  test("login.html announces the status line without JavaScript", () => {
    expect(readFileSync("src/console/pages/login.html", "utf8")).toContain('<p id="status" class="muted" role="status">');
  });
});
