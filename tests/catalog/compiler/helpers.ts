/** Synthetic compiler fixtures only. No real legal review, deployment or enforcement claim. */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import type { DeploymentProfile } from "../../../src/catalog/compiler/types.js";
import { loadCatalog, type LoadedCatalog } from "../../../src/catalog/loader.js";
import { validateCatalog } from "../../../src/catalog/validate.js";

export const AS_OF = "2026-10-16T00:00:00.000Z";
export const CONTROL_IDS = {
  layer0: "L0-FIX-01",
  wealth: "L1-FIX-WLT-01",
  technology: "L1-FIX-TEC-01",
  jurisdiction: "L2-FIX-US-01",
  crosswalkTarget: "L3-FIX-XB-01"
} as const;
const catalogSource = fileURLToPath(new URL("../../fixtures/catalog/compiler/catalog/", import.meta.url));
const profileSource = fileURLToPath(new URL("../../fixtures/catalog/compiler/finance-ops-us.profile.json", import.meta.url));

/** Top-level overrides replace whole facts; callers must preserve explicit null and provenance. */
export function makeProfile(overrides: Partial<DeploymentProfile> = {}): DeploymentProfile {
  const raw: unknown = JSON.parse(readFileSync(profileSource, "utf8"));
  return parseDeploymentProfile({ ...(raw as Record<string, unknown>), ...structuredClone(overrides) });
}

/** Each caller owns its copied catalog. The real loader and validator read its actual file bytes. */
export function createCompilerFixture(): {
  root: string; catalog: LoadedCatalog; profile: DeploymentProfile; cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "amc-p110-compiler-"));
  const cleanup = (): void => rmSync(root, { recursive: true, force: true });
  try {
    cpSync(catalogSource, root, { recursive: true });
    const catalog = loadCatalog({ root });
    const validation = validateCatalog(catalog, { asOf: new Date(AS_OF) });
    if (!validation.ok) throw new Error(`Synthetic compiler catalog is invalid: ${JSON.stringify(validation.errors)}`);
    return { root, catalog, profile: makeProfile(), cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
