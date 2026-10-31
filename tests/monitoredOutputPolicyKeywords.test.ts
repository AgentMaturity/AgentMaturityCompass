import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createForeignRunner } from "../src/agent/foreignSubagentRunner.js";
import { initProcessorRegistry } from "../src/dataflow/processorRegistry.js";
import { deriveDeterministicAudits } from "../src/diagnostic/audits.js";
import { parseEvidenceEvent } from "../src/diagnostic/gates.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P2-02, opted-in workspaces: a monitored process's stored output keeps the keyword the transcript POLICY_VIOLATION
 * audit needs while its secret value is replaced, and a delegated foreign child's folded answer carries no redaction
 * markers.
 */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const PEM_BODY = "MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu";
const API_VALUE = "abcdefghijklmnop1234";

function optedInWorkspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = "monitored-output-fixture-passphrase";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-p202-monitor-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initProcessorRegistry(dir, { schemaVersion: "amc.dataflow-processors/v1", experimental: true,
    processors: [{ processorId: "proc-general", legalName: "Fixture General Processor",
      contracts: [{ kind: "DPA", reference: "DPA-GENERAL-1", effective: "2026-01-01", expires: null, dataClasses: ["pii"] }] }],
    purposes: [{ purposeId: "support", allowedDataClasses: ["pii"], allowedTools: ["model.request"], allowedProcessors: ["proc-general"] }],
    bindings: [{ providerId: "openai", baseUrl: "https://api.openai.invalid", processorId: "proc-general", purposeId: "support" }] });
  return dir;
}

async function runChild(dir: string, sessionId: string, lines: readonly string[]) {
  const script = join(dir, "fake-agent");
  writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' ${lines.map(line => `'${line}'`).join(" ")}\n`, "utf8");
  chmodSync(script, 0o755);
  const runner = createForeignRunner({ workspace: dir, spawn: (goal) => ({ command: script, args: [goal] }),
    governedEnv: () => ({ env: { AMC_LEASE: "lease-token-abc" }, lease: "lease-token-abc" }) });
  return runner({ continuable: false, toolsetAgentId: "payments-agent", childSessionId: sessionId, goal: "report",
    identity: { governedAs: "payments-agent", runAs: "researcher", depth: 1, parent: "payments-agent" } });
}

function storedOutput(dir: string, sessionId: string) {
  const ledger = openLedger(dir);
  try { return ledger.getAllEvents().filter(event => event.session_id === sessionId && event.event_type === "stdout").map(parseEvidenceEvent); }
  finally { ledger.close(); }
}

describe("monitored process rows in an opted-in workspace", () => {
  it("keep the private-key keyword for the POLICY_VIOLATION audit and replace the key itself", async () => {
    const dir = optedInWorkspace();
    const result = await runChild(dir, "child-pem", ["-----BEGIN RSA PRIVATE KEY-----", PEM_BODY, "-----END RSA PRIVATE KEY-----"]);
    expect(result.ok, result.reason).toBe(true);
    const rows = storedOutput(dir, "child-pem");
    expect(rows.map(row => row.text).join("")).not.toContain(PEM_BODY);
    expect(deriveDeterministicAudits(rows).filter(finding => finding.auditType === "POLICY_VIOLATION"))
      .toEqual([expect.objectContaining({ severity: "CRITICAL", sessionId: "child-pem" })]);
  });

  it("keep the api_key keyword for the POLICY_VIOLATION audit and replace its value", async () => {
    const dir = optedInWorkspace();
    const result = await runChild(dir, "child-key", [`api_key=${API_VALUE}`]);
    expect(result.ok, result.reason).toBe(true);
    const rows = storedOutput(dir, "child-key");
    expect(rows.map(row => row.text).join("")).not.toContain(API_VALUE);
    expect(deriveDeterministicAudits(rows).filter(finding => finding.auditType === "POLICY_VIOLATION"))
      .toEqual([expect.objectContaining({ severity: "CRITICAL" })]);
  });

  it("fold a delegated child's answer without the redaction markers", async () => {
    const dir = optedInWorkspace();
    const result = await runChild(dir, "child-answer", ["Wrote odalys.fenwick@example.com into the ticket.", `token api_key=${API_VALUE} rotated`]);
    expect(result.ok, result.reason).toBe(true);
    expect(storedOutput(dir, "child-answer").map(row => row.text).join(""), "the stored row is redacted").toContain("<AMC_REDACTED>");
    expect(result.text).not.toContain("<AMC_REDACTED>");
    expect(result.text).not.toContain("odalys.fenwick@example.com");
    expect(result.text).not.toContain(API_VALUE);
    expect(result.text).toContain("Wrote  into the ticket.");
  });
});
