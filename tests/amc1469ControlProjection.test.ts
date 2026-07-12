import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import Ajv from "ajv";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { handleComplianceRoute } from "../src/api/complianceRouter.js";
import {
  buildControlProjection,
  renderControlProjectionText,
} from "../src/enforce/controlProjection.js";
import {
  inspectGuardrailControlState,
  setGuardrailRequested,
} from "../src/enforce/guardrailControlState.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import {
  inspectRuntimeFirewallPolicy,
  writeRuntimeFirewallPolicy,
} from "../src/runtime/firewall.js";
import { initWorkspace } from "../src/workspace.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";

const roots: string[] = [];
const cliPath = resolve(process.cwd(), "dist/cli.js");
let previousPassphrase: string | undefined;
let previousFirewallEnabled: string | undefined;

function workspace(initialize = true): string {
  const root = mkdtempSync(join(tmpdir(), "amc-control-projection-"));
  roots.push(root);
  if (initialize) initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

function initializeControls(root: string): void {
  writeRuntimeFirewallPolicy({ workspace: root, mode: "warn" });
  setGuardrailRequested({
    workspace: root,
    name: "prompt-injection-detection",
    enabled: true,
    source: "cli",
    actor: "projection-test",
  });
  initActionPolicy(root);
  initApprovalPolicy(root);
}

function family(projection: ReturnType<typeof buildControlProjection>, familyId: string) {
  return projection.families.find((candidate) => candidate.familyId === familyId)!;
}

function control(projection: ReturnType<typeof buildControlProjection>, controlId: string) {
  return projection.families.flatMap((candidate) => candidate.controls)
    .find((candidate) => candidate.controlId === controlId)!;
}

function runCli(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: "amc-control-projection-test-passphrase",
    },
    timeout: 30_000,
  });
}

async function callProjectionApi(root: string, method = "GET") {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = method;
  req.url = "/api/v1/policy/controls";
  const response = { status: 0, body: "", headers: {} as Record<string, string> };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      response.status = status;
      response.headers = headers ?? {};
      return res;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) response.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  const handled = await handleComplianceRoute(
    "/api/v1/policy/controls",
    method,
    req,
    res,
    root,
  );
  return { handled, ...response, json: response.body ? JSON.parse(response.body) : null };
}

beforeEach(() => {
  previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  previousFirewallEnabled = process.env.AMC_FIREWALL_ENABLED;
  process.env.AMC_VAULT_PASSPHRASE = "amc-control-projection-test-passphrase";
  delete process.env.AMC_FIREWALL_ENABLED;
});

afterEach(() => {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  if (previousFirewallEnabled === undefined) delete process.env.AMC_FIREWALL_ENABLED;
  else process.env.AMC_FIREWALL_ENABLED = previousFirewallEnabled;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1469 verified control projection", () => {
  test("reports an uninitialized workspace without inventing signed defaults", () => {
    const root = workspace(false);
    const projection = buildControlProjection(root);

    expect(projection).toMatchObject({
      schemaVersion: "2026-07-11",
      status: "uninitialized",
      counts: { families: 3, controls: 5, active: 0, failClosed: 0 },
    });
    expect(projection.families.map((item) => item.familyId)).toEqual([
      "runtime-traffic",
      "action-policy",
      "approval-policy",
    ]);
    expect(family(projection, "action-policy").controls).toEqual([]);
    expect(family(projection, "approval-policy").controls).toEqual([]);
    expect(family(projection, "runtime-traffic").unboundGuardrails).toHaveLength(11);
    expect(readdirSync(root)).toEqual([]);
    expect(JSON.stringify(projection)).not.toContain(root);
    expect(JSON.stringify(projection)).not.toContain("amc-control-projection-test-passphrase");

    process.env.AMC_FIREWALL_ENABLED = "1";
    const required = buildControlProjection(root);
    expect(required.status).toBe("fail_closed");
    expect(family(required, "runtime-traffic").integrity).toBe("invalid");
    for (const row of family(required, "runtime-traffic").controls) {
      expect(row).toMatchObject({ effectiveAction: "block", status: "fail_closed", trusted: false });
    }

    delete process.env.AMC_FIREWALL_ENABLED;
    const partial = buildControlProjection(workspace());
    expect(partial.status).toBe("partial");
    expect(family(partial, "action-policy").integrity).toBe("trusted");
    expect(family(partial, "runtime-traffic").integrity).toBe("uninitialized");
    expect(family(partial, "approval-policy").integrity).toBe("uninitialized");
  });

  test("projects trusted runtime, action, and approval controls without re-evaluating them", () => {
    const root = workspace();
    initializeControls(root);
    const projection = buildControlProjection(root);

    expect(projection.status).toBe("trusted");
    expect(projection.counts).toMatchObject({ families: 3, controls: 23, active: 23, failClosed: 0 });
    expect(control(projection, "runtime:prompt-injection")).toMatchObject({
      scope: "request traffic",
      requestedAction: "warn",
      effectiveAction: "warn",
      status: "active",
      trusted: true,
      sourceRefs: ["guardrail-control-state", "runtime-firewall-policy"],
    });
    expect(control(projection, "action:WRITE_HIGH")).toMatchObject({
      scope: "action class WRITE_HIGH",
      requestedAction: "execute",
      effectiveAction: "execute",
      status: "active",
      trusted: true,
    });
    expect(control(projection, "action:WRITE_HIGH").when).toEqual(expect.arrayContaining([
      "mandatory: trust tier at least OBSERVED_HARDENED",
      "mandatory: execution ticket required",
    ]));
    expect(control(projection, "approval:WRITE_HIGH")).toMatchObject({
      scope: "action class WRITE_HIGH",
      requestedAction: "require_approval",
      effectiveAction: "require_approval",
      status: "active",
      trusted: true,
    });
    expect(control(projection, "approval:WRITE_HIGH").when).toEqual(expect.arrayContaining([
      "2 approvals required",
      "distinct users required",
      "approval expires after 15 minutes",
    ]));
  });

  test("keeps tampered action and approval policies inspectable with their real safe outcomes", () => {
    const root = workspace();
    initializeControls(root);
    appendFileSync(join(root, ".amc", "action-policy.yaml"), "\n# signature tamper\n");
    appendFileSync(join(root, ".amc", "approval-policy.yaml"), "\n# signature tamper\n");

    const projection = buildControlProjection(root);
    expect(projection.status).toBe("fail_closed");
    expect(family(projection, "action-policy").integrity).toBe("invalid");
    expect(family(projection, "approval-policy").integrity).toBe("invalid");
    expect(control(projection, "action:WRITE_LOW")).toMatchObject({
      requestedAction: "execute",
      effectiveAction: "simulate",
      status: "fail_closed",
      trusted: false,
    });
    expect(control(projection, "approval:WRITE_LOW")).toMatchObject({
      requestedAction: "require_approval",
      effectiveAction: "deny",
      status: "fail_closed",
      trusted: false,
    });

    const malformedRoot = workspace();
    initializeControls(malformedRoot);
    writeFileSync(join(malformedRoot, ".amc", "action-policy.yaml"), "actions: [secret-action-do-not-leak\n", "utf8");
    writeFileSync(join(malformedRoot, ".amc", "approval-policy.yaml"), "approvalPolicy: [secret-approval-do-not-leak\n", "utf8");
    const malformed = buildControlProjection(malformedRoot);
    expect(family(malformed, "action-policy").controls).toHaveLength(9);
    expect(family(malformed, "approval-policy").controls).toHaveLength(9);
    for (const row of family(malformed, "action-policy").controls) {
      expect(row).toMatchObject({
        requestedAction: "unavailable",
        effectiveAction: "simulate",
        status: "fail_closed",
        trusted: false,
      });
    }
    for (const row of family(malformed, "approval-policy").controls) {
      expect(row).toMatchObject({
        requestedAction: "unavailable",
        effectiveAction: "deny",
        status: "fail_closed",
        trusted: false,
      });
    }
    expect(JSON.stringify(malformed)).not.toContain(malformedRoot);
    expect(JSON.stringify(malformed)).not.toContain("secret-action-do-not-leak");
    expect(JSON.stringify(malformed)).not.toContain("secret-approval-do-not-leak");
  });

  test("projects invalid runtime control evidence as block without hiding diagnostics", () => {
    const root = workspace();
    initializeControls(root);
    const guardrails = inspectGuardrailControlState(root);
    expect(guardrails.headPath).toBeTruthy();
    appendFileSync(guardrails.headPath!, "\n");

    const projection = buildControlProjection(root);
    expect(projection.status).toBe("fail_closed");
    expect(family(projection, "runtime-traffic").integrity).toBe("invalid");
    for (const row of family(projection, "runtime-traffic").controls) {
      expect(row).toMatchObject({ effectiveAction: "block", status: "fail_closed", trusted: false });
    }
    expect(family(projection, "runtime-traffic").reasons.join(" ")).toMatch(/integrity/i);
  });

  test("returns the same read-only projection through the policy API", async () => {
    const root = workspace();
    initializeControls(root);
    const direct = buildControlProjection(root);
    const response = await callProjectionApi(root);

    expect(response).toMatchObject({ handled: true, status: 200 });
    expect(response.json).toMatchObject({ ok: true });
    expect(response.json.data).toMatchObject({
      status: direct.status,
      counts: direct.counts,
      families: direct.families,
    });
    await expect(callProjectionApi(root, "POST")).resolves.toMatchObject({ handled: false });
  });

  test("returns the same projection through JSON and human CLI output and exits nonzero on invalid state", () => {
    const root = workspace();
    initializeControls(root);
    const json = runCli(root, ["policy", "controls", "--json"]);
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ status: "trusted", counts: { controls: 23 } });

    const human = runCli(root, ["policy", "controls"]);
    expect(human.status).toBe(0);
    for (const label of ["Scope:", "When:", "Then:", "Status:"]) expect(human.stdout).toContain(label);

    const firewall = inspectRuntimeFirewallPolicy(root);
    expect(firewall.journalPath).toBeTruthy();
    appendFileSync(firewall.journalPath!, "\n");
    const invalid = runCli(root, ["policy", "controls", "--json"]);
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ status: "fail_closed" });
    const invalidProjection = buildControlProjection(root);
    for (const row of family(invalidProjection, "runtime-traffic").controls) {
      expect(row).toMatchObject({ effectiveAction: "block", status: "fail_closed", trusted: false });
    }
    expect(renderControlProjectionText(invalidProjection)).toContain("FAIL CLOSED");
  });

  test("publishes the bounded CLI, API, methodology, and competitive closure", () => {
    const published = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    const generated = generateFullOpenApiSpec();
    expect(published.paths["/v1/policy/controls"]?.get).toBeDefined();
    expect(published.components.schemas.ControlProjection).toBeDefined();
    expect(generated.paths["/api/v1/policy/controls"]?.get).toBeDefined();
    expect(generated.components.schemas.ControlProjection).toBeDefined();
    const validateResponse = new Ajv({ strict: false, validateFormats: false }).compile({
      ...generated.components.schemas.ControlProjectionResponse,
      components: generated.components,
    });
    const schemaRoot = workspace();
    initializeControls(schemaRoot);
    expect(validateResponse({ ok: true, data: buildControlProjection(schemaRoot) }), validateResponse.errors ?? [])
      .toBe(true);

    for (const path of ["README.md", "docs/CONTROL_PROJECTION.md", "docs/CLI_COMMAND_INVENTORY.md", "docs/API_REFERENCE.md"]) {
      const body = readFileSync(path, "utf8");
      expect(body, path).toContain("amc policy controls");
    }
    const review = readFileSync("docs/source-reviews/AMC-1469-verified-control-projection.md", "utf8");
    for (const required of [
      "83188b62c63e2b4ff9ada87048fd99605184ee5a",
      "Fail-closed rule",
      "No-bloat boundary",
      "no Agent Control compatibility claim",
    ]) expect(review).toContain(required);
    expect(readFileSync("docs/internal/agent-control-agentapprove-competitive-response.md", "utf8"))
      .toContain("Shipped in AMC-1469");
  });

  test("keeps the projection read-only and outside every policy evaluation path", () => {
    const source = readFileSync("src/enforce/controlProjection.ts", "utf8");
    expect(source).not.toMatch(/\b(writeFile|append|initActionPolicy|initApprovalPolicy|setGuardrailRequested|writeRuntimeFirewallPolicy)\b/);
    expect(source).not.toContain("agentcontrol");
    expect(source).not.toContain("Agent Control");
    expect(source).toContain("inspectGuardrailControlStateReadOnly");
    expect(source).not.toMatch(/\binspectGuardrailControlState\b/);
    expect(source).not.toContain("evaluateActionPermission");
    expect(source).not.toContain("evaluateApprovalQuorum");
    expect(source).not.toContain("evaluateRuntimeFirewall");
  });
});
