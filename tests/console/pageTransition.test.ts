/**
 * "AbortError: Transition was skipped" was logged on most console page changes: Chromium drops the arriving cross-fade
 * (motion.css @view-transition) when the page's module scripts are still loading at its first frame, and the rejected
 * promise reached nobody. pageTransition.js, a classic script in every page's <head>, handles it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

function load(visibilityState = "visible", reduced = false) {
  const listeners = new Map<string, Listener>();
  const context = {
    DOMException, document: { visibilityState }, matchMedia: () => ({ matches: reduced }),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener)
  };
  runInNewContext(readFileSync("src/console/assets/pageTransition.js", "utf8"), context);
  return listeners;
}

function transition() {
  const rejected = () => { const promise = Promise.reject(new DOMException("Transition was skipped", "AbortError")); return promise; };
  const caught: string[] = [];
  const state = { skipped: false, caught };
  const watch = (key: string) => { const promise = rejected(); return { catch: (handler: () => void) => { caught.push(key); return promise.catch(handler); } }; };
  return { state, ready: watch("ready"), finished: watch("finished"), updateCallbackDone: watch("updateCallbackDone"), skipTransition: () => { state.skipped = true; } };
}

describe("page transitions", () => {
  test("every transition's three promises are caught; it is skipped only on a hidden page or with reduced motion", () => {
    for (const [visibility, reduced, skipped] of [["visible", false, false], ["hidden", false, true], ["visible", true, true]] as const) {
      const listeners = load(visibility, reduced);
      for (const type of ["pageswap", "pagereveal"]) {
        const vt = transition();
        listeners.get(type)!({ viewTransition: vt });
        expect(vt.state.caught.sort(), `${type} ${visibility}`).toEqual(["finished", "ready", "updateCallbackDone"]);
        expect(vt.state.skipped, `${type} ${visibility} ${reduced}`).toBe(skipped);
      }
      expect(() => listeners.get("pagereveal")!({ viewTransition: null })).not.toThrow();
    }
  });

  test("only the skipped-transition rejection the page never received is marked handled", () => {
    const onRejection = load().get("unhandledrejection")!;
    const event = (reason: unknown) => { const state = { prevented: false, reason, preventDefault: () => { state.prevented = true; } }; onRejection(state); return state.prevented; };
    expect(event(new DOMException("Transition was skipped", "AbortError"))).toBe(true);
    expect(event(new DOMException("The user aborted a request.", "AbortError"))).toBe(false);
    expect(event(new Error("Transition was skipped"))).toBe(false);
  });

  test("every page loads it as a classic script in <head>, and reduced motion turns the cross-fade off in CSS", () => {
    for (const file of readdirSync("src/console/pages")) {
      const html = readFileSync(`src/console/pages/${file}`, "utf8");
      expect(html.slice(0, html.indexOf("</head>")), file).toContain('<script src="./assets/pageTransition.js"></script>');
    }
    expect(readFileSync("src/console/assets/motion.css", "utf8")).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*@view-transition/);
  });
});
