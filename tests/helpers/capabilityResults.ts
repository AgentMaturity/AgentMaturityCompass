/**
 * P1-38: contract tests CLAIM, at collection time, which route features each test proves, into
 * test-results/capabilities/<source>.json. scripts/gen-capability-matrix.mjs joins those claims with the vitest JSON
 * report of the same run, so a claim counts only when its test passed; a test that fails or is filtered out never
 * becomes a supported cell. Declared support is copied from the adapter so the matrix can show where a declaration
 * has no passing test.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestFunction } from "vitest";
import type { LlmAdapter } from "../../src/llm/adapter/adapterTypes.js";

const CLAIMS_DIR = join("test-results", "capabilities");

export interface CapabilityRoute {
  readonly route: string;
  readonly protocol: string;
  readonly adapter: string;
  readonly encoder: string;
  readonly declared: Readonly<Record<string, string>>;
  /** Third-party library and exact version that built the request bytes, when not AMC. */
  readonly library?: string;
}

export function capabilityRoute(route: string, adapter: Pick<LlmAdapter, "id" | "version" | "capabilities" | "encoderId" | "encoderVersion">,
  library?: string): CapabilityRoute {
  const capabilities = adapter.capabilities;
  if (capabilities === undefined) throw new Error(`route ${route} declares no capabilities`);
  return { route, protocol: capabilities.protocol, adapter: `${adapter.id}@${adapter.version}`,
    encoder: `${adapter.encoderId}@${adapter.encoderVersion}`, declared: { ...capabilities.features },
    ...(library === undefined ? {} : { library }) };
}

interface Claim { readonly route: string; readonly features: readonly string[]; readonly support: "supported" | "unsupported"; readonly file: string; readonly title: string }

export class CapabilityRecorder {
  private readonly routes = new Map<string, CapabilityRoute>();
  private readonly claims: Claim[] = [];

  constructor(private readonly source: string, private readonly testFile: string) {}

  route(record: CapabilityRoute): void {
    this.routes.set(record.route, record);
    this.write();
  }

  /** Register a test and the features it proves for `route`. The claim counts only if this test passes. */
  test(route: string, features: readonly string[], support: Claim["support"], title: string, body: TestFunction): void {
    if (!this.routes.has(route)) throw new Error(`register route ${route} before claiming its features`);
    this.claims.push({ route, features, support, file: this.testFile, title });
    this.write();
    test(title, body);
  }

  private write(): void {
    mkdirSync(CLAIMS_DIR, { recursive: true });
    const body = { schemaVersion: 2, source: this.source, routes: [...this.routes.values()], claims: this.claims };
    writeFileSync(join(CLAIMS_DIR, `${this.source}.json`), `${JSON.stringify(body, null, 2)}\n`);
  }
}
