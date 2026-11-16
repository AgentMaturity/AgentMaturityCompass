/**
 * Passport revocation an outsider can check (vault lane, 2026-11-16): `amc keys revoke --passport` and the console's
 * revoke publish a signed, sequenced revocation list; this workspace's own verify reads it and fails closed when it is
 * edited or rolled back. The passport says who issued it and which list would revoke it.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { createPassportArtifact } from "../src/passport/passportArtifact.js";
import { passportRevokeForApi } from "../src/passport/passportApi.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { savePassportPolicy } from "../src/passport/passportStore.js";
import { PASSPORT_REVOCATION_LIST_REL, passportRevocationListId, readPassportRevocationList } from "../src/passport/passportRevocationList.js";
import { verifyPassportArtifactFile } from "../src/passport/passportVerifier.js";
import { passportJsonSchema, passportIssuanceLines } from "../src/passport/passportSchema.js";
import { workspaceSelfTrust } from "../src/trust/index.js";
import { writeExportAttestation } from "../src/attest/exportAttestation.js";
import { INTOTO_PAYLOAD_TYPE, verifyDsse } from "../src/attest/dsse.js";
import { sha256Hex } from "../src/utils/hash.js";

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-passport-revocation-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  savePassportPolicy(dir, defaultPassportPolicy());
  return dir;
}
const create = (ws: string, name: string) => createPassportArtifact({ workspace: ws, scopeType: "WORKSPACE", outFile: name });
const verify = (ws: string, file: string) => verifyPassportArtifactFile({ file, workspace: ws, trust: workspaceSelfTrust(ws) });

describe("passport issuance", () => {
  test("a new passport says it is self-issued, on the issuer's clock, and names its revocation list", () => {
    const ws = workspace();
    const created = create(ws, "p.amcpass");
    expect(created.passport.issuance).toEqual({ issuerRelationship: "self", selfIssued: true, timeBasis: "claimed",
      statusBasis: "workspace-own-gates", revocationListId: passportRevocationListId(ws) });
    expect(passportIssuanceLines(created.passport).join("\n")).toMatch(/self-issued.*not that it is true/s);
    expect(passportIssuanceLines(created.passport)[0]).not.toMatch(/^status: VERIFIED$/);
  });

  test("an older passport's questionScores42 field still parses unchanged", () => {
    const ws = workspace();
    const old = { ...create(ws, "p.amcpass").passport } as Record<string, unknown>;
    delete old.issuance;
    const maturity = { ...(old.maturity as object), questionScores42: [{ qIdHash: "q_0123456789abcdef", score: 2 }] };
    expect(passportJsonSchema.parse({ ...old, maturity }).maturity.questionScores42).toEqual(maturity.questionScores42);
  });
});

describe("signed passport revocation list", () => {
  test("revoking publishes a signed, sequenced list and the passport no longer verifies", () => {
    const ws = workspace();
    const first = create(ws, "first.amcpass");
    const second = create(ws, "second.amcpass");
    expect(verify(ws, first.outFile).ok).toBe(true);
    const out = passportRevokeForApi({ workspace: ws, passportId: first.passport.passportId, reason: "retired", file: first.outFile });
    expect(out?.signedListError).toBeNull();
    expect(out?.signedList).toMatchObject({ listId: passportRevocationListId(ws), sequence: 1 });
    const list = readPassportRevocationList(ws)!;
    expect(list.list.revoked).toEqual([expect.objectContaining({ id: first.passport.passportId, kind: "passport", reason: "retired" })]);
    expect(list.list.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(verify(ws, first.outFile).errors.map(error => error.code)).toContain("PASSPORT_REVOKED");
    const again = passportRevokeForApi({ workspace: ws, passportId: second.passport.passportId, reason: "retired too", file: second.outFile });
    expect(again?.signedList?.sequence).toBe(2);
    expect(readPassportRevocationList(ws)!.list.previousSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an edited list or an older copy put back makes verify fail closed, never pass", () => {
    const ws = workspace();
    const keep = create(ws, "keep.amcpass");
    const gone = create(ws, "gone.amcpass");
    passportRevokeForApi({ workspace: ws, passportId: gone.passport.passportId, reason: "one", file: gone.outFile });
    const path = join(ws, PASSPORT_REVOCATION_LIST_REL);
    const sequenceOne = join(ws, "sequence-1.json");
    copyFileSync(path, sequenceOne);
    passportRevokeForApi({ workspace: ws, passportId: gone.passport.passportId, reason: "two", file: gone.outFile });

    copyFileSync(sequenceOne, path);
    expect(verify(ws, keep.outFile).errors.map(error => error.code)).toContain("PASSPORT_REVOCATION_LIST_INVALID");
    expect(verify(ws, keep.outFile).ok).toBe(false);

    const edited = readFileSync(sequenceOne, "utf8").replace('"reason":"one"', '"reason":"0ne"');
    writeFileSync(path, edited);
    expect(verify(ws, keep.outFile).errors.map(error => error.code)).toContain("PASSPORT_REVOCATION_LIST_INVALID");

    rmSync(path);
    expect(verify(ws, keep.outFile).errors.map(error => error.code)).toContain("PASSPORT_REVOCATION_LIST_INVALID");
  });
});

describe("export statement beside the file", () => {
  test("names the whole exported file by digest and verifies under the workspace's artifact-seal key", () => {
    const ws = workspace();
    const created = create(ws, "p.amcpass");
    const written = writeExportAttestation(ws, created.outFile, "amcpass", created.sha256);
    expect(written).toHaveProperty("path", `${created.outFile}.sigstore.json`);
    const bundle = JSON.parse(readFileSync(`${created.outFile}.sigstore.json`, "utf8")) as { dsseEnvelope: unknown };
    const pem = readFileSync(join(ws, ".amc", "keys", "artifact-seal.pub"), "utf8");
    const checked = verifyDsse(bundle.dsseEnvelope, INTOTO_PAYLOAD_TYPE, new Map([[sha256Hex(pem), pem]]));
    expect(checked.ok).toBe(true);
    const statement = JSON.parse((checked as { payload: Buffer }).payload.toString("utf8")) as { subject: Array<{ digest: { sha256: string } }>; predicate: { issuerRelationship: string } };
    expect(statement.subject[0]!.digest.sha256).toBe(created.sha256);
    expect(statement.predicate.issuerRelationship).toBe("self");
    expect(writeExportAttestation(ws, created.outFile, "amcpass", "0".repeat(64))).toHaveProperty("error");
  });
});
