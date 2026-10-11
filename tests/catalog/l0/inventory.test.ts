import { copyFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentConfig, initFleet, scaffoldAgent, signAgentConfig, verifyAgentConfigSignature } from "../../../src/fleet/registry.js";
import { fixturesFor } from "./harness.js";
import { newWorkspace } from "./workspaces.js";

/**
 * L0-INV-01 against the real signed agent registry (P1-14): the auditor signature over agents/<id>/agent.config.yaml,
 * verified by verifyAgentConfigSignature. This covers the configuration check only. Nothing refuses a session for an
 * unregistered or unsigned agent yet (proposed follow-up P1-70), so session refusal is not tested here.
 */
type EntrySetup = { agentId: string; entry: "signed" | "missing" | "signature_removed" | "edited_after_signing" | "signed_by_other_workspace" };

function scaffold(ws: string, agentId: string): { configPath: string; sigPath: string } {
  initFleet(ws);
  const config = buildAgentConfig({ agentId, agentName: "Fixture Agent", role: "layer0-fixture", domain: "technology",
    primaryTasks: ["fixture task"], stakeholders: ["owner"], riskTier: "med", templateId: "openai", baseUrl: "https://api.openai.com",
    routePrefix: "/openai", auth: { type: "bearer_env", env: "OPENAI_API_KEY" } });
  const made = scaffoldAgent(ws, config);
  return { configPath: made.configPath, sigPath: made.configSigPath };
}

describe("L0-INV-01 agent registry entry (signed agent.config.yaml)", () => {
  const fixtures = fixturesFor("agent_config", "L0-INV-01");
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(1));
  for (const f of fixtures) {
    it(`${f.ref}: ${f.envelope.expected.result} ${f.envelope.expected.reasonCode ?? ""}`, () => {
      const s = f.envelope.setup as unknown as EntrySetup;
      const ws = newWorkspace();
      if (s.entry !== "missing") {
        const paths = scaffold(ws, s.agentId);
        if (s.entry === "signature_removed") unlinkSync(paths.sigPath);
        if (s.entry === "edited_after_signing") writeFileSync(paths.configPath, `${readFileSync(paths.configPath, "utf8")}\n# purpose widened after signing\n`);
        if (s.entry === "signed_by_other_workspace") {
          const other = newWorkspace("amc-l0-other-");
          const otherPaths = scaffold(other, s.agentId);
          mkdirSync(dirname(otherPaths.configPath), { recursive: true });
          copyFileSync(paths.configPath, otherPaths.configPath);
          signAgentConfig(other, s.agentId);
          copyFileSync(otherPaths.sigPath, paths.sigPath);
        }
      }
      const verified = verifyAgentConfigSignature(ws, s.agentId);
      const result = verified.valid ? "pass" : "fail";
      const code = verified.valid ? null : verified.signatureExists ? "signature_invalid" : "signature_missing";
      expect(result, verified.reason ?? "").toBe(f.envelope.expected.result);
      expect(code).toBe(f.envelope.expected.reasonCode);
    });
  }
});
