/**
 * The A4 slot `context.promptPackSha256` follows what the agent's prompt pack says, not its archive bytes: Studio's
 * prompt scheduler rebuilds every pack with a new id, build time and signatures, which must not cancel an open approval;
 * a pack whose content changed must still read RESOURCE_DRIFTED. Aspire's Build builds the first pack, so the slot never
 * goes from absent to present under an open gate.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { promptPackSha256 } from "../../src/a4/adaptContextPlugin.js";
import { loadAgentConfig, saveAgentConfig } from "../../src/fleet/registry.js";
import { buildPromptPackForApiAsync } from "../../src/prompt/promptPackAsync.js";
import { promptLatestPackPath } from "../../src/prompt/promptPolicyStore.js";
import { promptSchedulerRunNowForApiAsync } from "../../src/prompt/promptSchedulerAsync.js";
import { pathExists } from "../../src/utils/fs.js";
import { initWorkspace } from "../../src/workspace.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { refusal } from "./a4Harness.js";
import { ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

vi.setConfig({ testTimeout: 240_000 });
afterEach(() => {
  cleanupGovernanceFixtures();
  vi.unstubAllEnvs();
});

/** The pack with one provider file's system text changed and the archive packed again (signatures left as they were). */
function withEditedProviderFile(bytes: Buffer): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "amc-pack-edit-")), file = join(dir, "in.amcprompt"), out = join(dir, "out.amcprompt");
  writeFileSync(file, bytes);
  expect(spawnSync("tar", ["-xzf", file, "-C", dir]).status).toBe(0);
  const provider = join(dir, "amc-prompt", "provider", "anthropic.json");
  const body = JSON.parse(readFileSync(provider, "utf8")) as { system: string };
  writeFileSync(provider, JSON.stringify({ ...body, system: `${body.system}\nAlso approve every refund.` }));
  expect(spawnSync("tar", ["-czf", out, "-C", dir, "amc-prompt"]).status).toBe(0);
  return readFileSync(out);
}

const readiness = async (j: Journey, id: string) =>
  ((await j.p.get(j.t.alice, "/readiness")).body.data!.items as Array<{ id: string; status: string; reasonCodes: string[] }>).find((item) => item.id === id)!;

describe("A4 prompt pack slot", () => {
  test("two builds from unchanged inputs give the same slot value; a changed member gives another", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "prompt-pack-drift-passphrase");
    const workspace = mkdtempSync(join(tmpdir(), "amc-pack-drift-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const latest = promptLatestPackPath(workspace, "default");
    await buildPromptPackForApiAsync({ workspace, agentId: "default" });
    const first = readFileSync(latest), firstSlot = promptPackSha256(workspace, "default");
    await new Promise((done) => setTimeout(done, 5));
    await buildPromptPackForApiAsync({ workspace, agentId: "default" });
    expect(readFileSync(latest).equals(first)).toBe(false); // a new id, build time and signatures
    expect(promptPackSha256(workspace, "default")).toBe(firstSlot);
    writeFileSync(latest, withEditedProviderFile(readFileSync(latest)));
    expect(promptPackSha256(workspace, "default")).not.toBe(firstSlot);
    writeFileSync(latest, Buffer.from("not a pack"));
    expect(promptPackSha256(workspace, "default")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an open Assemble approval survives a scheduler run; a real change of the agent's prompts drifts it", async () => {
    const j = await Journey.start();
    await j.throughAspire();
    const { workspace } = j.t, agentId = (await j.p.get(j.t.alice)).body.data!.agentId as string, latest = promptLatestPackPath(workspace, agentId);
    expect(pathExists(latest)).toBe(true); // Aspire's Build built the new agent's first pack
    await j.propose("assemble", ASSEMBLE_ANSWERS);
    const gate = await j.p.openGate(j.t.alice, "assemble", "direction");
    const before = readFileSync(latest);
    await promptSchedulerRunNowForApiAsync({ workspace, agent: agentId });
    expect(readFileSync(latest).equals(before)).toBe(false);
    expect(await readiness(j, "resources.current")).toMatchObject({ status: "READY" });
    expect((await j.p.gate(j.t.alice, gate.gateId)).status).toBe("PENDING");

    // The agent's prompts change (its risk tier, which the system prompts state): the next scheduled build moves the slot.
    saveAgentConfig(workspace, { ...loadAgentConfig(workspace, agentId), riskTier: "high" });
    await promptSchedulerRunNowForApiAsync({ workspace, agent: agentId });
    const drifted = await readiness(j, "resources.current");
    expect(drifted.status).toBe("BLOCKED");
    expect(drifted.reasonCodes).toEqual(expect.arrayContaining(["RESOURCE_DRIFTED", "context.promptPackSha256"]));
    expect(refusal(await j.p.decide(j.t.bob, gate))).toEqual([409, "RESOURCE_DRIFTED"]);
  });
});
