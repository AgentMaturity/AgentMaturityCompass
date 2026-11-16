import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { corpusPack, loadCorpusPack, parseCorpus } from "../src/assurance/corpora/publicCorpus.js";
import { redTeamExtras } from "../src/redteam/attackerCli.js";
import { runRedTeam } from "../src/redteam/runner.js";
import { initWorkspace } from "../src/workspace.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/** S7: the loader turns a corpus file into effect-graded scenarios and records source and licence per item. */
const SAMPLE = new URL("../docs/assurance/public-corpus-sample.jsonl", import.meta.url);

describe("public corpus loader", () => {
  test("the shipped made-up sample round-trips into scenarios with source and licence per item", () => {
    const items = parseCorpus(readFileSync(SAMPLE, "utf8"));
    expect(items.map((item) => item.id)).toEqual(["sample-1", "sample-2", "sample-3"]);
    expect(items.every((item) => item.source.startsWith("made-up sample") && item.licence === "MIT (same as AMC)")).toBe(true);
    const pack = loadCorpusPack(SAMPLE.pathname);
    expect(pack.id).toBe("corpus");
    expect(pack.scenarios.map((s) => s.id)).toEqual(["corpus-sample-1", "corpus-sample-2", "corpus-sample-3"]);
    expect(pack.scenarios[0]!.title).toContain("licence MIT (same as AMC)");
    expect(pack.scenarios.every((s) => s.effect?.slot !== undefined && s.effect.taskInAttack)).toBe(true);
    expect(pack.scenarios[1]!.buildPrompt({} as never)).toContain(items[1]!.injection);
  });

  test("reads the published field names and file-level defaults", () => {
    const items = parseCorpus(`{"corpus": {"source": "https://example.test/c", "license": "MIT"}}\n{"behavior_id": "b1", "attack": "text one"}\n`);
    expect(items).toEqual([{ id: "b1", injection: "text one", source: "https://example.test/c", licence: "MIT" }]);
  });

  test("refuses items with no source or licence, duplicate ids, bad ids, control characters and empty files", () => {
    expect(() => parseCorpus(`{"id": "a", "injection": "x"}`)).toThrow(/line 1: no source or licence/);
    const head = `{"corpus": {"source": "s", "licence": "l"}}\n`;
    expect(() => parseCorpus(`${head}{"id": "a", "injection": "x"}\n{"id": "a", "injection": "y"}`)).toThrow(/appears twice/);
    expect(() => parseCorpus(`${head}{"id": "a b", "injection": "x"}`)).toThrow(/"id" must be/);
    expect(() => parseCorpus(`${head}{"id": "a", "injection": "x", "licence": "MIT\\u001b[2J"}`)).toThrow(/plain text/);
    expect(() => parseCorpus(head)).toThrow(/no items/);
    expect(() => parseCorpus("not json")).toThrow(/line 1 is not JSON/);
    expect(corpusPack(parseCorpus(`${head}{"id": "a", "injection": "x"}`), "f.jsonl").title).toBe("Public attack corpus (f.jsonl)");
  });
});

describe("amc redteam run --corpus", () => {
  let agent: FakeAgentServer;
  let restore: () => void;
  const roots: string[] = [];
  beforeAll(async () => {
    agent = await startFakeAgentServer({ toolCalls: () => [{ name: "create_ticket", arguments: { title: "Wrong VAT number", summary: "Invoice VAT number is wrong." } }] });
    restore = useFakeAgentEnv(agent.baseUrl);
  });
  afterAll(async () => { restore(); await agent.close(); });
  afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

  test("runs the corpus items as effect-graded rows next to the chosen plugins", async () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-corpus-"));
    roots.push(ws);
    process.env.AMC_VAULT_PASSPHRASE = "corpus-passphrase";
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["exfiltrationChannels"], ...redTeamExtras({ corpus: SAMPLE.pathname }, ws) });
    const corpus = report.pluginResults.find((pr) => pr.packId === "corpus")!;
    expect(corpus.scenarioResults).toHaveLength(3);
    expect(corpus.scenarioResults.every((row) => row.gradingMethod === "structured" && row.pass)).toBe(true);
  }, 120_000);
});
