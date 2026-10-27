/**
 * P2-22 review packet. The plan is the shipped catalog's L0-IDN-01 fixture profile, signed in a temporary workspace; its
 * one control result is evaluated over no evidence (not_evaluated), as A4's Adapt Review records it today. The A4 project
 * around it is a fixture source: the packet builder's own reads of A4 are covered by the operator router and inbox tests.
 */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Ajv } from "ajv";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { pae } from "../../src/attest/dsse.js";
import { renderSummaryPdf } from "../../src/audit/binderArtifactMembers.js";
import { compilePlan, parseDeploymentProfile } from "../../src/catalog/compiler/compile.js";
import { signPlan } from "../../src/catalog/compiler/sign.js";
import { evaluateControl } from "../../src/catalog/evidence/evaluate.js";
import { writeSignedControlResults } from "../../src/catalog/evidence/signedResults.js";
import { getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { buildReviewPacket, PACKET_README, type PacketSource } from "../../src/operator/reviewPacket.js";
import { ed25519KeyId, signTrustList } from "../../src/trust/trustList.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { initWorkspace } from "../../src/workspace.js";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { catalog } from "../catalog/l0/harness.js";

vi.setConfig({ testTimeout: 120_000 });
const addFormats: import("ajv-formats").FormatsPlugin = createRequire(import.meta.url)("ajv-formats");
const LONG_REASON = `NO_EVIDENCE_LOADER ${"a reason long enough to need wrapping ".repeat(8)}END-OF-REASON`;
let workspace: string;
let out: string;
let files: Map<string, Buffer>;
let built: Awaited<ReturnType<typeof buildReviewPacket>>;
let sourceOf: () => PacketSource;
let planDigest: string;

function unzip(zip: string): Map<string, Buffer> {
  out = mkdtempSync(join(tmpdir(), "amc-p222-unzip-"));
  const result = spawnSync("unzip", ["-q", zip, "-d", out], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]);
  return new Map(walk(out).map((path) => [relative(out, path), readFileSync(path)]));
}

beforeAll(async () => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-packet-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const profile = (catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")!.envelope!.setup as { profile: never }).profile;
  const parsed = parseDeploymentProfile(profile);
  const plan = compilePlan({ profile: parsed, catalog, asOf: new Date().toISOString() });
  const { signed } = signPlan({ workspace, plan, previous: null });
  const decision = plan.requirements.find((row) => row.applicability === "applicable" && (catalog.controls.get(row.controlId)?.evidence.length ?? 0) > 0)!;
  const now = Date.now();
  const deployment = parsed.deployment!;
  const evaluated = evaluateControl(catalog.controls.get(decision.controlId)!, [], {
    subject: { tenantId: deployment.tenantId, workspaceId: deployment.workspaceId, deploymentId: deployment.deploymentId, agentId: "default", subjectId: null },
    window: { start: new Date(now - 60_000).toISOString(), end: new Date(now).toISOString() },
    plan: { digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, applicability: { state: "applicable" }, mode: "enforce" },
    invalidations: [], reviews: [], producers: catalog.producers
  });
  const results = writeSignedControlResults(workspace, "results.json", [evaluated]);
  const source = (): PacketSource => ({
    signed, agentId: "default", projectId: "a4p_00000000000000000000000000000001", refs: [], resultsFile: { path: "results.json", sha256: results.digestSha256 },
    statement: { planDigest: plan.digest.replace(/^sha256:/, ""), evaluatedAt: new Date(now).toISOString(), claimBoundary: "fixture boundary",
      counts: { pass: 0, fail: 0, not_evaluated: 1, not_applicable: 0, unresolved: 0 },
      controls: [{ controlId: evaluated.controlId, version: evaluated.controlVersion, support: "experimental", reviewStatus: "experimental",
        applicability: { state: "applicable" }, evidence: evaluated.dimensions.evidence, result: "not_evaluated", enforcement: evaluated.dimensions.enforcement,
        review: evaluated.dimensions.review, claimKind: "self_reported", evidenceRefs: [], notEvaluatedReason: LONG_REASON }] } as never
  });
  sourceOf = source;
  planDigest = plan.digest;
  built = await buildReviewPacket({ workspace, planDigest: plan.digest, window: { fromTs: now - 3_600_000, toTs: now }, formats: ["json", "oscal", "pdf"],
    nowTs: now, source });
  files = unzip(join(workspace, ".amc", "operator", "review-packets", `${built.packetId}.zip`));
  // Closing evidence: a sample packet from this fixture, when the receipts run asks for one.
  if (process.env.AMC_P222_SAMPLE_DIR) copyFileSync(join(workspace, ".amc", "operator", "review-packets", `${built.packetId}.zip`), join(process.env.AMC_P222_SAMPLE_DIR, "sample-review-packet.zip"));
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
  if (out) rmSync(out, { recursive: true, force: true });
});

/** A trust list, signed by a test root, that pins the workspace's artifact-seal key: what an auditor's trust list holds. */
function pinnedTrust() {
  const root = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const sealPem = getSigningPublicKeyPem(workspace, "artifact-seal");
  const signed = signTrustList({ type: "amc.trust-list", version: 1, listId: "p2-22-test", sequence: 1, issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z", distrust: [], entries: [{ keyId: ed25519KeyId(sealPem)!, algorithm: "ed25519", publicKeyPem: sealPem,
      purposes: ["artifact-seal"], subject: "TEST ONLY workspace artifact-seal key", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, source: "operator" }] }, root);
  return { trustLists: [signed], trustRoots: [signed.signatures[0]!.keyId] };
}

const ENVELOPE = "attestation/review-packet.dsse.json";
function verify(envelope: Buffer, evidence: Map<string, Buffer>) {
  return verifyArtifact(envelope, { ...pinnedTrust(), evidence: new Map([...evidence].filter(([path]) => path !== ENVELOPE && path !== "verifier/report.json")
    .map(([, bytes]) => [sha256Hex(bytes), new Uint8Array(bytes)])) });
}

describe("review packet", () => {
  test("holds the plan, results, receipts, exports and the verifier report", () => {
    for (const path of ["README.md", "manifest.json", "plan/plan.json", "plan/lockfile.json", "plan/diff.json", "results/control-results.json",
      "evidence/references.json", "receipts/action-receipts.json", "exports/oscal/profile.json", "exports/oscal/assessment-results.json",
      "exports/oscal/oscal-loss-report.json", "exports/summary.pdf", ENVELOPE, "verifier/report.json"]) {
      expect(files.has(path), path).toBe(true);
    }
    expect(JSON.parse(files.get("results/control-results.json")!.toString("utf8")).controls[0]).toMatchObject({ claimKind: "self_reported", result: "not_evaluated" });
    const report = JSON.parse(files.get("verifier/report.json")!.toString("utf8"));
    expect(report.type).toBe("amc.verifier-report");
    expect(built.verifier.available).toBe(true);
  });

  test("no file carries private key material, and the README names no bundled key to trust", () => {
    for (const [path, bytes] of files) expect(bytes.toString("latin1"), path).not.toMatch(/PRIVATE KEY/);
    const readme = files.get("README.md")!.toString("utf8");
    expect(readme).toBe(PACKET_README(built.packetId));
    expect(readme).toContain("issuer key pinned in your trust list");
    // No line tells an auditor to verify against a key the packet carries; the one line that names such keys forbids it.
    expect(readme.split("\n").filter((line) => /verify|check/i.test(line) && /bundled|ships|shipped|included|keys\//i.test(line) && !/never/i.test(line))).toEqual([]);
  });

  test("a packet whose content carries key material is refused and nothing is written", async () => {
    const leaky = (): PacketSource => ({ ...sourceOf(), statement: { ...sourceOf().statement, claimBoundary: "-----BEGIN PRIVATE KEY-----" } as never });
    const now = Date.now();
    await expect(buildReviewPacket({ workspace, planDigest, window: { fromTs: now - 1000, toTs: now }, formats: ["json"], nowTs: now, source: leaky }))
      .rejects.toMatchObject({ code: "PACKET_KEY_MATERIAL" });
    expect(readdirSync(join(workspace, ".amc", "operator", "review-packets"))).toEqual([`${built.packetId}.zip`]);
  });

  test("verifies against a pinned trust list; a flipped byte or an unpinned signer fails", () => {
    const envelope = files.get(ENVELOPE)!;
    const ok = verify(envelope, files);
    expect([ok.integrity.status, ok.issuerAdmission.status, ok.completeness.status]).toEqual(["pass", "pass", "pass"]);

    const flipped = new Map(files);
    const results = Buffer.from(files.get("results/control-results.json")!);
    results[10] = results[10]! ^ 1;
    flipped.set("results/control-results.json", results);
    expect(verify(envelope, flipped).completeness.status).toBe("fail");

    const parsed = JSON.parse(envelope.toString("utf8"));
    const badSig = Buffer.from(JSON.stringify({ ...parsed, signatures: [{ ...parsed.signatures[0], sig: Buffer.from(Buffer.from(parsed.signatures[0].sig, "base64").map((byte, index) => index === 0 ? byte ^ 1 : byte)).toString("base64") }] }));
    expect(verify(badSig, files).integrity.status).toBe("fail");

    const other = generateKeyPairSync("ed25519");
    const otherPem = other.publicKey.export({ format: "pem", type: "spki" }).toString();
    const payload = Buffer.from(parsed.payload, "base64");
    const resigned = Buffer.from(JSON.stringify({ ...parsed, signatures: [{ keyid: createHash("sha256").update(otherPem).digest("hex"),
      sig: sign(null, pae(parsed.payloadType, payload), other.privateKey).toString("base64") }] }));
    expect(verify(resigned, files).issuerAdmission.status).toBe("fail");
  });

  test("OSCAL output validates against P1-28's pinned schemas", () => {
    for (const [file, model, sha] of [["oscal_profile_schema.json", "exports/oscal/profile.json", "0e7b06623f8f4a0e64142fe7af4364a8d27c383e1db1281c7d538e3a7e454d6a"],
      ["oscal_assessment-results_schema.json", "exports/oscal/assessment-results.json", "671524c85034f53d107dcc5125a7d66b8d4529caaec051f788817c0551b93cc5"]] as const) {
      const bytes = readFileSync(new URL(`../../spec/vendor/oscal/1.2.3/${file}`, import.meta.url));
      expect(sha256Hex(bytes)).toBe(sha);
      const ajv = new Ajv({ allErrors: true, unicodeRegExp: true, validateFormats: true, validateSchema: true });
      addFormats(ajv, { mode: "full", keywords: true });
      const validate = ajv.compile(JSON.parse(bytes.toString("utf8")));
      expect(validate(JSON.parse(files.get(model)!.toString("utf8"))), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  test("a 300-character PDF line is wrapped, not cut", () => {
    expect(LONG_REASON.length).toBeGreaterThan(300);
    const text = files.get("exports/summary.pdf")!.toString("latin1");
    expect(text).toContain("END-OF-REASON");
    expect(text).not.toContain("...");
    const binder = renderSummaryPdf(`# Summary\n${"x".repeat(150)} ${"y".repeat(140)} END-OF-LINE`).toString("latin1");
    expect(binder).toContain("END-OF-LINE");
    // Every character survives, across wrapped lines no longer than the page takes.
    const shown = [...binder.matchAll(/^\((.*)\) Tj$/gm)].map((match) => match[1]!);
    expect(shown.join("").replaceAll(" ", "")).toBe(`#Summary${"x".repeat(150)}${"y".repeat(140)}END-OF-LINE`);
    expect(Math.max(...shown.map((line) => line.length))).toBeLessThanOrEqual(110);
  });
});
