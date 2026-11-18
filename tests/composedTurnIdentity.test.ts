import { describe, expect, it } from "vitest";
import { compositionDigestOf } from "../src/kernel/composedTurnIdentity.js";

type Options = Parameters<typeof compositionDigestOf>[0];
type Profile = Parameters<typeof compositionDigestOf>[1];
const options = { workspace: "/w", agentId: "a", prompt: "", routes: [], route: { providerId: "stub", model: "fixed", params: {} } } as unknown as Options;
const digest = (contexts: readonly string[]) => compositionDigestOf(options,
  { sections: [], contextPlugins: contexts.map((name) => ({ name, order: 0, collect: async () => "" })), variables: {} } as unknown as Profile);

/**
 * UX-02: chat runs each turn as `agent-loop run --session <id>`, which refuses a resume whose composition digest differs
 * from the one on `session/open`. A `/skill` turn adds a `skill:<name>` context for that turn only, so the digest must not
 * count it, or a skill turn and a plain turn can never share a session.
 */
describe("the composition digest and per-turn skills (UX-02)", () => {
  it("is the same with or without a skill loaded for the turn", () => {
    expect(digest(["workspace-instructions", "skill:tidy_notes"])).toBe(digest(["workspace-instructions"]));
    expect(digest(["workspace-instructions", "skill:a"])).toBe(digest(["workspace-instructions", "skill:b"]));
  });

  it("still changes when any other context changes", () => {
    expect(digest(["workspace-instructions", "a4:context"])).not.toBe(digest(["workspace-instructions"]));
  });
});
