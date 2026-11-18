/**
 * The studio-ui redesign's shared pieces: the route (pageKit.routeTrack), picture cards, notice chips, "more info",
 * empty states, the icon set, and Home's own pieces (homeView.js) built from them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { emptyState, moreInfo, noticeChip, pictureCard, routeTrack } from "../../src/console/assets/pageKit.js";
import { ICON_NAMES, icon, picture } from "../../src/console/assets/iconSet.js";
import { activationRouteHtml, approvalsTileHtml, homeStartHtml } from "../../src/console/assets/homeView.js";

describe("routeTrack", () => {
  test("an ordered list; the first step in progress is the current one; each state is said in words", () => {
    const html = routeTrack([{ label: "Describe it", state: "done" }, { label: "Build it", state: "wait", hint: "A <second> person" },
      { label: "Fit rules", state: "todo" }, { label: "Release it", state: "bogus" }], { label: "Where it is" });
    expect(html.startsWith('<ol class="route" aria-label="Where it is">')).toBe(true);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/<li class="route-step is-wait" aria-current="step" title="A &lt;second&gt; person">/);
    expect(html).toContain('<span class="visually-hidden">: done</span>');
    expect(html).toContain(": waiting for a person. A &lt;second&gt; person");
    // An unknown state draws as not started, never as done.
    expect(html.match(/is-todo/g)).toHaveLength(2);
    expect(routeTrack([{ label: "A", state: "done" }, { label: "B", state: "now" }, { label: "C", state: "stop" }]))
      .toMatch(/is-now" aria-current="step"/);
    expect(routeTrack([{ label: "A", state: "done" }])).not.toContain("aria-current");
  });

  test("the waypoint pulse is the one animation, and it stops under reduced motion", () => {
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    expect(styles).toContain("animation: route-pulse 2.4s ease-in-out infinite;");
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.is-now \.route-dot \{ animation: none; \}/);
  });
});

describe("cards, chips, more info, empty states", () => {
  test("a picture card is a link, a button, or the label of the real input it wraps", () => {
    expect(pictureCard({ title: "Build <it>", href: "./a4", pictureName: "build" })).toMatch(/^<a class="picture-card" href="\.\/a4"><svg class="picture"[\s\S]*Build &lt;it&gt;/);
    expect(pictureCard({ title: "Go", iconName: "run" })).toMatch(/^<button type="button" class="picture-card">/);
    const radio = pictureCard({ title: "Alone", input: '<input type="radio" name="practice" value="yes" />' });
    expect(radio).toMatch(/^<label class="picture-card"><input type="radio" name="practice" value="yes" \/>/);
  });

  test("a notice chip is neutral and keeps the full sentence one click away, unchanged", () => {
    const chip = noticeChip("AI-drafted, not legal advice", "Experimental <content>, drafted by AI.");
    expect(chip).toContain("<summary>");
    expect(chip).toContain("<p>Experimental &lt;content&gt;, drafted by AI.</p>");
    expect(chip).not.toMatch(/accent|status-ok|check/);
  });

  test("more info and the empty state", () => {
    expect(moreInfo("Why <two>?", "<p>x</p>", { id: "w" })).toBe('<details class="more-info" id="w"><summary>Why &lt;two&gt;?</summary><div class="more-info-body"><p>x</p></div></details>');
    expect(emptyState({ line: "Nothing <here>." })).toMatch(/^<div class="empty-state"><svg class="picture"[\s\S]*<p>Nothing &lt;here&gt;\.<\/p><\/div>$/);
  });
});

describe("icon set", () => {
  test("every icon is decoration in currentColor on a 24 grid; an unknown name falls back to info", () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(36);
    for (const name of ["home", "build", "run", "agent", "approvals", "records", "packs", "live", "more", "sign-in", "sun", "moon", "auto",
      "wait", "refused", "check", "health", "wealth", "governance", "aspire", "activate"]) expect(ICON_NAMES).toContain(name);
    const svg = icon("home");
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="1.75"');
    expect(svg).toContain('aria-hidden="true"');
    expect(icon("no-such-icon")).toBe(icon("info"));
    expect(picture("nope")).toBeNull();
    expect(picture("check")).toContain('viewBox="0 0 96 72"');
  });
});

describe("Home's pieces", () => {
  test("three ways in, the agent escaped into each link", () => {
    const html = homeStartHtml({ agentId: "a&b", demoMode: false });
    expect(html).toContain("What would you like to do?");
    for (const id of ["homeBuildTile", "homeRunTile", "homeCheckTile"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('href="./agent?agent=a%26b"');
  });

  test("the first steps route: done, then the next as current, a blocked step as stopped", () => {
    const rows = (statuses: string[]) => ["connected_agent", "observed_action", "control_decision", "signed_proof"].map((id, at) => ({ id, status: statuses[at] }));
    const html = activationRouteHtml({ milestones: rows(["COMPLETE", "WAITING", "WAITING", "WAITING"]) });
    expect(html).toMatch(/is-done[\s\S]*Connect[\s\S]*is-now" aria-current="step"[\s\S]*First action/);
    expect(activationRouteHtml({ milestones: rows(["BLOCKED", "WAITING", "WAITING", "WAITING"]) })).toMatch(/is-stop" aria-current="step"/);
    expect(activationRouteHtml(null).match(/route-step/g)).toHaveLength(4);
  });

  test("the approvals tile: nothing when AMC cannot tell, an empty state at zero, the count with the way there", () => {
    expect(approvalsTileHtml(null)).toBe("");
    expect(approvalsTileHtml(0)).toContain("No approval requests are open.");
    expect(approvalsTileHtml(1)).toContain("1 approval request is open");
    expect(approvalsTileHtml(3)).toContain("3 approval requests are open");
    expect(approvalsTileHtml(3)).toContain('href="./approvals"');
  });
});
