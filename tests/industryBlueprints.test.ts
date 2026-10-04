import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { listDomainIds } from "../src/domains/domainRegistry.js";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { createIndustryPackLicenseKey } from "../src/domains/industryPackEntitlement.js";
import { listAssurancePacks } from "../src/assurance/packs/index.js";
import {
  BlueprintRefusedError,
  composeBlueprint,
  renderBlueprintFiles,
  toAgentPreset,
  validateBlueprint,
  type AgentBlueprint,
  type StationProfileSource
} from "../src/domains/blueprints/index.js";

const allQuestionIds = new Set(listIndustryPacks().flatMap((pack) => pack.questions.map((question) => question.id)));
const registeredAssurancePacks = new Set(listAssurancePacks().map((pack) => pack.id));
const rendered: AgentBlueprint[] = [];

afterAll(() => {
  // The monitor reads this line; it is a count of blueprints composed in this run.
  process.stdout.write(`stations=${listDomainIds().length} blueprints=${rendered.length}\n`);
});

function expectValidShape(blueprint: AgentBlueprint): void {
  expect(blueprint.schemaVersion).toBe(1);
  expect(blueprint.name.length).toBeGreaterThan(0);
  expect(blueprint.purpose.length).toBeGreaterThan(0);
  expect(blueprint.guardrails.length).toBeGreaterThan(0);
  expect(blueprint.toolScope.classes).toContain("READ_ONLY");
  expect(blueprint.requiredAssurancePacks.length).toBeGreaterThan(0);
  for (const packId of blueprint.requiredAssurancePacks) expect(registeredAssurancePacks.has(packId)).toBe(true);
  expect(blueprint.evidence.receipts.length).toBeGreaterThan(0);
  expect(blueprint.evidence.binderSections.length).toBeGreaterThan(0);
  expect(blueprint.sources.length).toBeGreaterThan(0);
  for (const source of blueprint.sources) expect(source.verified).toBe(false);
  expect(validateBlueprint(blueprint).ok).toBe(true);
}

describe("industry blueprints: composition", () => {
  test("every station renders a valid station-level blueprint", () => {
    const stations = listDomainIds();
    expect(stations.length).toBe(7);
    for (const station of stations) {
      const blueprint = composeBlueprint({ station });
      expectValidShape(blueprint);
      expect(blueprint.station).toBe(station);
      expect(blueprint.packId).toBeUndefined();
      rendered.push(blueprint);
    }
  });

  test("every pack renders a valid pack-level blueprint covering all of its questions", () => {
    for (const pack of listIndustryPacks()) {
      const blueprint = composeBlueprint({ station: pack.stationId, packId: pack.id });
      expectValidShape(blueprint);
      expect(blueprint.packId).toBe(pack.id);
      expect(blueprint.guardrails.length).toBe(pack.questions.length);
      expect(blueprint.guardrailSelection.omittedQuestionIds).toEqual([]);
      rendered.push(blueprint);
    }
  });

  test("health blueprint yields >= 8 guardrails, each citing an existing pack question id", () => {
    const blueprint = composeBlueprint({ station: "health" });
    expect(blueprint.guardrails.length).toBeGreaterThanOrEqual(8);
    for (const guardrail of blueprint.guardrails) {
      expect(allQuestionIds.has(guardrail.derivedFrom.questionId)).toBe(true);
      expect(guardrail.derivedFrom.regulatoryRef.length).toBeGreaterThan(0);
      expect(guardrail.text).toContain(guardrail.derivedFrom.questionId);
    }
  });

  test("a pack must belong to the station it is rendered under", () => {
    expect(() => composeBlueprint({ station: "health", packId: "digital-payments" })).toThrow(/belongs to station "wealth"/);
    expect(() => composeBlueprint({ station: "health", packId: "no-such-pack" })).toThrow(/Unknown pack/);
  });
});

describe("industry blueprints: station profile refusals (fail closed)", () => {
  test("WRITE_HIGH without approvals in a critical station is refused and names the rule", () => {
    let caught: unknown;
    try {
      composeBlueprint({
        station: "health",
        toolClasses: ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"],
        approvals: { requiredApprovals: 0 }
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BlueprintRefusedError);
    const refused = caught as BlueprintRefusedError;
    expect(refused.refusals.map((refusal) => refusal.rule)).toContain("station-profile/critical/write-high-requires-approval");
    expect(refused.message).toContain("station-profile/critical/write-high-requires-approval");
  });

  test("WRITE_HIGH with fewer distinct approvers than the workspace default is refused", () => {
    expect(() =>
      composeBlueprint({
        station: "health",
        toolClasses: ["READ_ONLY", "WRITE_HIGH"],
        approvals: { requiredApprovals: 2, requireDistinctUsers: false }
      })
    ).toThrow(/station-profile\/critical\/write-high-requires-approval/);
  });

  test("a class the station tier forbids is refused by name", () => {
    expect(() => composeBlueprint({ station: "health", toolClasses: ["READ_ONLY", "DEPLOY"] })).toThrow(
      /station-profile\/critical\/forbidden-class\/DEPLOY/
    );
  });

  test("a class the default budget zero-quotas is refused in every station", () => {
    for (const station of listDomainIds()) {
      expect(() => composeBlueprint({ station, toolClasses: ["READ_ONLY", "SECURITY"] })).toThrow(
        /budget-default\/zero-quota\/SECURITY/
      );
    }
  });

  test("validateBlueprint re-checks a composed blueprint that was edited afterwards", () => {
    const blueprint = composeBlueprint({ station: "wealth" });
    const edited: AgentBlueprint = { ...blueprint, toolScope: { ...blueprint.toolScope, classes: [...blueprint.toolScope.classes, "FINANCIAL"] } };
    const verdict = validateBlueprint(edited);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.refusals.map((refusal) => refusal.rule)).toContain("budget-default/zero-quota/FINANCIAL");
  });

  test("an injected station profile source (F1 seam) is honoured, and undefined falls back to the pack risk tier", () => {
    const stricter: StationProfileSource = (station) =>
      station === "technology" ? { station, tier: "critical", forbiddenClasses: ["WRITE_LOW"], ruleId: "station-profile/technology/f1-test" } : undefined;
    expect(() => composeBlueprint({ station: "technology", toolClasses: ["READ_ONLY", "WRITE_LOW"] }, { profileSource: stricter })).toThrow(
      /station-profile\/technology\/f1-test\/forbidden-class\/WRITE_LOW/
    );
    const fallback = composeBlueprint({ station: "health" }, { profileSource: stricter });
    expect(fallback.profile.source).toBe("pack-risk-tier");
    expect(fallback.profile.tier).toBe("critical");
  });
});

describe("industry blueprints: rendering and registration boundary", () => {
  const workspaces: string[] = [];

  beforeEach(() => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    process.env.AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
    process.env.AMC_INDUSTRY_PACKS_LICENSE_KEY = createIndustryPackLicenseKey({
      subscriptionId: "sub_blueprint_test",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
  });

  afterEach(() => {
    delete process.env.AMC_INDUSTRY_PACKS_LICENSE_KEY;
    delete process.env.AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY;
    delete process.env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY;
    while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
  });

  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), "amc-blueprint-"));
    workspaces.push(dir);
    return dir;
  }

  test("render writes yaml, json and a summary that agree with each other", () => {
    const ws = workspace();
    const out = join(ws, "blueprints");
    const result = renderBlueprintFiles({ station: "health", packId: "clinical-trials" }, { outDir: out, workspacePath: ws });
    expect(result.files.map((file) => file.split("/").pop())).toEqual([
      "health-clinical-trials.blueprint.yaml",
      "health-clinical-trials.blueprint.json",
      "health-clinical-trials.summary.md"
    ]);
    const fromYaml = YAML.parse(readFileSync(result.files[0]!, "utf8")) as AgentBlueprint;
    const fromJson = JSON.parse(readFileSync(result.files[1]!, "utf8")) as AgentBlueprint;
    expect(fromYaml).toEqual(fromJson);
    expect(fromJson.guardrails.length).toBe(16);
    const summary = readFileSync(result.files[2]!, "utf8");
    expect(summary).toContain("station-profile/critical");
    expect(summary).toContain(".amc/agents.yaml");
    expect(existsSync(join(ws, ".amc", "agents.yaml"))).toBe(false);
  });

  test("render never writes under .amc/", () => {
    const ws = workspace();
    expect(() => renderBlueprintFiles({ station: "health" }, { outDir: join(ws, ".amc", "blueprints"), workspacePath: ws })).toThrow(
      /refuses to write under \.amc/
    );
    expect(existsSync(join(ws, ".amc"))).toBe(false);
  });

  test("render refuses without an industry-pack entitlement", () => {
    delete process.env.AMC_INDUSTRY_PACKS_LICENSE_KEY;
    const ws = workspace();
    expect(() => renderBlueprintFiles({ station: "health" }, { outDir: join(ws, "out"), workspacePath: ws })).toThrow();
    expect(existsSync(join(ws, "out"))).toBe(false);
  });

  test("toAgentPreset maps the blueprint onto the signed preset schema fields", () => {
    const blueprint = composeBlueprint({ station: "wealth", toolClasses: ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"] });
    const preset = toAgentPreset(blueprint, { model: "stub-model", providerId: "stub" });
    expect(preset.id).toBe("blueprint-wealth");
    expect(preset.tools).toBe("workspace");
    expect(preset.approveTools).toBe("WRITE_HIGH");
    expect(preset.delegate).toBeUndefined();
    expect(preset.persona).toContain(blueprint.guardrails[0]!.derivedFrom.questionId);
    // READ_ONLY needs 0 approvals under the default policy, so nothing is gated.
    const readOnly = toAgentPreset(composeBlueprint({ station: "wealth", toolClasses: ["READ_ONLY"] }), { model: "stub-model", providerId: "stub" });
    expect(readOnly.approveTools).toBeUndefined();
  });
});
