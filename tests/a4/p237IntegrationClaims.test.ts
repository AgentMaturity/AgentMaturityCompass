/**
 * P2-37: A4's IntegrationClaim is a projection of P2-17's adapter claim manifests. A hook path reads "enforced at
 * <boundary>" only when its tool-call hook enforces and blocks on failure and the manifest's qualification record is
 * hashed by its receipt; anything less is preview (or unsupported without a manifest) with the key. Fixtures copy the
 * committed Claude Code and Pi manifests and records into a temporary root and break one thing at a time.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { loadAdapterManifests } from "../../src/adapters/conformance/adapterManifest.js";
import { claimLabel, INTEGRATION_CLAIMS, integrationClaimsFrom, releaseBoundaryOf } from "../../src/a4/assemblePaths.js";
import { a4IntegrationClaimV1Schema } from "../../src/contracts/v1/a4IntegrationClaim.js";

const repo = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), "amc-p237-claims-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const CC = "docs/adapters/manifests/claude-code.json";
const PI = "docs/adapters/manifests/pi.json";
let roots = 0;
/** A root holding the committed manifests for `files` with their records and receipts. */
function fixtureRoot(files: readonly string[] = [CC, PI]): string {
  const root = join(scratch, `root-${roots++}`);
  for (const file of files) {
    const receipt = (JSON.parse(readFileSync(join(repo, file), "utf8")) as { receipt: string }).receipt;
    for (const path of [file, receipt, `${dirname(receipt)}/receipt.json`]) {
      mkdirSync(join(root, dirname(path)), { recursive: true });
      cpSync(join(repo, path), join(root, path));
    }
  }
  mkdirSync(join(root, "docs/adapters/manifests"), { recursive: true });
  return root;
}
const editJson = (path: string, edit: (value: Record<string, unknown>) => void): void => {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  edit(value);
  writeFileSync(path, JSON.stringify(value));
};
const claimsAt = (root: string) => integrationClaimsFrom(loadAdapterManifests(root));
const receiptOf = (root: string, file: string) => (JSON.parse(readFileSync(join(root, file), "utf8")) as { receipt: string }).receipt;

describe("IntegrationClaim from adapter claim manifests (P2-37)", () => {
  test("a Claude Code PreToolUse hook that enforces, blocks on failure and has a receipt reads enforced at hook:PreToolUse", () => {
    const claims = claimsAt(fixtureRoot());
    const claude = claims["claude-code"];
    expect(claimLabel(claude)).toBe("enforced at hook:PreToolUse");
    expect(claude).toMatchObject({ supported: "supported", evidenceTier: "observed", reason: null, source: `${CC} (amc.adapter-claim-manifest/v1)` });
    expect(claude.conformanceReceipt).toMatchObject({ pinnedVersion: "2.1.296" });
    expect(claude.conformanceReceipt!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(claimLabel(claims.pi)).toBe("enforced at pi:tool_call");
    expect(claims.pi.conformanceReceipt?.pinnedVersion).toBe("1.0.2, 1.0.4");
    for (const claim of Object.values(claims)) expect(a4IntegrationClaimV1Schema.safeParse(claim).success).toBe(true);
  });

  test("without the receipt the path reads preview with the key, never enforced", () => {
    const root = fixtureRoot();
    rmSync(join(root, receiptOf(root, CC)));
    const claude = claimsAt(root)["claude-code"];
    expect(claimLabel(claude)).toBe("preview");
    expect(claude.conformanceReceipt).toBeNull();
    expect(claude.reason).toMatch(/^P1-23 \(manifest not backed: receipt .* does not exist\)/);
    expect(claude.evidenceTier).toBe("self_reported");
  });

  test("a record the receipt.json does not hash, a hook that proceeds on failure, an observe role or a wrong adapter is preview", () => {
    const tampered = fixtureRoot();
    writeFileSync(join(tampered, receiptOf(tampered, CC)), `${readFileSync(join(tampered, receiptOf(tampered, CC)), "utf8")}\n`);
    expect(claimsAt(tampered)["claude-code"].supported).toBe("preview");

    // The record hashes fine but no longer holds what a case expects: the manifest has a problem, so nothing is enforced.
    const contradicted = fixtureRoot();
    editJson(join(contradicted, CC), (value) => {
      ((value.hooks as Array<{ cases: Array<Record<string, unknown>> }>)[0]!.cases[1]!).expect = false;
    });
    const checked = loadAdapterManifests(contradicted).find((entry) => entry.file === CC)!;
    expect(checked.receiptSha256).not.toBeNull();
    expect(checked.problems.length).toBeGreaterThan(0);
    expect(claimsAt(contradicted)["claude-code"]).toMatchObject({ supported: "preview", conformanceReceipt: null });

    const proceeds = fixtureRoot();
    editJson(join(proceeds, CC), (value) => { (value.hooks as Array<Record<string, unknown>>)[0]!.onFailure = "proceeds"; });
    expect(claimsAt(proceeds)["claude-code"]).toMatchObject({ supported: "preview", conformanceReceipt: null });

    // A manifest whose checks pass but whose PreToolUse only observes still enforces nothing at that boundary.
    const observe = fixtureRoot();
    editJson(join(observe, CC), (value) => {
      const hook = (value.hooks as Array<Record<string, unknown>>)[0]!;
      hook.role = "observe"; // onFailure stays "blocks": the role alone decides
    });
    expect(loadAdapterManifests(observe).find((entry) => entry.file === CC)!.problems).toEqual([]);
    const observed = claimsAt(observe)["claude-code"];
    expect(observed).toMatchObject({ supported: "preview", conformanceReceipt: null });
    expect(observed.reason).toContain("PreToolUse is not an enforce hook");

    const swapped = fixtureRoot([CC]);
    cpSync(join(swapped, CC), join(swapped, PI)); // pi.json carrying Claude Code's manifest
    expect(claimsAt(swapped).pi).toMatchObject({ supported: "preview", reason: expect.stringContaining("names adapter claude-code") });
  });

  test("no manifest is unsupported with the key; a manifest that is not JSON still blocks its path", () => {
    const none = fixtureRoot([CC]);
    expect(claimsAt(none).pi).toMatchObject({ supported: "unsupported", reason: "P1-22 (no adapter claim manifest)", conformanceReceipt: null });
    const broken = fixtureRoot();
    writeFileSync(join(broken, PI), "{");
    expect(claimsAt(broken).pi).toMatchObject({ supported: "preview", conformanceReceipt: null });
  });

  test("the paths without a manifest keep their hand rows, in the table's order", () => {
    const claims = claimsAt(fixtureRoot());
    expect(Object.keys(claims)).toEqual(["native", "claude-code", "pi", "langgraph", "langchain", "crewai", "openai-agents", "vercel-ai", "generic-http", "other"]);
    expect(claimLabel(claims.native)).toBe("enforced at tool_pipeline");
    expect(claimLabel(claims["generic-http"])).toBe("preview");
    expect(claims.other.enforcementBoundary).toBe("none");
  });

  test("the shipped table matches the committed manifests, and the build's copy loads to the same claims", () => {
    expect(INTEGRATION_CLAIMS).toEqual(claimsAt(repo));
    const copy = join(repo, "dist", "adapter-claims");
    if (existsSync(copy)) expect(claimsAt(copy)).toEqual(claimsAt(repo));
  });

  test("enforcementBoundary accepts the reserved acs:<hook> form and nothing else new; no table row uses it", () => {
    const base = { ...INTEGRATION_CLAIMS.other };
    expect(a4IntegrationClaimV1Schema.safeParse({ ...base, enforcementBoundary: "acs:PreToolUse" }).success).toBe(true);
    for (const bad of ["acs:", "acs:a b", "acs:1x", "hook:Stop", "pi:tool_result"]) {
      expect(a4IntegrationClaimV1Schema.safeParse({ ...base, enforcementBoundary: bad }).success, bad).toBe(false);
    }
    expect(Object.values(INTEGRATION_CLAIMS).some((claim) => claim.enforcementBoundary.startsWith("acs:"))).toBe(false);
  });

  test("the release record's boundary row reads enforced only where the claim is enforced, else what the claim's evidence is", () => {
    const enforced = claimsAt(fixtureRoot());
    const noReceipt = fixtureRoot();
    rmSync(join(noReceipt, receiptOf(noReceipt, CC)));
    const preview = claimsAt(noReceipt);
    expect(releaseBoundaryOf(enforced["claude-code"])).toMatchObject({ boundary: "hook:PreToolUse", status: "enforced" });
    expect(releaseBoundaryOf(enforced.pi)).toMatchObject({ boundary: "pi:tool_call", status: "enforced" });
    expect(releaseBoundaryOf(preview["claude-code"])).toMatchObject({ boundary: "hook:PreToolUse", status: "none" });
    expect(releaseBoundaryOf(enforced.native).status).toBe("enforced");
    expect(releaseBoundaryOf(enforced.langchain).status).toBe("observed");
    expect(releaseBoundaryOf(enforced["generic-http"]).status).toBe("none");
    expect(releaseBoundaryOf(enforced.other).status).toBe("none");
    expect(releaseBoundaryOf(preview["claude-code"]).note).toContain("enforced only with a conformance receipt");
  });
});
