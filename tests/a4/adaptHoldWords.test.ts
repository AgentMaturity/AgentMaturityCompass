/**
 * The Adapt card's residency hold line was only ever seen after the plan was active, where it still said "activating this
 * plan will hold ...". Before activation it says the plan will hold every new session; once a plan is active and no
 * signed registry matches it (Studio's residencyHeld), it says the hold is on now. Both name the commands that end it.
 */
import { describe, expect, test } from "vitest";
import { registryHoldHtml } from "../../src/console/assets/a4Adapt.js";

const COMMANDS = ["amc residency profile --out .amc/residency/profile.yaml", "amc residency init --file &lt;registry.yaml&gt;", "amc residency status"];
const card = (project: Record<string, unknown>) => registryHoldHtml({ project, readiness: { items: [] } });

describe("the Adapt card's residency hold line", () => {
  test("before activation: activating this plan will hold every new session", () => {
    const html = card({ destinationRegistry: "missing", residencyHeld: null });
    expect(html).toContain("activating this plan will hold every new session in it, for every agent");
    expect(html).not.toContain("is holding");
    for (const command of COMMANDS) expect(html).toContain(command);
  });

  test("after activation: the active plan is holding every new session now, with the commands", () => {
    const html = card({ destinationRegistry: "missing", residencyHeld: "registry_missing" });
    expect(html).toContain("The workspace's active plan is holding every new session in it, for every agent (Build included)");
    expect(html).not.toContain("activating this plan will");
    for (const command of COMMANDS) expect(html).toContain(command);
    // A registry that verifies but does not match the active plan still holds.
    expect(card({ destinationRegistry: "verified", residencyHeld: "profile_unverifiable" })).toContain("is holding every new session");
    expect(card({ destinationRegistry: "verified", residencyHeld: null })).toBe("");
  });
});
