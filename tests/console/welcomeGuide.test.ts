/**
 * The first-run "Welcome to AMC" guide and Home's plain-language help. A first-time user met jargon chips, a dense
 * command-center hero and no word on what AMC does; the guide explains it in five short steps.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  ACTIVATION_HELP, BANNER_TIPS, FEATURE_TOUR, GLOSSARY, GUIDE_STEPS, GUIDE_STORAGE_KEY, activationHelpHtml, bannerHelpHtml,
  guideDismissed, guideStepHtml, rememberGuideDismissed, welcomeCardHtml
} from "../../src/console/assets/welcomeGuide.js";
import { CANONICAL_NAV, canonicalNavHtml } from "../../src/console/assets/shell.js";

const allCopy = () => [
  ...GUIDE_STEPS.map((_, index) => guideStepHtml(index)), welcomeCardHtml(), bannerHelpHtml(),
  ...Object.keys(ACTIVATION_HELP).flatMap((id) => ["WAITING", "READY", "BLOCKED", "COMPLETE"].map((status) => activationHelpHtml({ id, status }, "a")))
].join("\n");

describe("welcome guide steps", () => {
  test("five steps in the agreed order", () => {
    expect(GUIDE_STEPS.map((step) => step.title)).toEqual([
      "What AMC is", "How it works, in three moves", "What you can do here", "Pick your first step", "Words you will see"
    ]);
  });

  test("each step shows its place, Back is disabled on the first, the last says Finish", () => {
    const first = guideStepHtml(0);
    const last = guideStepHtml(GUIDE_STEPS.length - 1);
    expect(first).toContain("Step 1 of 5");
    expect(first).toContain('<progress max="5" value="1"');
    expect(first).toMatch(/data-guide="back" disabled/);
    expect(first).toContain(">Next</button>");
    expect(last).toContain("Step 5 of 5");
    expect(last).toContain('data-guide="close">Finish</button>');
    expect(guideStepHtml(99)).toBe(last);
    expect(guideStepHtml(-3)).toBe(first);
  });

  test("the feature tour links only pages that exist", () => {
    expect(FEATURE_TOUR.length).toBeGreaterThanOrEqual(7);
    for (const [href] of FEATURE_TOUR) expect(existsSync(`src/console/pages/${href.slice(2)}.html`), href).toBe(true);
    const tour = guideStepHtml(2);
    for (const [href, name] of FEATURE_TOUR) expect(tour).toContain(`<a href="${href}">${name}</a>`);
    expect(tour).toContain("Free and all included in the current source build");
  });

  test("the first-step choices open Home's three existing start cards", () => {
    const choices = [...guideStepHtml(3).matchAll(/data-guide-start="([^"]+)"/g)].map((match) => match[1]);
    expect(choices).toEqual(["firstUseNativeButton", "firstUseBaselineButton", "firstUseConnectButton"]);
    const app = readFileSync("src/console/assets/app.js", "utf8");
    for (const id of choices) expect(app).toContain(`<button id="${id}"`);
  });

  test("the glossary names the seven words", () => {
    expect(GLOSSARY.map(([term]) => term)).toEqual(["Evidence", "Claim", "Vault", "Lease", "Signed", "Freeze", "Trust label"]);
  });

  test("no certification wording, no hard-coded counts, no inline handlers", () => {
    const copy = allCopy();
    expect(copy).not.toMatch(/certified|compliant|guarantee|proves your agent is safe/i);
    expect(copy.replaceAll("&#39;", "\'")).not.toMatch(/\b\d{2,}\b/);
    expect(copy).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
  });
});

describe("plain-language help", () => {
  test("activation help says what to do until a milestone is complete", () => {
    const waiting = activationHelpHtml({ id: "connected_agent", status: "WAITING" }, "<x>");
    expect(waiting).toContain("What to do:");
    expect(waiting).toContain("amc connect --agent &lt;x&gt;");
    expect(activationHelpHtml({ id: "connected_agent", status: "COMPLETE" }, "a")).not.toContain("What to do:");
    expect(activationHelpHtml({ id: "signed_proof", status: "BLOCKED" }, "a")).toContain("amc doctor --strict --json");
    expect(activationHelpHtml({ id: "unknown", status: "WAITING" }, "a")).toBe("");
    expect(activationHelpHtml({ id: "observed_action", status: "WAITING" }, "a b")).toContain("./native-tasks?agent=a%20b");
  });

  test("every banner label has a tooltip and the help list names them", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    for (const key of Object.keys(BANNER_TIPS)) expect(app).toContain(`title="\${htmlEscape(BANNER_TIPS.${key})}"`);
    expect(app).toContain("${bannerHelpHtml()}");
    expect(bannerHelpHtml()).toContain("<summary>What do these mean?</summary>");
  });
});

describe("dismissal memory", () => {
  const win = (store: Record<string, string> | "throws" | "missing") => ({
    get localStorage() {
      if (store === "throws") throw new Error("SecurityError");
      if (store === "missing") return undefined;
      return { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; } };
    }
  });

  test("remembers a close, and shows the guide again when storage is unavailable", () => {
    const store: Record<string, string> = {};
    expect(guideDismissed(win(store))).toBe(false);
    rememberGuideDismissed(win(store));
    expect(store[GUIDE_STORAGE_KEY]).toBe("1");
    expect(guideDismissed(win(store))).toBe(true);
    for (const broken of ["throws", "missing"] as const) {
      expect(() => rememberGuideDismissed(win(broken))).not.toThrow();
      expect(guideDismissed(win(broken))).toBe(false);
    }
  });
});

describe("Home wiring", () => {
  const app = readFileSync("src/console/assets/app.js", "utf8");
  const home = app.slice(app.indexOf("async function renderHome()"), app.indexOf("\n}\n", app.indexOf("async function renderHome()")));

  test("welcome card first, start cards next, developer material collapsed at the end", () => {
    expect(home.indexOf("${welcomeCardHtml()}")).toBeLessThan(home.indexOf("${firstUseCard(agentId)}"));
    expect(home.indexOf("${firstUseCard(agentId)}")).toBeLessThan(home.indexOf('card("Activation path"'));
    for (const block of ["studio-hero", "studio-desktop-note", "renderApiQuickstart("]) {
      const at = home.indexOf(block);
      expect(home.lastIndexOf('<details class="advanced-section">', at), block).toBeGreaterThan(home.indexOf('card("Activation path"'));
    }
    expect(home).toContain("installWelcomeGuide(document, window);");
  });

  test("the top bar opens the guide and the service worker precaches it", () => {
    expect(readFileSync("src/console/assets/shell.js", "utf8")).toContain('id="guideOpenLink" href="./home?guide=1">How AMC works</a>');
    expect(readFileSync("src/console/assets/sw.js", "utf8")).toContain('assetPath("assets/welcomeGuide.js")');
  });

  test("every All features link carries a plain description", () => {
    const features = (CANONICAL_NAV as Array<{ group?: string; desc?: string; label: string }>).filter((link) => link.group === "features");
    for (const link of features) expect(link.desc, link.label).toMatch(/\S.{8,}/);
    expect(canonicalNavHtml([])).toContain('title="Checks risky actions and can stop them."');
  });
});
