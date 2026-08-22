import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { Context } from "@amc/cordis";
import {
  installInvariants,
  defaultInvariantMode,
  InvariantError,
  checkSessionEnclosure,
  checkFifo,
  checkPromptReconstruction,
  checkApprovalPairing,
  registerSessionInvariants,
  type SessionEvent
} from "@amc/core";

/**
 * P1.4's third verification: invariants fire in dev.
 *
 * Each companion guards a property whose violation produces evidence that
 * looks valid and is not — the specific failure AMC cannot have, because a
 * corrupted ledger announces itself while a merely *plausible* one does not.
 */
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

const event = (over: Partial<SessionEvent> = {}): SessionEvent => ({
  sessionId: "s1",
  sequence: 1,
  kind: "tool-call",
  id: "e1",
  ...over
});

describe("invariant harness", () => {
  it("is on outside production and off inside it", () => {
    expect(defaultInvariantMode({} as NodeJS.ProcessEnv)).toBe("throw");
    expect(defaultInvariantMode({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("off");
    // The production default is a judgement, so it must be overridable.
    expect(defaultInvariantMode({ NODE_ENV: "production", AMC_INVARIANTS: "1" } as NodeJS.ProcessEnv)).toBe("throw");
    expect(defaultInvariantMode({ AMC_INVARIANTS: "collect" } as NodeJS.ProcessEnv)).toBe("collect");
  });

  it("throws at the point of violation in throw mode", () => {
    const invariants = installInvariants(new Context(), "throw");
    invariants.register("always-fails", () => ({ name: "always-fails", message: "by design" }));
    expect(() => invariants.verify()).toThrow(InvariantError);
  });

  it("records and continues in collect mode", () => {
    const invariants = installInvariants(new Context(), "collect");
    invariants.register("always-fails", () => ({ name: "always-fails", message: "by design" }));
    const found = invariants.verify();
    expect(found).toHaveLength(1);
    expect(invariants.violations).toHaveLength(1);
  });

  it("runs nothing at all in off mode", () => {
    const invariants = installInvariants(new Context(), "off");
    let ran = false;
    invariants.register("probe", () => {
      ran = true;
      return null;
    });
    expect(invariants.verify()).toEqual([]);
    expect(ran, "an off invariant must not cost anything to have").toBe(false);
  });

  it("treats a check that throws as a violation", () => {
    const invariants = installInvariants(new Context(), "collect");
    invariants.register("unreadable", () => {
      throw new Error("state is unreadable");
    });
    const [violation] = invariants.verify();
    // State that cannot be inspected is not "unknown", it is wrong.
    expect(violation!.message).toMatch(/check threw/);
  });

  it("refuses a duplicate registration", () => {
    const invariants = installInvariants(new Context(), "collect");
    invariants.register("dup", () => null);
    expect(() => invariants.register("dup", () => null)).toThrow(/already registered/);
  });

  it("asserts inline, where the property must hold", () => {
    const invariants = installInvariants(new Context(), "throw");
    expect(() => invariants.assert("budget", false, "budget exceeded", { spent: 11 })).toThrow(
      /budget exceeded/
    );
    expect(() => invariants.assert("budget", true, "unreachable")).not.toThrow();
  });
});

describe("invariant companions", () => {
  it("catches an event that escaped its session", () => {
    const violation = checkSessionEnclosure(
      [event(), event({ id: "e2", sessionId: "other" })],
      "s1"
    );
    // One agent's behaviour counted against another's maturity.
    expect(violation!.name).toBe("session-enclosure");
    expect(violation!.detail!["strayIds"]).toEqual(["e2"]);
    expect(checkSessionEnclosure([event()], "s1")).toBeNull();
  });

  it("catches a reordered ledger", () => {
    const violation = checkFifo([
      event({ id: "e1", sequence: 1 }),
      event({ id: "e2", sequence: 3 }),
      event({ id: "e3", sequence: 2 })
    ]);
    // The hash chain stays valid — it just describes a sequence that never
    // happened, which is why the chain alone cannot catch this.
    expect(violation!.name).toBe("fifo");
    expect(violation!.detail!["currentId"]).toBe("e3");
  });

  it("catches a prompt that cannot be reconstructed", () => {
    const sent = "system\nuser question";
    expect(
      checkPromptReconstruction(["system\n", "user question"], digest(sent), digest)
    ).toBeNull();

    const violation = checkPromptReconstruction(["system\n"], digest(sent), digest);
    // If the parts do not reassemble, the audit is of a fiction.
    expect(violation!.name).toBe("prompt-reconstruction");
    // The check must not retain the prompt it is verifying.
    expect(JSON.stringify(violation)).not.toContain("user question");
  });

  it("catches an approval that answers no request", () => {
    const violation = checkApprovalPairing([
      event({ id: "a1", kind: "approval-granted", approvalOf: "missing" })
    ]);
    expect(violation!.name).toBe("approval-pairing");
    expect(violation!.message).toMatch(/answers no request/);
  });

  it("catches a replayed approval", () => {
    const violation = checkApprovalPairing([
      event({ id: "r1", kind: "approval-request" }),
      event({ id: "a1", kind: "approval-granted", approvalOf: "r1" }),
      event({ id: "a2", kind: "approval-granted", approvalOf: "r1" })
    ]);
    // A duplicate approval is the shape a replayed authorisation takes.
    expect(violation!.message).toMatch(/approved 2 times/);
  });

  it("accepts a well-formed approval pair", () => {
    expect(
      checkApprovalPairing([
        event({ id: "r1", kind: "approval-request" }),
        event({ id: "a1", kind: "approval-granted", approvalOf: "r1" })
      ])
    ).toBeNull();
  });

  it("reads live state, not a stale snapshot", () => {
    const invariants = installInvariants(new Context(), "collect");
    const events: SessionEvent[] = [event()];
    registerSessionInvariants(invariants, () => ({ sessionId: "s1", events }));

    expect(invariants.verify()).toEqual([]);

    // Mutate after registration: an invariant bound to a snapshot checks nothing.
    events.push(event({ id: "e2", sessionId: "other", sequence: 2 }));
    const found = invariants.verify();
    expect(found.map((v) => v.name)).toContain("session-enclosure");
  });
});
