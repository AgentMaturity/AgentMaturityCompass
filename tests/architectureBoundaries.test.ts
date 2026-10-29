import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  API_ROUTE_REGISTRY,
  isPublicApiRoute,
  matchApiRoute
} from "../src/api/index.js";

const root = process.cwd();

function readSource(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/** Runtime (non-type-only) relative imports of every file reachable from `starts`, with the first importer of each. */
function runtimeImportGraph(starts: string[]): Map<string, string | null> {
  const seen = new Map<string, string | null>();
  const queue: Array<[string, string | null]> = starts.map((file) => [file, null]);
  const specifiers = /(?:^|\n)\s*(import|export)(\s+type)?\b[^;]*?from\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g;
  while (queue.length > 0) {
    const [file, parent] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, parent);
    for (const match of readSource(file).matchAll(specifiers)) {
      if (match[2]) continue;
      const spec = match[3] ?? match[4] ?? match[5]!;
      if (!spec.startsWith(".")) continue;
      const target = join(dirname(file), spec).replace(/\.js$/, ".ts");
      const resolved = existsSync(join(root, target)) ? target : join(target.replace(/\.ts$/, ""), "index.ts");
      if (existsSync(join(root, resolved))) queue.push([resolved, file]);
    }
  }
  return seen;
}

const JUDGE_MODULE = /^src\/(?:eval\/[^/]*judge[^/]*|agents\/llmJudge)\.ts$/i;

describe("architecture boundary checks", () => {
  test("H2X-28: no optimizer or mechanic module reaches a judge through runtime imports", () => {
    const starts = ["src/experiments", "src/mechanic"].flatMap(function walk(dir: string): string[] {
      return readdirSync(join(root, dir), { withFileTypes: true })
        .flatMap((entry) => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : entry.name.endsWith(".ts") ? [`${dir}/${entry.name}`] : []);
    });
    expect(starts).toContain("src/experiments/governedOptimizer.ts");
    const graph = runtimeImportGraph(starts);
    // The walker must see real judge modules when they are imported; otherwise an empty result proves nothing.
    expect([...runtimeImportGraph(["src/agents/playground.ts"]).keys()].some((file) => JUDGE_MODULE.test(file))).toBe(true);
    const chains = [...graph.keys()].filter((file) => JUDGE_MODULE.test(file)).map((file) => {
      const chain: string[] = [];
      for (let at: string | null | undefined = file; at; at = graph.get(at)) chain.unshift(at);
      return chain.join(" -> ");
    });
    expect(chains).toEqual([]);
  });


  test("API v1 dispatch is backed by route metadata", () => {
    expect(API_ROUTE_REGISTRY.length).toBeGreaterThan(30);

    for (const route of API_ROUTE_REGISTRY) {
      expect(route.id).toMatch(/^[a-z0-9-]+$/);
      expect(route.prefixes.length).toBeGreaterThan(0);
      expect(route.auth).toMatch(/^(public|protected)$/);
      expect(route.validationPolicy).toMatch(/^(schema-validated|router-local|passthrough)$/);
    }

    const score = matchApiRoute("/api/v1/score/session");
    expect(score?.id).toBe("score");
    expect(score?.auth).toBe("protected");
    expect(score?.validationPolicy).toBe("schema-validated");

    expect(matchApiRoute("/api/v1/passports")?.id).toBe("passport");
    expect(matchApiRoute("/api/v1/workorders")?.id).toBe("workflow");
    expect(matchApiRoute("/api/v1/tickets/issue")?.id).toBe("workflow");

    expect(isPublicApiRoute("/api/v1/health")).toBe(true);
    expect(isPublicApiRoute("/api/v1/chat/completions")).toBe(true);
    expect(isPublicApiRoute("/api/v1/score/session")).toBe(false);
  });

  test("signing call sites take their key per purpose (P1-08)", () => {
    const script = readSource("scripts/architecture-boundaries-check.mjs");
    expect(script).toContain("ROLE_KEY_CALL");
    const roleCall = /\bget(?:Vault)?PrivateKeyPem\(/;
    const offenders = (function walk(dir: string): string[] {
      return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`)
        : entry.name.endsWith(".ts") && roleCall.test(readSource(`${dir}/${entry.name}`)) ? [`${dir}/${entry.name}`] : []);
    })("src").filter(file => !/^src\/(keys|vault)\//.test(file) && file !== "src/crypto/keys.ts");
    // The A4 lane's fail-early probes, each naming the purpose its later signer uses. P1-62's three (the lease effects,
    // a DENY and a rollback) read through getSigningKey since the P1-62 review (src/a4/a4Preflight.ts).
    expect(offenders.sort()).toEqual(["src/a4/a4Gates.ts", "src/a4/a4Store.ts", "src/a4/assembleBuild.ts", "src/a4/stages/aspire.ts"]);
  });

  test("api CLI family is registered through a command module", () => {
    const cli = readSource("src/cli.ts");
    const apiCli = readSource("src/api/apiCli.ts");

    expect(apiCli).toContain("export function registerApiCommands");
    expect(cli).toContain("registerApiCommands(program)");
    expect(cli).not.toContain('const apiCmd = program.command("api")');
  });

  test("Studio API delegation is extracted from the main server file", () => {
    const studioServer = readSource("src/studio/studioServer.ts");

    expect(existsSync(join(root, "src/studio/apiDelegation.ts"))).toBe(true);
    expect(studioServer).toContain("handleStudioApiDelegation");
    expect(studioServer).not.toContain('await import("../api/index.js")');
  });

  test("release gate tracks boundary drift and CLI/API compatibility", () => {
    const releaseGate = readSource("scripts/release-gate.mjs");
    const workflow = readSource(".github/workflows/ci.yml");

    expect(releaseGate).toContain("architecture-boundaries");
    expect(releaseGate).toContain("scripts/architecture-boundaries-check.mjs");
    expect(workflow).toContain("Architecture boundary compatibility");
    expect(workflow).toContain("npm run check:architecture-boundaries");
  });
});
