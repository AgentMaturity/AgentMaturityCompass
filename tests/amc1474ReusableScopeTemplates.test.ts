import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import Ajv from "ajv";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  initApprovalPolicy,
  loadApprovalPolicy,
  verifyApprovalPolicySignature,
} from "../src/approvals/approvalPolicyEngine.js";
import { resolveApiRolePolicy } from "../src/api/accessPolicy.js";
import { handleComplianceRoute } from "../src/api/complianceRouter.js";
import { buildControlProjection } from "../src/enforce/controlProjection.js";
import {
  applyScopeTemplate,
  compileScopeTemplate,
  listScopeTemplates,
  ScopeTemplateError,
} from "../src/enforce/scopeTemplates.js";
import { ACTION_CLASSES } from "../src/governor/actionCatalog.js";
import {
  actionPolicyPath,
  initActionPolicy,
  loadActionPolicy,
  signActionPolicy,
  verifyActionPolicySignature,
} from "../src/governor/actionPolicyEngine.js";
import { withControlFileLock } from "../src/lifecycle/controlFileLock.js";
import { openLedger } from "../src/ledger/ledger.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import { readTransparencyEntries } from "../src/transparency/logChain.js";
import { trustConfigPath } from "../src/trust/trustConfig.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
const cliPath = resolve(process.cwd(), "dist/cli.js");
let previousPassphrase: string | undefined;

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-scope-template-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

function initializeCustomizedPolicies(root: string): void {
  const action = loadActionPolicy(root);
  const deploy = action.actions.find((rule) => rule.actionClass === "DEPLOY")!;
  const writeLow = action.actions.find((rule) => rule.actionClass === "WRITE_LOW")!;
  deploy.allowExecute = false;
  deploy.requireExecTicket = false;
  writeLow.requireExecTicket = true;
  initActionPolicy(root, action);

  const approval = loadApprovalPolicy(root);
  approval.approvalPolicy.actionClasses.DEPLOY!.requiredApprovals = 1;
  approval.approvalPolicy.actionClasses.WRITE_LOW!.ttlMinutes = 7;
  initApprovalPolicy(root, approval);
}

function runCli(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: "amc-scope-template-test-passphrase",
    },
    timeout: 30_000,
  });
}

async function callPolicyApi(root: string, pathname: string, method: string, body?: unknown) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as IncomingMessage;
  req.method = method;
  req.url = pathname;
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
  const handled = await handleComplianceRoute(pathname, method, req, res, root);
  return { handled, ...response, json: response.body ? JSON.parse(response.body) : null };
}

beforeEach(() => {
  previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "amc-scope-template-test-passphrase";
});

afterEach(() => {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1474 reusable action-class scope templates", () => {
  test("publishes four deterministic AMC-owned templates that partition existing action classes", () => {
    const templates = listScopeTemplates();
    expect(templates.map((template) => template.templateId)).toEqual([
      "read-only",
      "workspace-change",
      "release-external",
      "privileged-sensitive",
    ]);
    expect(templates.flatMap((template) => template.actionClasses).sort()).toEqual([...ACTION_CLASSES].sort());
    expect(new Set(templates.flatMap((template) => template.actionClasses)).size).toBe(ACTION_CLASSES.length);
    expect(listScopeTemplates()).toEqual(templates);
  });

  test("compiles a selected scope read-only and applies only that scope with exact confirmation", () => {
    const root = workspace();
    initializeCustomizedPolicies(root);
    const actionPath = join(root, ".amc", "action-policy.yaml");
    const approvalPath = join(root, ".amc", "approval-policy.yaml");
    const before = {
      action: readFileSync(actionPath, "utf8"),
      approval: readFileSync(approvalPath, "utf8"),
      transparency: readTransparencyEntries(root),
    };

    const preview = compileScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
    });
    expect(preview).toMatchObject({
      template: { templateId: "release-external", actionClasses: ["DEPLOY", "NETWORK_EXTERNAL"] },
      pack: { packId: "code-agent.low" },
      scope: "workspace",
      status: "ready",
      canApply: true,
    });
    expect(preview.compileId).toMatch(/^scope-compile-[a-f0-9]{16}$/);
    expect(preview.changes.map((change) => change.actionClass)).toEqual(["DEPLOY", "NETWORK_EXTERNAL"]);
    expect(JSON.stringify(preview)).not.toContain(root);
    expect(readFileSync(actionPath, "utf8")).toBe(before.action);
    expect(readFileSync(approvalPath, "utf8")).toBe(before.approval);
    expect(readTransparencyEntries(root)).toEqual(before.transparency);

    const applied = applyScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
      confirmCompileId: preview.compileId,
    });
    expect(applied).toMatchObject({ applied: true, compileId: preview.compileId });
    expect(applied.transparencyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(applied.auditEventId).toEqual(expect.any(String));
    expect(verifyActionPolicySignature(root).valid).toBe(true);
    expect(verifyApprovalPolicySignature(root).valid).toBe(true);

    const action = loadActionPolicy(root);
    const approval = loadApprovalPolicy(root);
    expect(action.actions.find((rule) => rule.actionClass === "DEPLOY")).toMatchObject({
      allowExecute: true,
      requireExecTicket: true,
    });
    expect(action.actions.find((rule) => rule.actionClass === "WRITE_LOW")?.requireExecTicket).toBe(true);
    expect(approval.approvalPolicy.actionClasses.DEPLOY?.requiredApprovals).toBe(2);
    expect(approval.approvalPolicy.actionClasses.WRITE_LOW?.ttlMinutes).toBe(7);
    expect(sha256Hex(readFileSync(actionPath))).toBe(preview.candidate.actionPolicySha256);
    expect(sha256Hex(readFileSync(approvalPath))).toBe(preview.candidate.approvalPolicySha256);
    expect(readTransparencyEntries(root).at(-1)).toMatchObject({
      type: "POLICY_SCOPE_TEMPLATE_APPLIED",
      artifact: { kind: "policy", id: preview.compileId },
    });

    const ledger = openLedger(root);
    try {
      const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?")
        .get(applied.auditEventId) as { meta_json: string } | undefined;
      expect(row).toBeDefined();
      expect(JSON.parse(row!.meta_json)).toMatchObject({
        auditType: "POLICY_SCOPE_TEMPLATE_APPLIED",
        scope: "workspace",
        templateId: "release-external",
        templateVersion: 1,
        packId: "code-agent.low",
        actionClasses: ["DEPLOY", "NETWORK_EXTERNAL"],
        compileId: preview.compileId,
        baseline: preview.baseline,
        candidate: preview.candidate,
        receipt: expect.any(String),
      });
    } finally {
      ledger.close();
    }
  });

  test("fails closed on stale confirmation and untrusted baseline without success evidence", () => {
    const root = workspace();
    initializeCustomizedPolicies(root);
    const preview = compileScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
    });
    const actionPath = join(root, ".amc", "action-policy.yaml");
    appendFileSync(actionPath, "\n# owner change\n", "utf8");
    signActionPolicy(root);

    expect(() => applyScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
      confirmCompileId: preview.compileId,
    })).toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({
      name: "ScopeTemplateError",
      code: "CONFIRMATION_REQUIRED",
    }));
    expect(readTransparencyEntries(root).some((entry) => entry.type === "POLICY_SCOPE_TEMPLATE_APPLIED")).toBe(false);

    appendFileSync(actionPath, "\n# unsigned tamper\n", "utf8");
    expect(() => compileScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
    })).toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({
      name: "ScopeTemplateError",
      code: "BASELINE_UNTRUSTED",
    }));
  });

  test("reports a semantic no-op without writing policy or evidence", () => {
    const root = workspace();
    initActionPolicy(root);
    initApprovalPolicy(root);
    const actionPath = join(root, ".amc", "action-policy.yaml");
    const approvalPath = join(root, ".amc", "approval-policy.yaml");
    const before = {
      action: readFileSync(actionPath),
      actionSig: readFileSync(`${actionPath}.sig`),
      approval: readFileSync(approvalPath),
      approvalSig: readFileSync(`${approvalPath}.sig`),
      transparency: readTransparencyEntries(root),
    };
    const preview = compileScopeTemplate({
      workspace: root,
      templateId: "read-only",
      packId: "code-agent.low",
    });
    expect(preview).toMatchObject({ status: "no_changes", canApply: false });
    const applied = applyScopeTemplate({
      workspace: root,
      templateId: "read-only",
      packId: "code-agent.low",
      confirmCompileId: preview.compileId,
    });
    expect(applied).toMatchObject({
      applied: false,
      reason: "NO_CHANGES",
      transparencyHash: null,
      auditEventId: null,
    });
    expect(readFileSync(actionPath)).toEqual(before.action);
    expect(readFileSync(`${actionPath}.sig`)).toEqual(before.actionSig);
    expect(readFileSync(approvalPath)).toEqual(before.approval);
    expect(readFileSync(`${approvalPath}.sig`)).toEqual(before.approvalSig);
    expect(readTransparencyEntries(root)).toEqual(before.transparency);
  });

  test("rejects unknown, malformed, and duplicate policy state with bounded reason codes", () => {
    const root = workspace();
    initActionPolicy(root);
    initApprovalPolicy(root);
    expect(() => compileScopeTemplate({ workspace: root, templateId: "upstream-regex", packId: "code-agent.low" }))
      .toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({ code: "TEMPLATE_NOT_FOUND" }));
    expect(() => compileScopeTemplate({ workspace: root, templateId: "read-only", packId: "external-pack" }))
      .toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({ code: "PACK_NOT_FOUND" }));

    const duplicate = loadActionPolicy(root);
    duplicate.actions.push({ ...duplicate.actions[0]! });
    initActionPolicy(root, duplicate);
    expect(() => compileScopeTemplate({ workspace: root, templateId: "read-only", packId: "code-agent.low" }))
      .toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({ code: "POLICY_DUPLICATE_ACTION" }));

    writeFileSync(actionPolicyPath(root), "actions: [malformed\n", "utf8");
    signActionPolicy(root);
    expect(() => compileScopeTemplate({ workspace: root, templateId: "read-only", packId: "code-agent.low" }))
      .toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({ code: "POLICY_SCHEMA_INVALID" }));

    const incompleteRoot = workspace();
    const incomplete = loadActionPolicy(incompleteRoot);
    incomplete.actions = incomplete.actions.filter((rule) => rule.actionClass !== "DEPLOY");
    initActionPolicy(incompleteRoot, incomplete);
    initApprovalPolicy(incompleteRoot);
    expect(() => compileScopeTemplate({
      workspace: incompleteRoot,
      templateId: "release-external",
      packId: "code-agent.low",
    })).toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({ code: "PACK_SCOPE_INCOMPLETE" }));
  });

  test("restores all policy and signature bytes when signing fails and rejects a busy writer", () => {
    const root = workspace();
    initializeCustomizedPolicies(root);
    const preview = compileScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
    });
    const paths = [
      join(root, ".amc", "action-policy.yaml"),
      join(root, ".amc", "action-policy.yaml.sig"),
      join(root, ".amc", "approval-policy.yaml"),
      join(root, ".amc", "approval-policy.yaml.sig"),
    ];
    const before = new Map(paths.map((path) => [path, readFileSync(path)]));
    delete process.env.AMC_VAULT_PASSPHRASE;
    lockVault(root);
    expect(() => applyScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
      confirmCompileId: preview.compileId,
    })).toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({ code: "APPLY_FAILED" }));
    process.env.AMC_VAULT_PASSPHRASE = "amc-scope-template-test-passphrase";
    for (const path of paths) expect(readFileSync(path)).toEqual(before.get(path));
    expect(readTransparencyEntries(root).some((entry) => entry.type === "POLICY_SCOPE_TEMPLATE_APPLIED")).toBe(false);

    withControlFileLock({
      root: join(root, ".amc"),
      name: "scope-template",
      operation: () => {
        expect(() => applyScopeTemplate({
          workspace: root,
          templateId: "release-external",
          packId: "code-agent.low",
          confirmCompileId: preview.compileId,
        })).toThrowError(expect.objectContaining<Partial<ScopeTemplateError>>({ code: "LOCK_BUSY" }));
      },
    });
  });

  test("exposes bounded list, compile, and exact-confirm behavior through the CLI", () => {
    const root = workspace();
    initializeCustomizedPolicies(root);
    const listed = runCli(root, ["policy", "scope", "list", "--json"]);
    expect(listed.status).toBe(0);
    expect(JSON.parse(listed.stdout).templates).toHaveLength(4);

    const compiled = runCli(root, [
      "policy", "scope", "compile", "release-external", "--pack", "code-agent.low", "--json",
    ]);
    expect(compiled.status).toBe(0);
    const preview = JSON.parse(compiled.stdout);
    expect(preview).toMatchObject({
      scope: "workspace",
      template: { templateId: "release-external" },
      pack: { packId: "code-agent.low" },
      canApply: true,
    });

    const denied = runCli(root, [
      "policy", "scope", "apply", "release-external", "--pack", "code-agent.low",
      "--confirm", "scope-compile-0000000000000000", "--json",
    ]);
    expect(denied.status).toBe(2);
    expect(JSON.parse(denied.stderr)).toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_REQUIRED" },
    });
    expect(`${denied.stdout}${denied.stderr}`).not.toContain(root);

    const applied = runCli(root, [
      "policy", "scope", "apply", "release-external", "--pack", "code-agent.low",
      "--confirm", preview.compileId, "--json",
    ]);
    expect(applied.status).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ applied: true, compileId: preview.compileId });
  });

  test("exposes one bounded API contract with read preview and owner-only mutation", async () => {
    const root = workspace();
    initializeCustomizedPolicies(root);
    const listed = await callPolicyApi(root, "/api/v1/policy/scope-templates", "GET");
    expect(listed).toMatchObject({ handled: true, status: 200 });
    expect(listed.json.data.templates).toHaveLength(4);

    const compiled = await callPolicyApi(root, "/api/v1/policy/scope-templates/compile", "POST", {
      templateId: "release-external",
      packId: "code-agent.low",
    });
    expect(compiled).toMatchObject({ handled: true, status: 200 });
    expect(compiled.json.data).toMatchObject({ canApply: true, scope: "workspace" });
    expect(JSON.stringify(compiled.json)).not.toContain(root);

    const denied = await callPolicyApi(root, "/api/v1/policy/scope-templates/apply", "POST", {
      templateId: "release-external",
      packId: "code-agent.low",
      confirmCompileId: "scope-compile-0000000000000000",
    });
    expect(denied).toMatchObject({ handled: true, status: 409 });
    expect(denied.json).toMatchObject({ ok: false });
    expect(denied.json.error).toContain("CONFIRMATION_REQUIRED");

    const malformed = await callPolicyApi(root, "/api/v1/policy/scope-templates/compile", "POST", {
      templateId: "release-external",
      packId: "code-agent.low",
      providerSelector: "upstream-step-name",
    });
    expect(malformed).toMatchObject({ handled: true, status: 400 });
    expect(malformed.json).toMatchObject({ ok: false });

    expect(resolveApiRolePolicy("/api/v1/policy/scope-templates", "GET"))
      .toMatchObject({ access: "read" });
    expect(resolveApiRolePolicy("/api/v1/policy/scope-templates/compile", "POST"))
      .toMatchObject({ access: "analyze" });
    expect(resolveApiRolePolicy("/api/v1/policy/scope-templates/apply", "POST"))
      .toMatchObject({ access: "owner", roles: ["OWNER"] });
  });

  test("keeps remote apply read-only when signed trust configuration is tampered", async () => {
    const root = workspace();
    initializeCustomizedPolicies(root);
    const compiled = await callPolicyApi(root, "/api/v1/policy/scope-templates/compile", "POST", {
      templateId: "release-external",
      packId: "code-agent.low",
    });
    const actionPath = join(root, ".amc", "action-policy.yaml");
    const approvalPath = join(root, ".amc", "approval-policy.yaml");
    const before = {
      action: readFileSync(actionPath),
      approval: readFileSync(approvalPath),
      transparency: readTransparencyEntries(root),
    };
    appendFileSync(trustConfigPath(root), "\n# unsigned trust tamper\n", "utf8");

    const denied = await callPolicyApi(root, "/api/v1/policy/scope-templates/apply", "POST", {
      templateId: "release-external",
      packId: "code-agent.low",
      confirmCompileId: compiled.json.data.compileId,
    });
    expect(denied).toMatchObject({ handled: true, status: 403 });
    expect(denied.json).toMatchObject({ ok: false });
    expect(denied.json.error).toContain("READ_ONLY_MODE");
    expect(readFileSync(actionPath)).toEqual(before.action);
    expect(readFileSync(approvalPath)).toEqual(before.approval);
    expect(readTransparencyEntries(root)).toEqual(before.transparency);
  });

  test("publishes generated and public OpenAPI contracts for catalog, compile, and apply", () => {
    const generated = generateFullOpenApiSpec();
    const published = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    for (const suffix of ["", "/compile", "/apply"]) {
      expect(generated.paths[`/api/v1/policy/scope-templates${suffix}`]).toBeDefined();
      expect(published.paths[`/v1/policy/scope-templates${suffix}`]).toBeDefined();
    }
    expect(Object.keys(generated.paths["/api/v1/policy/scope-templates"].get.responses).sort())
      .toEqual(["200", "401", "500"]);
    expect(Object.keys(generated.paths["/api/v1/policy/scope-templates/compile"].post.responses).sort())
      .toEqual(["200", "400", "401", "409", "500"]);
    expect(Object.keys(generated.paths["/api/v1/policy/scope-templates/apply"].post.responses).sort())
      .toEqual(["200", "400", "401", "403", "409", "423", "500"]);
    expect(Object.keys(published.paths["/v1/policy/scope-templates"].get.responses).sort())
      .toEqual(["200", "401", "500"]);
    expect(Object.keys(published.paths["/v1/policy/scope-templates/compile"].post.responses).sort())
      .toEqual(["200", "400", "401", "409", "500"]);
    expect(Object.keys(published.paths["/v1/policy/scope-templates/apply"].post.responses).sort())
      .toEqual(["200", "400", "401", "403", "409", "423", "500"]);
    for (const schema of [
      "ScopeTemplate",
      "ScopeTemplateCompilation",
      "ScopeTemplateApplyRequest",
      "ScopeTemplateApplyResult",
    ]) {
      expect(generated.components.schemas[schema]).toBeDefined();
      expect(published.components.schemas[schema]).toBeDefined();
    }

    const root = workspace();
    initializeCustomizedPolicies(root);
    const preview = compileScopeTemplate({
      workspace: root,
      templateId: "release-external",
      packId: "code-agent.low",
    });
    const validate = new Ajv({ strict: false, validateFormats: false }).compile({
      ...generated.components.schemas.ScopeTemplateCompilation,
      components: generated.components,
    });
    expect(validate(preview), validate.errors ?? []).toBe(true);
  });

  test("uses the same preview and exact-confirm contract in Studio without a generic confirm dialog", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    const start = app.indexOf('const scopeTemplateSelect = document.getElementById("scopeTemplateSelect")');
    const end = app.indexOf('const rows = document.getElementById("packRows")', start);
    const scopeUi = app.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(scopeUi).toContain('/api/v1/policy/scope-templates/compile');
    expect(scopeUi).toContain('/api/v1/policy/scope-templates/apply');
    expect(scopeUi).toContain('scopeConfirm.value.trim() !== scopePreview.compileId');
    expect(scopeUi).toContain('scopeTemplateSelect.addEventListener("change", clearScopePreview)');
    expect(scopeUi).toContain('scopeBusy || !scopePreview');
    expect(scopeUi).toContain('scopeApplyButton.disabled');
    expect(scopeUi).not.toContain('window.confirm');
    expect(readFileSync("src/console/pages/policypacks.html", "utf8"))
      .toContain('app.js?v=20260711b');
  });

  test("projects one scope template per action control and keeps source provenance unique", () => {
    const root = workspace();
    initActionPolicy(root);
    initApprovalPolicy(root);
    writeRuntimeFirewallPolicy({ workspace: root, mode: "warn" });
    const projection = buildControlProjection(root);
    for (const family of projection.families) {
      for (const control of family.controls) {
        expect(new Set(control.sourceRefs).size).toBe(control.sourceRefs.length);
        if (family.familyId === "runtime-traffic") expect(control.scopeTemplateIds).toEqual([]);
        else expect(control.scopeTemplateIds).toHaveLength(1);
      }
    }
  });

  test("publishes the adoption guide, source boundary, changeset, and competitive closure", () => {
    expect(readFileSync("README.md", "utf8")).toContain("amc policy scope compile");

    const guide = readFileSync("docs/SCOPE_TEMPLATES.md", "utf8");
    expect(guide).toContain("amc policy scope apply");
    expect(guide).toContain("Workspace policies remain fleet-wide");
    expect(guide).toContain("amc policy action init");
    expect(guide).toContain("amc policy approval init");

    const review = readFileSync("docs/source-reviews/AMC-1474-reusable-scope-templates.md", "utf8");
    expect(review).toContain("83188b62c63e2b4ff9ada87048fd99605184ee5a");
    expect(review).toContain("fails closed");
    expect(review).toContain("No-bloat boundary");
    expect(review).toContain("compatibility layer");

    expect(readFileSync(".changeset/amc-reusable-scope-templates.md", "utf8"))
      .toContain("reusable action-class scope templates");
    expect(readFileSync("docs/internal/agent-control-agentapprove-competitive-response.md", "utf8"))
      .toContain("Shipped in AMC-1474");
    expect(readFileSync("website/docs/docs.js", "utf8")).toContain("'SCOPE_TEMPLATES'");
    const website = readFileSync("website/script.js", "utf8");
    expect(website).toContain("amc policy scope compile release-external");
    expect(website).toContain("transparency + ledger receipt");
    expect(website).not.toContain("amc enforce --policy strict --require-approval");
  });
});
