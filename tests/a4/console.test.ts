/**
 * P1-58 debt (pending-checks.md): the Studio A4 pages' pure helpers in src/console/assets/a4View.js refuse what the
 * page must never apply, and the service worker precaches both A4 pages.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import * as a4View from "../../src/console/assets/a4View.js";
import { mergeOnTop, renderMissing, validateA4Poll } from "../../src/console/assets/a4View.js";

const page = (over: Record<string, unknown> = {}) => ({ events: [{ cursor: 5 }, { cursor: 6 }], presence: [], nextCursor: 7, firstCursor: 0,
  droppedEvents: 0, head: { headSeq: 6 }, ...over });
const current = { projectId: "p-1", headSeq: 4 };

describe("validateA4Poll", () => {
  test("accepts a well-formed page and keeps only events at or after the cursor", () => {
    expect(validateA4Poll(page(), current, 6)).toMatchObject({ nextCursor: 7, events: [{ cursor: 6 }] });
  });
  test("refuses a head that regresses", () => {
    expect(() => validateA4Poll(page({ head: { headSeq: 3 } }), current, 5)).toThrow(/head moved backwards/);
  });
  test("refuses a head that names another project", () => {
    expect(() => validateA4Poll(page({ head: { headSeq: 6, projectId: "p-2" } }), current, 5)).toThrow(/changed identity/);
  });
  test("refuses a cursor that moves backwards", () => {
    expect(() => validateA4Poll(page({ nextCursor: 4, events: [] }), current, 5)).toThrow(/cursor moved backwards/);
  });
  test("refuses out-of-order events", () => {
    expect(() => validateA4Poll(page({ events: [{ cursor: 6 }, { cursor: 5 }] }), current, 5)).toThrow(/out-of-order/);
    expect(() => validateA4Poll(page({ events: [{ cursor: 5 }, { cursor: 5 }] }), current, 5)).toThrow(/out-of-order/);
  });
});

describe("applyChanges (through mergeOnTop)", () => {
  test.each(["__proto__", "constructor", "prototype"])("refuses the reserved key %s", (key) => {
    expect(() => mergeOnTop({ a: 1 }, [{ path: [key, "polluted"], after: true }], {}, [])).toThrow(/reserved key name/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  test("applies an ordinary change on top of the head", () => {
    expect(mergeOnTop({ a: 1, b: 2 }, [{ path: ["b"], after: 3 }], { b: 3 }, [])).toEqual({ a: 1, b: 3 });
  });
});

describe("nextAction route allowlist (renderMissing)", () => {
  const html = (route: string) => renderMissing({ status: "BLOCKED", items: [], allowed: {}, nextAction: { label: "Go", route } }, "aspire");
  test("a same-origin relative route is a link", () => {
    expect(html("/console/a4Project?id=p-1")).toContain('href="/console/a4Project?id=p-1"');
  });
  test.each(["javascript:alert(1)", "JavaScript:alert(1)", "//evil.example/x", "https://evil.example/", "data:text/html,x"])(
    "refuses %s as a link", (route) => {
      const out = html(route);
      expect(out).not.toContain("href=");
      expect(out).toContain("<strong>Go</strong>");
    });
});

// LIVE-UX-04: the notice named no way forward, and the home nav link stays hidden while the preview is off.
describe("previewNoticeHtml", () => {
  const html = () => (a4View as { previewNoticeHtml?: () => string }).previewNoticeHtml?.() ?? "";
  test("names how to enable the preview on POSIX shells and PowerShell, commands in <code>", () => {
    expect(html()).toContain("A4 preview is not enabled in this workspace.");
    for (const command of ["amc down", "AMC_A4_PREVIEW=1 amc up", "$env:AMC_A4_PREVIEW"]) expect(html()).toContain(command);
    expect(html()).toContain("<code>AMC_A4_PREVIEW=1 amc up</code>");
    expect(html()).toContain("A running Studio keeps the environment it started with.");
    expect(html()).not.toMatch(/\son[a-z]+\s*=|javascript:/i);
  });
  test("the A4 page renders it", () => {
    expect(readFileSync("src/console/assets/a4.js", "utf8")).toContain("view.previewNoticeHtml()");
  });
});

// B1 (go-live smoke): Understand records a revision (r1 -> r2); the page then dropped the statement Confirm binds, so
// "Yes, that's it" stayed disabled at every stage.
describe("statementHolds", () => {
  const statementHolds = (a4View as unknown as { statementHolds: (s: unknown, before: unknown, after: unknown) => boolean }).statementHolds;
  const before = { stage: "aspire", revisionNo: 1, headSeq: 11 };
  test("keeps Understand's statement across the revision Understand itself recorded", () => {
    expect(statementHolds({ headSeq: 12 }, before, { stage: "aspire", revisionNo: 2, headSeq: 12 })).toBe(true);
  });
  test("keeps it while nothing records a revision", () => {
    expect(statementHolds({ headSeq: 12 }, { ...before, revisionNo: 2, headSeq: 12 }, { stage: "aspire", revisionNo: 2, headSeq: 13 })).toBe(true);
  });
  test("drops it once a later revision or another stage supersedes it", () => {
    expect(statementHolds({ headSeq: 12 }, { ...before, revisionNo: 2, headSeq: 12 }, { stage: "aspire", revisionNo: 3, headSeq: 13 })).toBe(false);
    expect(statementHolds({ headSeq: 12 }, before, { stage: "assemble", revisionNo: 2, headSeq: 12 })).toBe(false);
    expect(statementHolds({ headSeq: null }, before, { stage: "aspire", revisionNo: 2, headSeq: 12 })).toBe(false);
    expect(statementHolds(null, before, before)).toBe(false);
  });
});

test("sw.js precaches both A4 pages", () => {
  const source = readFileSync("src/console/assets/sw.js", "utf8");
  const self = { registration: { scope: "https://studio.example/console/" }, addEventListener: () => {} };
  const assets = runInNewContext(`${source}\nstaticAssets();`, { self, URL }) as string[];
  expect(assets).toEqual(expect.arrayContaining(["/console/a4", "/console/a4Project"]));
});

// Go-live smoke: H4 (stale answers), M5 (plain refusals), M6/M7 (Complete), L5 (members), H5 (inbox digest).
describe("go-live A4 console fixes", () => {
  const v = a4View as unknown as Record<string, (...args: unknown[]) => unknown>;
  const ask = (codes: string[]) => ({ items: [{ id: "ask_complete", status: "WAITING", reasonCodes: codes }] });
  const ctx = (readiness: unknown, over: Record<string, unknown> = {}) => ({ project: { stage: "assemble", step: "explained", members: [] }, stage: "assemble",
    readiness, ...over });
  test("H4: Propose is held in plain words while an answer is stale, and offered once none is", () => {
    const offer = { allowed: true, reasonCodes: [] };
    const held = v.stepOffer(offer, ctx(ask(["ANSWER_STALE:capabilities"])), "propose") as { allowed: boolean; note: string };
    expect(held.allowed).toBe(false);
    expect(held.note).toContain("confirm or change capabilities");
    expect(v.stepOffer(offer, ctx(ask([])), "propose")).toBe(offer);
  });
  test("H4: each stale answer gets a 'Still correct — confirm' action", () => {
    const html = v.renderConversation({ ...ctx(ask(["ANSWER_STALE:autonomy"])), allowed: { ask: { allowed: true }, understand: { allowed: true }, explain: {} },
      answers: [{ questionId: "autonomy", value: "advise", source: "user" }], questions: [{ id: "autonomy", prompt: "Autonomy?" }], reflection: null }) as string;
    expect(html).toContain('data-a4-action="confirm-answer" data-question="autonomy"');
    expect(html).toContain("Still correct — confirm");
  });
  test("M5: a disabled button explains its codes in plain words and keeps the code", () => {
    const html = v.actionButton("Approve", "approve", { allowed: false, reasonCodes: ["SOD_VIOLATION"] }) as string;
    expect(html).toMatch(/title="You cannot approve this yourself[^"]*\(SOD_VIOLATION\)"/);
    expect(v.reasonText("PRINCIPAL_NOT_MEMBER")).toContain("Members card");
    expect(v.reasonText("resources.current")).not.toContain("resources.current");
  });
  test("M5: excluded approvers are named by username", () => {
    expect(v.nameOf({ project: { members: [{ principalKey: "LOCAL_USER:u1", username: "alice" }] } }, "LOCAL_USER:u1")).toBe("alice");
  });
  test("M6/M7: Complete is labelled by the gate it consumes and waits on the stage's effect gate", () => {
    expect(v.completeLabel({ gate: "direction" }, "assemble")).toBe("Use the direction approval and continue to Build");
    expect(v.completeLabel({ gate: "completion" }, "assemble")).toBe("Complete Assemble");
    const item = (codes: string[]) => ({ items: [{ id: "effect_gate", reasonCodes: codes }] });
    expect((v.effectHold({ gate: "completion" }, item(["EFFECT_GATE_NOT_OPEN"])) as { allowed: boolean }).allowed).toBe(false);
    expect((v.effectHold({ gate: "completion" }, item(["EFFECT_GATE_OPENED", "APPROVAL_STATUS:PENDING"])) as { allowed: boolean }).allowed).toBe(false);
    expect(v.effectHold({ gate: "completion" }, item(["EFFECT_GATE_OPENED", "APPROVAL_STATUS:QUORUM_MET"]))).toBeNull();
    expect(v.effectHold({ gate: "direction" }, item(["EFFECT_GATE_NOT_OPEN"]))).toBeNull();
  });
  test("L5: members are not offered as candidates again, Add has an accessible name, and an open gate is warned about", () => {
    const html = v.renderMembers({ project: { members: [{ principalKey: "K1", username: "owner1", authSource: "LOCAL_USER", roles: ["owner"] }] },
      members: { candidates: [{ principalKey: "K1", username: "owner1" }, { principalKey: "K2", username: "appr" }] }, stage: "aspire",
      gates: [], readiness: { items: [], gates: { direction: { gateId: "g", gate: "direction", status: "PENDING", revisionNo: 4 } } }, allowed: { addMember: { allowed: true } } }) as string;
    expect(html).not.toContain('data-principal="K1"');
    expect(html).toContain('aria-label="Add appr to the project"');
    expect(html).toContain("is superseded");
  });
});

test("an effect request's Approve is held for a principal the completion gate excludes, even where self-approval is open", () => {
  const approveOffer = (a4View as unknown as Record<string, (...args: unknown[]) => { allowed: boolean; reasonCodes?: string[] }>).approveOffer;
  const gate = { excludedKeys: ["LOCAL_USER:u1"] };
  const readiness = { identityCheck: "users_yaml", selfApprovalAllowed: true };
  const offer = { allowed: true, reasonCodes: [] };
  expect(approveOffer(offer, gate, readiness, { userId: "u1" })).toBe(offer);
  expect(approveOffer(offer, gate, readiness, { userId: "u1" }, true)).toMatchObject({ allowed: false, reasonCodes: ["SOD_VIOLATION"] });
  expect(approveOffer(offer, gate, readiness, { userId: "u2" }, true)).toBe(offer);
});

describe("H5: A4 engine requests in the approvals inbox", async () => {
  const { a4ProjectOf, publishedDigest, engineDecision } = await import("../../src/console/assets/a4Approvals.js");
  const digest = "a".repeat(64);
  test("finds the project from the intent id and the digest the project's readiness publishes", () => {
    expect(a4ProjectOf(`a4-a4p_${"0".repeat(32)}-a4.assemble.apply-a4gate_x`)).toBe(`a4p_${"0".repeat(32)}`);
    expect(a4ProjectOf("native-intent")).toBeNull();
    expect(publishedDigest({ items: [{ reasonCodes: [`APPROVAL_REQUEST:apprreq_1:${digest}`, "GATE:g"] }] }, "apprreq_1")).toBe(digest);
    expect(publishedDigest({ items: [{ reasonCodes: [`APPROVAL_REQUEST:apprreq_1:${digest}`] }] }, "apprreq_2")).toBeNull();
  });
  test("decides through the project route, bound to the digest", () => {
    expect(engineDecision("p1", "apprreq_1", "approve", "ok", digest)).toEqual({ path: "/api/v1/a4/projects/p1/approvals/apprreq_1/approve",
      body: { reason: "ok", expectedRequestDigestSha256: digest } });
  });
});
