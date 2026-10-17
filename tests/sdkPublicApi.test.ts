import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DECLARATIONS_PATH, SNAPSHOT_PATH, evaluateSdkApi, renderSdkApi } from "../scripts/check-sdk-api.mjs";

/** P1-40: the committed public API snapshot of agent-maturity-compass/sdk/native and the check that guards it. */
const render = renderSdkApi;
const evaluate = evaluateSdkApi;
const committed = readFileSync(SNAPSHOT_PATH, "utf8");

describe("the sdk/native API snapshot (P1-40)", () => {
  it("matches the built declarations", () => {
    expect(render(DECLARATIONS_PATH)).toBe(committed);
  });

  it("marks the client, session, turn, their options and update types and the errors public, and the rest experimental", () => {
    for (const name of ["AMCNativeClient", "AMCNativeSession", "AMCNativeTurn", "AMCNativeClientOptions", "AMCNativeEventBufferOptions",
      "AMCNativeUpdate", "AMCNativeRunResult", "AMCNativeReceipt", "AMCNativeInputError", "AMCNativeProtocolError", "AMCNativeLimitError",
      "AMCNativeCancelledError", "AMCNativeProcessError", "AMCNativeRefusedError"]) {
      expect(committed, name).toContain(`## ${name} (public)`);
    }
    for (const name of ["openAgentSession", "llm", "AMC_NATIVE_EVENT_LIMITS", "loadSessionEventHistory"]) {
      expect(committed, name).toContain(`## ${name} (experimental)`);
    }
    expect(committed).toContain("Experimental members: promptAudioParts, promptParts.");
    // @internal members and the A4 preview client are not part of this entry's contract.
    expect(committed).not.toMatch(/\breceive\(|\bpromptSession\(|createA4Client/);
  });

  it("fails when a public export is removed, until the snapshot is regenerated and a changeset names sdk-api", () => {
    const declarations = readFileSync(DECLARATIONS_PATH, "utf8");
    expect(declarations).toContain("export declare class AMCNativeSession");
    const removed = render(DECLARATIONS_PATH, declarations.replace("export declare class AMCNativeSession", "declare class AMCNativeSession"));
    expect(removed).not.toContain("## AMCNativeSession (public)");

    const stale = evaluate({ generated: removed, committed, base: committed, changesetTexts: ["sdk-api: removed AMCNativeSession"] });
    expect(stale.ok).toBe(false);
    expect(stale.failures.join("\n")).toContain("does not match");
    const unannounced = evaluate({ generated: removed, committed: removed, base: committed, changesetTexts: ["unrelated"] });
    expect(unannounced.ok).toBe(false);
    expect(unannounced.failures.join("\n")).toContain("no changeset changed by this branch mentions sdk-api");
    expect(evaluate({ generated: removed, committed: removed, base: committed, changesetTexts: ["Removes AMCNativeSession (sdk-api)."] }).ok).toBe(true);
    expect(evaluate({ generated: committed, committed, base: committed, changesetTexts: [] }).ok, "unchanged API").toBe(true);
    expect(evaluate({ generated: committed, committed: null, base: undefined, changesetTexts: [] }).ok, "missing snapshot").toBe(false);
  });
});
