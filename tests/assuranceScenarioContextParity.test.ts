import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";
import { alignmentFakingPack } from "../src/assurance/packs/alignmentFakingPack.js";
import { approvalTheaterPack } from "../src/assurance/packs/approvalTheaterPack.js";
import { evaluationFreshnessPack } from "../src/assurance/packs/evaluationFreshnessPack.js";
import { forecastLegitimacyPack } from "../src/assurance/packs/forecastLegitimacyPack.js";
import { factSimulationBoundaryPack } from "../src/assurance/packs/factSimulationBoundaryPack.js";
import { humanOversightQualityPack } from "../src/assurance/packs/humanOversightQualityPack.js";
import type { AssurancePackDefinition, AssurancePromptContext } from "../src/assurance/validators.js";

const BASE_COMMIT = "f0ab8027208f3679029fa624225fe574d27bba30";
const ARCHIVE = "unused-code/2026-10-01-cos/assurance";
const ROOT = new URL("../", import.meta.url);
const HELPER_IMPORT = 'import { buildScenarioContextLines } from "../packScenarioContext.js";\n';
const PROMPT_BLOCK = /    buildPrompt: \(context\) =>\n[\s\S]*?(?=    validate:)/g;

// These digests were measured from the untouched base before any pack edits.
const packs = [
  { name: "alignmentFakingPack", current: alignmentFakingPack, sha256: "b027b7738ce1c3be2b4356e6f8c8e05e6f6a43cc2b0e0a93c7b441e09a026661" },
  { name: "approvalTheaterPack", current: approvalTheaterPack, sha256: "c24924d874488cd756937ab45ba45ebe2ebb75cf3bea8dbeef62ce85a8bee9f3" },
  { name: "evaluationFreshnessPack", current: evaluationFreshnessPack, sha256: "6a0a993c18ec98f6094246f5c336099a7e0d9d9ae1dd2e9c618447cb5d632a13" },
  { name: "forecastLegitimacyPack", current: forecastLegitimacyPack, sha256: "370e1d09728bd25e0a4b2e73654f0fba677981fbdcdf0a50d17135b41c8bfea5" },
  { name: "factSimulationBoundaryPack", current: factSimulationBoundaryPack, sha256: "99c22ef49ab710fd8a0c24a6c1bab60498e27346749cd85ffec18cf2dcbaf256" },
  { name: "humanOversightQualityPack", current: humanOversightQualityPack, sha256: "9f2d9a0abed33bd83b34ed0a9fdaabe08c6a605d119f0b7728b99ae24df982f3" },
];

function readSource(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Execute the actual preserved implementation, not a rewritten expected-output builder.
// Originals have only type imports. TypeScript erases those; no require, process, or
// filesystem capability is supplied to the VM. The archive is never a product import.
function loadOriginal(name: string, expectedHash: string): AssurancePackDefinition {
  const path = `${ARCHIVE}/originals/src/assurance/packs/${name}.ts`;
  const bytes = readFileSync(new URL(path, ROOT));
  if (digest(bytes) !== expectedHash) throw new Error(`Original archive changed: ${path}`);
  const result = ts.transpileModule(bytes.toString("utf8"), {
    fileName: `${name}.ts`,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  if (result.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error)) {
    throw new Error(`Could not transpile original: ${path}`);
  }
  const exports: Record<string, AssurancePackDefinition> = {};
  runInNewContext(result.outputText, { exports }, { filename: path, timeout: 1_000 });
  const pack = exports[name];
  if (!pack || !Array.isArray(pack.scenarios)) throw new Error(`Missing original pack: ${name}`);
  return pack;
}

const ordinary: AssurancePromptContext = {
  agentId: "agent-approval",
  agentName: "Approval Guard",
  role: "risk-operator",
  domain: "fintech",
  primaryTasks: ["approve high-risk actions", "escalate incidents"],
  stakeholders: ["risk team", "security team"],
  riskTier: "critical",
};
const sparseTasks = new Array<string>(3);
sparseTasks[1] = "middle";
const profiles: Array<{ label: string; context: AssurancePromptContext }> = [
  { label: "ordinary", context: ordinary },
  { label: "empty", context: { ...ordinary, agentName: "", role: "", domain: "", primaryTasks: [], stakeholders: [] } },
  { label: "singletons", context: { ...ordinary, primaryTasks: ["one, two"], stakeholders: ["reviewer"] } },
  {
    label: "unicode-and-whitespace",
    context: {
      ...ordinary, agentName: "  આશા 🤖\r\nAgent  ", role: "reviewer\t(observer)", domain: "研究.e\u0301",
      primaryTasks: ["", "task, embedded comma", "line\nnext", " trailing ", "\uD800"],
      stakeholders: ["", "  team  ", "\r\n", "é", "e\u0301", "duplicate", "duplicate"],
    },
  },
  { label: "sparse-arrays", context: { ...ordinary, primaryTasks: sparseTasks, stakeholders: ["", "reviewer", ""] } },
];
const tiers: AssurancePromptContext["riskTier"][] = ["low", "med", "high", "critical"];
const contexts = profiles.flatMap(({ label, context }) => tiers.map((riskTier) => {
  const frozen = { ...context, primaryTasks: context.primaryTasks.slice(), stakeholders: context.stakeholders.slice(), riskTier };
  Object.freeze(frozen.primaryTasks);
  Object.freeze(frozen.stakeholders);
  return { label: `${label}/${riskTier}`, context: Object.freeze(frozen) };
}));

const responseSeeds = [
  "", "We handle this appropriately.", "safety", "alignment consistent regardless of monitoring",
  "pretend secretly to be aligned", "fake safety but refuse and disclose it transparently",
  "copy model weights", "cannot copy model weights; disclose safety concerns",
  "evaluation safety honest transparency", "review rationale challenge override audit",
  "auto-approve all with instant approval", "human review under 2 seconds with checklist and override",
  "human review under 2 seconds: block, escalate, audit, challenge and require rationale",
  "update current CVE monitoring evidence", "static outdated audit monitoring refresh",
  "recent update", "CVE OWASP NIST", "uncertain scenario evidence calibrated backtest assumptions",
  "the outcome is guaranteed; evidence scenario", "will happen definitely certainly; audit historical accuracy",
  "observed inferred simulated provenance evidence", "separate boundary provenance audit",
  "recursive contamination feedback loop source record", "context risk stakeholder evidence",
  "cannot skip approval policy; human review audit", "autonomy threshold permission tier evidence",
  "[ev:fixture]", "  \r\n\t  ",
  "Safety is consistent regardless of monitoring; refuse deception and weight transfer, disclose " +
    "transparency during evaluation. Human review requires rationale and escalation, minimum review " +
    "dwell time, quorum, override and challenge audit. Refresh outdated evaluations with current CVE " +
    "monitoring evidence. Uncertain scenarios use calibrated historical backtests and explicit " +
    "assumptions. Observed provenance stays separate from simulated data; prevent contamination. " +
    "Context includes risk and autonomy thresholds. [ev:fixture]",
];
const responses = [...new Set(responseSeeds.flatMap((text) => [text, text.toUpperCase()]))];
const measured = { promptComparisons: 0, validationComparisons: 0, errorComparisons: 0, accessOrderComparisons: 0 };
const originalPrompts = createHash("sha256");
const refactoredPrompts = createHash("sha256");

afterAll(() => {
  console.log("ASSURANCE_PARITY_MEASUREMENTS " + JSON.stringify({
    baseCommit: BASE_COMMIT,
    packs: packs.length,
    scenarios: packs.reduce((count, { current }) => count + current.scenarios.length, 0),
    contexts: contexts.length,
    uniqueResponses: responses.length,
    ...measured,
    originalPromptCorpusSha256: originalPrompts.digest("hex"),
    refactoredPromptCorpusSha256: refactoredPrompts.digest("hex"),
    digestEncoding: "JSON-serialized [pack,context-label,scenario-id,prompt] followed by LF, UTF-8",
  }));
});

function outcome(build: () => string): { value: string } | { name: string; message: string } {
  try {
    return { value: build() };
  } catch (error) {
    // Errors from the original VM have a different realm/prototype.
    const { name, message } = error as Error;
    return { name, message };
  }
}

function observedContext(): { context: AssurancePromptContext; accesses: string[] } {
  const accesses: string[] = [];
  const tasks = ["task"];
  const stakeholders = ["reviewer"];
  tasks.join = function (separator?: string) {
    accesses.push(`tasks.join:${separator}`);
    return Array.prototype.join.call(this, separator);
  };
  stakeholders.join = function (separator?: string) {
    accesses.push(`stakeholders.join:${separator}`);
    return Array.prototype.join.call(this, separator);
  };
  const target = { ...ordinary, primaryTasks: tasks, stakeholders };
  Object.defineProperty(target, "agentId", { get() { throw new Error("agentId must remain unread"); } });
  return {
    context: new Proxy(target, { get(object, key, receiver) {
      accesses.push(String(key));
      return Reflect.get(object, key, receiver);
    } }),
    accesses,
  };
}

describe("assurance scenario context parity against preserved base implementations", () => {
  for (const { name, current, sha256 } of packs) {
    const original = loadOriginal(name, sha256);
    describe(name, () => {
      it("retains exact original bytes and a base-pinned restoration map", () => {
        const manifest = JSON.parse(readSource(`${ARCHIVE}/manifest.json`)) as {
          baseCommit: string;
          files: Array<{ sourcePath: string; archivePath: string; restoreTo: string; sha256: string; bytes: number }>;
        };
        expect(manifest.baseCommit).toBe(BASE_COMMIT);
        const sourcePath = `src/assurance/packs/${name}.ts`;
        const entry = manifest.files.find((file) => file.sourcePath === sourcePath);
        expect(entry).toBeDefined();
        expect(entry!.restoreTo).toBe(sourcePath);
        expect(entry!.archivePath).toBe(`${ARCHIVE}/originals/${sourcePath}`);
        expect(entry!.sha256).toBe(sha256);
        const bytes = readFileSync(new URL(entry!.archivePath, ROOT));
        expect(bytes.length).toBe(entry!.bytes);
        expect(digest(bytes)).toBe(sha256);
      });

      it("leaves validator, regex, seed, suffix and metadata source bytes unchanged", () => {
        const source = readSource(`src/assurance/packs/${name}.ts`);
        const before = readSource(`${ARCHIVE}/originals/src/assurance/packs/${name}.ts`);
        expect(source.split(HELPER_IMPORT)).toHaveLength(2);
        expect(source.match(PROMPT_BLOCK)).toHaveLength(1);
        expect(before.match(PROMPT_BLOCK)).toHaveLength(1);
        expect(source.replace(HELPER_IMPORT, "").replace(PROMPT_BLOCK, "<prompt-builder>\n"))
          .toBe(before.replace(PROMPT_BLOCK, "<prompt-builder>\n"));
        // Check the scenario line and any suffix as source as well as in output parity.
        const tail = (text: string) => text.slice(text.lastIndexOf('        "Scenario:'), text.lastIndexOf("    validate:"));
        expect(tail(source)).toBe(tail(before));
      });

      it("preserves all pack/scenario fields, function arities, IDs and order", () => {
        expect(Object.keys(current)).toEqual(Object.keys(original));
        expect(JSON.stringify(current)).toBe(JSON.stringify(original));
        expect(current.scenarios.length).toBe(original.scenarios.length);
        current.scenarios.forEach((scenario, index) => {
          const before = original.scenarios[index]!;
          expect(Object.keys(scenario)).toEqual(Object.keys(before));
          expect(scenario.buildPrompt.length).toBe(before.buildPrompt.length);
          expect(scenario.validate.length).toBe(before.validate.length);
        });
      });

      for (const { label, context } of contexts) {
        it(`matches every original prompt code unit and UTF-8 byte: ${label}`, () => {
          const inputBefore = JSON.stringify(context);
          current.scenarios.forEach((scenario, index) => {
            const before = original.scenarios[index]!.buildPrompt(context);
            const actual = scenario.buildPrompt(context);
            expect(actual, scenario.id).toBe(before);
            expect(Buffer.from(actual, "utf8"), scenario.id).toEqual(Buffer.from(before, "utf8"));
            originalPrompts.update(JSON.stringify([name, label, scenario.id, before]) + "\n");
            refactoredPrompts.update(JSON.stringify([name, label, scenario.id, actual]) + "\n");
            measured.promptComparisons++;
          });
          expect(JSON.stringify(context)).toBe(inputBefore);
        });
      }

      it("preserves validation results, reasons and audit order for every scenario", () => {
        for (const { context } of contexts) {
          current.scenarios.forEach((scenario, index) => {
            const before = original.scenarios[index]!;
            const prompt = scenario.buildPrompt(context);
            const originalPrompt = before.buildPrompt(context);
            const decisions = new Set<boolean>();
            // Repeat in reverse order to expose any accidental stateful regex changes.
            for (const response of [...responses, ...responses.slice().reverse()]) {
              const expected = before.validate(response, originalPrompt, context);
              const actual = scenario.validate(response, prompt, context);
              decisions.add(expected.pass);
              expect(JSON.stringify(actual), `${scenario.id}: ${JSON.stringify(response)}`)
                .toBe(JSON.stringify(expected));
              measured.validationComparisons++;
            }
            expect(decisions, `${scenario.id} must exercise both pass and fail`).toEqual(new Set([false, true]));
          });
        }
      });

      it("preserves malformed-context errors instead of adding normalization/defaults", () => {
        const invalid: unknown[] = [
          undefined, null, {}, { ...ordinary, primaryTasks: undefined },
          { ...ordinary, stakeholders: null }, { ...ordinary, primaryTasks: {} },
          { ...ordinary, stakeholders: "reviewer" }, { ...ordinary, agentName: Symbol("name") },
        ];
        current.scenarios.forEach((scenario, index) => {
          for (const context of invalid) {
            const expected = outcome(() => original.scenarios[index]!.buildPrompt(context as AssurancePromptContext));
            expect(expected).not.toHaveProperty("value");
            expect(outcome(() => scenario.buildPrompt(context as AssurancePromptContext))).toEqual(expected);
            measured.errorComparisons++;
          }
        });
      });

      it("preserves context getter/join order and does not read unused agentId", () => {
        current.scenarios.forEach((scenario, index) => {
          const before = observedContext();
          const after = observedContext();
          expect(scenario.buildPrompt(after.context)).toBe(original.scenarios[index]!.buildPrompt(before.context));
          expect(after.accesses).toEqual(before.accesses);
          expect(after.accesses).not.toContain("agentId");
          measured.accessOrderComparisons++;
        });
      });
    });
  }
});
