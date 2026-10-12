import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  checkPlatformDeployConfig,
  checkRepoPlatformDeployConfig,
  classifyBinary,
  RAILWAY_DOCUMENTED_BUILDERS
} from "../src/deployVerify/platformDeployConfig.js";

const root = process.cwd();
const sha = (file: string): string => createHash("sha256").update(readFileSync(join(root, file))).digest("hex");
const kinds = (findings: Array<{ kind: string }>): string[] => findings.map((f) => f.kind).sort();

describe("platform deploy config check", () => {
  test("tsx is devDependency-only: the committed api:start binary is reported", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>; devDependencies: Record<string, string>; dependencies: Record<string, string>;
    };
    expect(pkg.scripts["api:start"]?.split(/\s+/)[0]).toBe("tsx");
    expect(pkg.devDependencies.tsx).toBeDefined();
    expect(pkg.dependencies.tsx).toBeUndefined();
    expect(classifyBinary("tsx", pkg)).toBe("devDependency-only");
    const finding = checkRepoPlatformDeployConfig(root).find((f) => f.kind === "devDependency-only-start-binary");
    expect(finding?.target).toBe("railway");
    expect(finding?.detail).toContain("'tsx'");
  });

  test("reports the committed railway.json builder when it is outside Railway's documented set", () => {
    const railway = JSON.parse(readFileSync(join(root, "railway.json"), "utf8")) as { build?: { builder?: string }; deploy?: { healthcheckPath?: string } };
    const undocumented = railway.build?.builder !== undefined && !["RAILPACK", "DOCKERFILE"].includes(railway.build.builder);
    const findings = checkRepoPlatformDeployConfig(root);
    expect(findings.some((f) => f.kind === "undocumented-builder")).toBe(undocumented);
    expect(railway.build?.builder).toBe("NIXPACKS"); // committed at this branch; Railway documents only RAILPACK and DOCKERFILE (retrieved 2026-10-03)
    expect(findings.some((f) => f.kind === "missing-healthcheckPath")).toBe(false);
    expect(railway.deploy?.healthcheckPath).toBe("/api/health");
  });

  test("the committed configs yield exactly the devDependency and builder findings, and package.json is read-only", () => {
    const before = sha("package.json");
    expect(kinds(checkRepoPlatformDeployConfig(root))).toEqual(["devDependency-only-start-binary", "undocumented-builder"]);
    expect(sha("package.json")).toBe(before);
  });

  test("flags each defect on synthetic configs and stays quiet on a clean one", () => {
    const readSource = (path: string): string | null => (path === "api/ok.ts" ? "export default handler;\n" : path === "api/bare.ts" ? "export const x = 1;\n" : null);
    const clean = checkPlatformDeployConfig({
      packageJson: { scripts: { start: "tsx api/ok.ts" }, dependencies: { tsx: "^4" } },
      railway: { build: { builder: "RAILPACK" }, deploy: { startCommand: "npm run start", healthcheckPath: "/api/health" } },
      vercel: { builds: [{ src: "api/ok.ts" }] },
      readSource
    });
    expect(clean).toEqual([]);
    expect(RAILWAY_DOCUMENTED_BUILDERS).toEqual(["RAILPACK", "DOCKERFILE"]);
    const broken = checkPlatformDeployConfig({
      packageJson: { scripts: { start: "tsx api/ok.ts" }, devDependencies: { tsx: "^4" } },
      railway: { build: { builder: "NIXPACKS" }, deploy: { startCommand: "npm run start" } },
      vercel: { builds: [{ src: "api/missing.ts" }, { src: "api/bare.ts" }] },
      readSource
    });
    expect(kinds(broken)).toEqual(["devDependency-only-start-binary", "missing-healthcheckPath", "undocumented-builder",
      "vercel-build-src-missing", "vercel-build-src-no-default-export"]);
    const unresolved = checkPlatformDeployConfig({
      packageJson: { scripts: {} }, railway: { deploy: { startCommand: "npm run nope", healthcheckPath: "/h" } }, vercel: {}, readSource
    });
    expect(kinds(unresolved)).toEqual(["unresolved-start-script"]);
    const undeclared = checkPlatformDeployConfig({
      packageJson: { scripts: { start: "ts-node a.ts" } }, railway: { deploy: { startCommand: "pnpm start", healthcheckPath: "/h" } }, vercel: {}, readSource
    });
    expect(kinds(undeclared)).toEqual(["undeclared-start-binary"]);
  });
});
