/**
 * The signed statement written beside an exported file (`<file>.sigstore.json`), checked in-process: it names the whole
 * file by digest, verifies under the workspace's artifact-seal key, and is refused (never written) for a file whose
 * digest is not the one the exporter computed or that cannot be read.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ensureSigningKeys } from "../src/crypto/keys.js";
import { INTOTO_PAYLOAD_TYPE, verifyDsse } from "../src/attest/dsse.js";
import { envelopeFromSigstoreBundle } from "../src/attest/sigstoreBundle.js";
import { INTOTO_STATEMENT_TYPE } from "../src/attest/statement.js";
import { exportAttestationLine, exportStatement, writeExportAttestation } from "../src/attest/exportAttestation.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-floor-export-attest-"));
  roots.push(root);
  ensureSigningKeys(root);
  return root;
}

describe("exportStatement", () => {
  test("is an in-toto statement naming the file by its sha256, self-issued, with a claimed time", () => {
    const bytes = Buffer.from("exported bytes");
    const statement = exportStatement({ name: "p.amcpass", bytes, kind: "amcpass", workspaceId: "ws-1", issuedAt: new Date("2026-11-17T00:00:00.000Z") });
    expect(statement._type).toBe(INTOTO_STATEMENT_TYPE);
    expect(statement.subject).toEqual([{ name: "p.amcpass", digest: { sha256: sha256Hex(bytes) } }]);
    expect(statement.predicate).toMatchObject({ kind: "amcpass", issuerRelationship: "self", workspace: "ws-1", issuedAt: "2026-11-17T00:00:00.000Z", timeBasis: "claimed" });
    expect(statement.predicate.notice).toMatch(/not that its content is true/);
  });
});

describe("writeExportAttestation", () => {
  test("signs the file's digest with the artifact-seal key and writes it beside the file", () => {
    const ws = workspace();
    const file = join(ws, "bundle.amcbundle");
    writeFileSync(file, "bundle contents");
    const result = writeExportAttestation(ws, file, "amcbundle", sha256Hex(Buffer.from("bundle contents")));
    expect(result).toEqual({ path: `${file}.sigstore.json` });
    const pem = readFileSync(join(ws, ".amc", "keys", "artifact-seal.pub"), "utf8");
    const envelope = envelopeFromSigstoreBundle(JSON.parse(readFileSync(`${file}.sigstore.json`, "utf8")));
    const checked = verifyDsse(envelope, INTOTO_PAYLOAD_TYPE, new Map([[sha256Hex(pem), pem]]));
    expect(checked.ok).toBe(true);
    const statement = JSON.parse((checked as { payload: Buffer }).payload.toString("utf8"));
    expect(statement.subject).toEqual([{ name: "bundle.amcbundle", digest: { sha256: sha256Hex(Buffer.from("bundle contents")) } }]);
    expect(statement.predicate.kind).toBe("amcbundle");
    expect(exportAttestationLine(result)).toBe(`Signed statement (DSSE, in-toto, Sigstore bundle) for the whole file: ${file}.sigstore.json`);
  });

  test("refuses a file whose digest is not the one the exporter computed, and writes nothing", () => {
    const ws = workspace();
    const file = join(ws, "cert.amccert");
    writeFileSync(file, "swapped in after the export");
    const result = writeExportAttestation(ws, file, "amccert", sha256Hex(Buffer.from("what the exporter wrote")));
    expect(result).toEqual({ error: "cert.amccert changed after it was written, so it was not signed" });
    expect(existsSync(`${file}.sigstore.json`)).toBe(false);
    expect(exportAttestationLine(result)).toBe("No signed statement was written beside the file: cert.amccert changed after it was written, so it was not signed");
  });

  test("returns the reason when the file cannot be read", () => {
    const ws = workspace();
    const result = writeExportAttestation(ws, join(ws, "missing.amcpass"), "amcpass", "0".repeat(64));
    expect(result).toEqual({ error: expect.stringMatching(/ENOENT/) });
  });
});
