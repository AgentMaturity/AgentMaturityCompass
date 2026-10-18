/**
 * P1-38: contract tests record what they PROVED, per route and feature, into test-results/capabilities/<source>.json.
 * scripts/gen-capability-matrix.mjs renders docs/providers/CAPABILITY_MATRIX.{json,md} from those files only.
 *
 * A result is recorded by `prove()` as the LAST statement of a passing test, so a test that fails or never runs leaves
 * its cells unknown. Declared support is copied from the adapter so the matrix can show where a declaration has no test.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { join } from "node:path";
import type { LlmAdapter } from "../../src/llm/adapter/adapterTypes.js";

const CAPABILITY_RESULTS_DIR = join("test-results", "capabilities");

export interface CapabilityRoute {
  readonly route: string;
  readonly protocol: string;
  readonly adapter: string;
  readonly encoder: string;
  readonly declared: Readonly<Record<string, string>>;
  /** Third-party library and exact version that built the request bytes, when not AMC. */
  readonly library?: string;
}

export interface CapabilityResult {
  readonly route: string;
  readonly feature: string;
  readonly support: "supported" | "unsupported";
  /** `<test file> > <test name>`; check:capability-matrix requires the name to exist in that file. */
  readonly test: string;
}

export function capabilityRoute(route: string, adapter: LlmAdapter, library?: string): CapabilityRoute {
  const capabilities = adapter.capabilities;
  if (capabilities === undefined) throw new Error(`route ${route} declares no capabilities`);
  return { route, protocol: capabilities.protocol, adapter: `${adapter.id}@${adapter.version}`,
    encoder: `${adapter.encoderId}@${adapter.encoderVersion}`, declared: { ...capabilities.features },
    ...(library === undefined ? {} : { library }) };
}

export class CapabilityRecorder {
  private readonly routes = new Map<string, CapabilityRoute>();
  private readonly results: CapabilityResult[] = [];

  constructor(private readonly source: string, private readonly testFile: string) {}

  route(record: CapabilityRoute): void {
    this.routes.set(record.route, record);
  }

  prove(route: string, features: readonly string[], support: CapabilityResult["support"], testName: string): void {
    if (!this.routes.has(route)) throw new Error(`register route ${route} before proving its features`);
    for (const feature of features) this.results.push({ route, feature, support, test: `${this.testFile} > ${testName}` });
  }

  write(extra: Record<string, unknown> = {}): void {
    mkdirSync(CAPABILITY_RESULTS_DIR, { recursive: true });
    const body = { schemaVersion: 1, source: this.source,
      environment: { node: process.versions.node, platform: `${platform()}-${arch()}`, ci: process.env.CI === "true", ...extra },
      routes: [...this.routes.values()], results: this.results };
    writeFileSync(join(CAPABILITY_RESULTS_DIR, `${this.source}.json`), `${JSON.stringify(body, null, 2)}\n`);
  }
}
