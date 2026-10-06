import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { validateSliceMap } from "../scripts/program/landing-slice-map.mjs";

/** P0-04: the committed commit-to-slice map for candidate 37c1466b. Reads only the JSON, never git. */
const committed = JSON.parse(readFileSync(new URL("../docs/program/landing/slice-map.json", import.meta.url), "utf8"));
const ISSUE_TABLE = ["P0-12", "P0-13", "P0-14", "P1-15", "P1-16", "P1-17", "P1-42", "P1-43", "P1-44", "P1-45", "P1-46", "ALL"];

type Commit = { sha: string; kind: string; action: string; issue: string; track: string | null };
type Track = { track: string; branch: string; head: string; acceptedHead: string | null; mergeCommit: string; verdictFile: string; slice: string };

function copy() {
  return structuredClone(committed);
}

describe("P0-04 landing slice map", () => {
  test("the committed map is valid", () => {
    expect(validateSliceMap(committed)).toEqual([]);
  });

  test("it covers all 229 commits and 31 merges of 37c1466b with unique SHAs", () => {
    const commits: Commit[] = committed.commits;
    expect(committed.candidate.head).toBe("37c1466b32ed878ed89877fdcae2e3145d82d546");
    expect(committed.candidate.commitsAhead).toBe(229);
    expect(committed.candidate.merges).toBe(31);
    expect(commits).toHaveLength(229);
    expect(commits.filter((c) => c.kind === "merge")).toHaveLength(31);
    expect(commits.filter((c) => c.kind === "root")).toHaveLength(8);
    expect(new Set(commits.map((c) => c.sha)).size).toBe(229);
  });

  test("each of the 31 worker branches maps to one slice with its head, merge and verdict file", () => {
    const tracks: Track[] = committed.tracks;
    const commits: Commit[] = committed.commits;
    const slices = new Set(committed.slices.map((s: { id: string }) => s.id));
    expect(tracks).toHaveLength(31);
    expect(new Set(tracks.map((t) => t.branch)).size).toBe(31);
    for (const t of tracks) {
      const own = commits.filter((c) => c.track === t.track).map((c) => c.sha);
      expect(own, t.track).toContain(t.head);
      if (t.acceptedHead !== null) expect(own, t.track).toContain(t.acceptedHead);
      expect(commits.find((c) => c.sha === t.mergeCommit)?.kind, t.track).toBe("merge");
      expect(t.verdictFile, t.track).not.toBe("");
      expect(slices.has(t.slice), t.track).toBe(true);
    }
  });

  test("build orders are unique and every issue key comes from the slice table", () => {
    const orders = committed.slices.map((s: { buildOrder: number }) => s.buildOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...new Set(committed.slices.map((s: { issue: string }) => s.issue))].sort()).toEqual([...ISSUE_TABLE].sort());
    for (const c of committed.commits as Commit[]) expect(ISSUE_TABLE, c.sha).toContain(c.issue);
  });

  describe("negative fixtures fail", () => {
    test("a receipt-only commit marked cherry-pick", () => {
      const map = copy();
      const receipt = map.commits.find((c: Commit) => c.kind === "receipt-only");
      receipt.action = "cherry-pick";
      expect(validateSliceMap(map).join("\n")).toMatch(/receipt-only commit \w+ must be skip-receipt/);
    });

    test("a duplicated SHA", () => {
      const map = copy();
      map.commits[1].sha = map.commits[0].sha;
      expect(validateSliceMap(map).join("\n")).toMatch(/duplicate commit/);
    });

    test("228 commits", () => {
      const map = copy();
      map.commits.splice(map.commits.findIndex((c: Commit) => c.kind === "code"), 1);
      expect(validateSliceMap(map).join("\n")).toMatch(/228 commits, expected 229/);
    });

    test("an unknown issue key", () => {
      const map = copy();
      map.commits[0].issue = "P9-99";
      expect(validateSliceMap(map).join("\n")).toMatch(/issue P9-99/);
    });

    test("a commit that carries AMC_OS paths marked plain cherry-pick", () => {
      const map = copy();
      const mixed = map.commits.find((c: Commit) => c.kind === "mixed");
      mixed.action = "cherry-pick";
      expect(validateSliceMap(map).join("\n")).toMatch(/AMC_OS/);
    });
  });
});
