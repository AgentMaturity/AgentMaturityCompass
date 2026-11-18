// Run a task (studio-ui "run" slice): the task's route comes from the task's own fields only, and the result's chips
// open the full notices.
import { describe, expect, test } from "vitest";
import { taskRouteSteps, renderTaskRoute, answerShown, renderOutcomeChips, nativeTasksShell, providerLabel, RUN_SUGGESTIONS,
  STAND_IN_NOTICE, CORRECTNESS_NOTICE } from "../../src/console/assets/nativeTasksView.js";

const base = { state: "idle", turnEndReason: "complete", approvals: [], history: { status: "authenticated" }, verification: "not-verified" };
const states = (task: unknown, options?: { stale?: boolean }) => taskRouteSteps(task, options).map((step: { state: string }) => step.state);

describe("taskRouteSteps", () => {
  test("no task: you are at the first waypoint", () => {
    expect(states(null)).toEqual(["now", "todo", "todo", "todo"]);
  });

  test("running, finished, verifying and closed move along the route", () => {
    expect(states({ ...base, state: "running", turnEndReason: null })).toEqual(["done", "now", "todo", "todo"]);
    expect(states(base)).toEqual(["done", "done", "now", "todo"]);
    expect(states({ ...base, state: "verifying" })).toEqual(["done", "done", "done", "now"]);
    expect(states({ ...base, state: "closed", verification: "workspace-key-consistency" })).toEqual(["done", "done", "done", "done"]);
  });

  test("pending approvals wait for a person; failed, stopping and a failed check stop", () => {
    const waiting = taskRouteSteps({ ...base, state: "running", approvals: [{}] });
    expect(waiting[1]).toMatchObject({ label: "Needs approval", state: "wait" });
    expect(states({ ...base, state: "failed" })).toEqual(["done", "stop", "todo", "todo"]);
    expect(states({ ...base, state: "cancel-requested" })).toEqual(["done", "stop", "todo", "todo"]);
    expect(states({ ...base, turnEndReason: "error" })).toEqual(["done", "done", "stop", "todo"]);
    expect(taskRouteSteps({ ...base, state: "closed", verification: "failed" })[3]).toEqual({ label: "Check failed", state: "stop" });
  });

  test("Checked is done only for a full verification verdict", () => {
    const closed = { ...base, state: "closed" };
    expect(taskRouteSteps(closed)[3]).toMatchObject({ label: "Checked", state: "todo", hint: "Not checked yet" });
    expect(taskRouteSteps({ ...base, state: "released" })[3].state).toBe("todo");
    expect(taskRouteSteps({ ...closed, verification: "externally-anchored" })[3]).toMatchObject({ label: "Checked", state: "done" });
    expect(taskRouteSteps({ ...closed, verification: "anchored-prefix" })[3]).toMatchObject({ label: "Partly checked", state: "done" });
    expect(taskRouteSteps({ ...closed, verification: "something-new" })[3].state).toBe("todo");
  });

  test("Answer is done only when the turn ended normally", () => {
    for (const reason of ["error", "interrupted", "cancelled", "blocked", "max_tokens", "max_steps", "unknown-reason"]) {
      for (const state of ["idle", "closed", "verifying", "released"]) {
        expect(taskRouteSteps({ ...base, state, turnEndReason: reason })[2].state, `${state} after ${reason}`).toBe("stop");
      }
    }
    expect(taskRouteSteps({ ...base, state: "closed", turnEndReason: "error", verification: "workspace-key-consistency" })
      .map(step => step.state)).toEqual(["done", "done", "stop", "done"]);
    expect(answerShown({ ...base, turnEndReason: "cancelled" })).toBe(false);
    expect(answerShown(base)).toBe(true);
  });

  test("an idle task with no turn ending yet is not shown as stopped", () => {
    expect(states({ ...base, turnEndReason: null })).toEqual(["done", "todo", "todo", "todo"]);
  });

  test("unreadable approvals wait for a person instead of showing Working", () => {
    expect(taskRouteSteps({ ...base, state: "running", turnEndReason: null, approvalError: "Could not read." })[1].state).toBe("wait");
  });

  test("an unconfirmed read or unauthenticated history shows nothing as done", () => {
    expect(states({ ...base, state: "closed" }, { stale: true })).toEqual(["todo", "todo", "todo", "todo"]);
    expect(states({ ...base, history: { status: "unavailable" } })).toEqual(["todo", "todo", "todo", "todo"]);
  });

  test("the route is an ordered list with the current step marked", () => {
    const html = renderTaskRoute({ ...base, state: "running", turnEndReason: null });
    expect(html).toMatch(/^<ol class="route run-route"/);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });
});

describe("result chips and the page", () => {
  test("a stand-in answer carries both notices in full; a real model only the correctness one", () => {
    const stub = renderOutcomeChips({ provider: "stub" });
    expect(stub).toContain(STAND_IN_NOTICE.replaceAll("'", "&#39;"));
    expect(stub).toContain(CORRECTNESS_NOTICE);
    expect(renderOutcomeChips({ provider: "openai" })).not.toContain("Stand-in model");
    expect(stub).not.toMatch(/certif|compliant|guarantee|verified/i);
  });

  test("the stand-in model is named as such, ideas only fill the box, and nothing starts open", () => {
    expect(providerLabel("stub")).toMatch(/^Stand-in model/);
    const html = nativeTasksShell("default");
    for (const [, text] of RUN_SUGGESTIONS) expect(html).toContain(`data-run-suggest="${text}"`);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html.indexOf('id="nativeTasksTitle"')).toBeLessThan(html.indexOf('id="nativeTaskTranscript"'));
    expect(html.indexOf('id="nativeTaskTranscript"')).toBeLessThan(html.indexOf('id="nativeTaskPrompt"'));
  });
});
