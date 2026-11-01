/**
 * P1-64 follow-up: a comment names the surface it came through. The Studio console sends no `via` and records "studio";
 * amc_a4_comment sends "mcp". Both are in the signed COMMENT body and come back from GET …/comments; the console marks MCP.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderCard } from "../../src/console/assets/a4View.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { A4Project, a4Workspace, refusal } from "./a4Harness.js";

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => cleanupGovernanceFixtures());

describe("comment via", () => {
  test("a Studio comment and an MCP comment each round-trip their via through the signed body", async () => {
    const { workspace, alice } = a4Workspace();
    const p = await A4Project.create(workspace, alice);
    const typed = await p.post(alice, "/comments", { body: "typed in Studio", cardId: "aspire.brief", expectedHeadSeq: undefined });
    const sent = await p.post(alice, "/comments", { body: "sent by MCP", cardId: "aspire.brief", via: "mcp", expectedHeadSeq: undefined });
    expect([typed.status, sent.status]).toEqual([201, 201]);
    const comments = (await p.get(alice, "/comments")).body.data!.comments as Array<{ body: string; via: string | null }>;
    expect(comments.map(({ body, via }) => [body, via])).toEqual([["typed in Studio", "studio"], ["sent by MCP", "mcp"]]);
    const transitions = (await p.get(alice, "/transitions")).body.data!.transitions as Array<{ kind: string; body: { via?: string } }>;
    expect(transitions.filter((row) => row.kind === "COMMENT").map((row) => row.body.via)).toEqual(["studio", "mcp"]);
    expect(refusal(await p.post(alice, "/comments", { body: "x", cardId: "aspire.brief", via: "cli", expectedHeadSeq: undefined }))[0]).toBe(400);
  });

  test("the console marks an MCP comment and leaves a Studio one unmarked", () => {
    const card = { id: "brief", title: "Brief", render: () => "" };
    const ctx = { stage: "aspire", project: { members: [] } };
    const row = (via: string | null) => renderCard(card, ctx, [{ cardId: "aspire:brief", authorKey: "LOCAL_USER:u", body: "hi", via, ts: 0 }]) as string;
    expect(row("mcp")).toContain("VIA MCP");
    expect(row("studio")).not.toContain("VIA MCP");
    expect(row(null)).not.toContain("VIA MCP");
  });
});
