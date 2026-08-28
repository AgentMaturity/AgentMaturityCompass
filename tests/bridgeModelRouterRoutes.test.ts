import { describe, expect, it } from "vitest";
import { BRIDGE_MODEL_ROUTES, matchBridgeRoute } from "../src/bridge/bridgeModelRouter.js";

/**
 * `BRIDGE_MODEL_ROUTES` is a hand-written list beside a matcher made of regexes,
 * so the one thing that can be checked is that every entry is real.
 *
 * That is a smaller guarantee than "this list is complete", and it is stated as
 * such rather than dressed up: a regex added to the matcher without a sample
 * added to the list is still invisible. What it does stop is the list rotting —
 * a route renamed or removed makes this red, which is exactly what a coverage
 * denominator drifting away from reality would otherwise do silently.
 */
describe("the published route list is real", () => {
  it("matches every path it claims the Bridge proxies", () => {
    const unmatched = BRIDGE_MODEL_ROUTES.filter((route) => matchBridgeRoute(route) === null);
    expect(unmatched, `these are listed but not routed: ${unmatched.join(", ")}`).toEqual([]);
  });

  it("is not vacuous", () => {
    // A list that had been emptied would satisfy the test above.
    expect(BRIDGE_MODEL_ROUTES.length).toBeGreaterThan(8);
    // And the matcher really can say no, so the check above means something.
    expect(matchBridgeRoute("/bridge/openai/v1/not-a-route")).toBeNull();
  });
});
