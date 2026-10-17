import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { VerifyOptions } from "../../packages/verifier/src/index.js";

/** The normative corpus (P1-06) and helpers that turn one case into verifyArtifact's input. */
export const FIXTURES = resolve("spec/fixtures/v1");
export const DIMENSIONS = ["integrity", "issuerAdmission", "scope", "freshness", "completeness", "satisfaction"] as const;

export interface Expected {
  case: string;
  normative: boolean;
  dimensions: Record<(typeof DIMENSIONS)[number], "pass" | "fail" | "not-evaluated">;
  reasonCodes: Partial<Record<(typeof DIMENSIONS)[number], string[]>>;
  exitCode: number;
}

interface Params {
  asOf?: string;
  trustRoots?: string[];
  rootThreshold?: number;
  expect?: VerifyOptions["expectScope"];
  knownSequences?: Record<string, number>;
}

/** Further trust lists a case supplies, in name order, after trust-list.json. */
export function moreTrustLists(root: string): string[] {
  const dir = join(root, "more-trust-lists");
  return existsSync(dir) ? readdirSync(dir).sort().map(name => join(dir, name)) : [];
}

export function caseNames(dir = FIXTURES): string[] {
  return readdirSync(dir).filter(name => existsSync(join(dir, name, "expected.json"))).sort();
}

const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

export function loadCase(name: string, dir = FIXTURES): { bytes: Buffer; options: VerifyOptions; expected: Expected; params: Params } {
  const root = join(dir, name);
  const params = json<Params>(join(root, "params.json"));
  const evidenceDir = join(root, "evidence");
  const evidence = new Map(existsSync(evidenceDir) ? readdirSync(evidenceDir).map(file => {
    const bytes = readFileSync(join(evidenceDir, file));
    return [createHash("sha256").update(bytes).digest("hex"), bytes] as const;
  }) : []);
  return {
    bytes: readFileSync(join(root, "artifact.json")),
    expected: json<Expected>(join(root, "expected.json")),
    params,
    options: {
      trustLists: [json<unknown>(join(root, "trust-list.json")), ...moreTrustLists(root).map(path => json<unknown>(path))], trustRoots: params.trustRoots ?? [], rootThreshold: params.rootThreshold,
      asOf: params.asOf ? new Date(params.asOf) : undefined, expectScope: params.expect, knownSequences: params.knownSequences, evidence,
      path: `${name}/artifact.json`
    }
  };
}
