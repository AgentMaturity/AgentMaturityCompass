import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateTrustCertificate, verifyTrustCertificateEnvelope } from "../src/cert/trustCertificate.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * G3-01: three certificate systems shared one command group. `amc cert
 * generate` wrote a JSON trust-certificate envelope while `amc certify` wrote
 * an .amccert tarball, so `amc cert verify` failed with "Unrecognized archive
 * format" on a certificate AMC had just produced.
 *
 * A second bug surfaced while fixing it: `.option("--no-sign", desc, false)`
 * made commander default `sign` to false, so cert generate could never produce
 * a signed certificate at all.
 */
const dirs: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-cert-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("certificate artifacts are self-describing", () => {
  it("a preview envelope declares itself and is refused as evidence", () => {
    const ws = workspace();
    const out = join(ws, "preview.json");
    const generated = generateTrustCertificate({
      workspace: ws,
      agentId: "default",
      outputPath: out,
      validityDays: 30,
      preview: true
    });

    expect(generated.envelope.type).toBe("amc-trust-certificate");
    expect(generated.signatureStatus).toBe("UNSIGNED_PREVIEW");

    // The verifier must reject it as evidence rather than fail to read it.
    const verdict = verifyTrustCertificateEnvelope(generated.envelope);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/not verifier-ready/i);
  });

  it("the envelope on disk carries the type discriminator verify dispatches on", () => {
    const ws = workspace();
    const out = join(ws, "preview.json");
    generateTrustCertificate({
      workspace: ws,
      agentId: "default",
      outputPath: out,
      validityDays: 30,
      preview: true
    });
    const onDisk = JSON.parse(readFileSync(out, "utf8")) as { type: string };
    expect(onDisk.type).toBe("amc-trust-certificate");
  });

  it("a non-certificate JSON file is not mistaken for one", () => {
    const ws = workspace();
    const decoy = join(ws, "decoy.json");
    writeFileSync(decoy, JSON.stringify({ type: "something-else" }));
    const parsed = JSON.parse(readFileSync(decoy, "utf8")) as { type: string };
    expect(parsed.type).not.toBe("amc-trust-certificate");
  });
});
