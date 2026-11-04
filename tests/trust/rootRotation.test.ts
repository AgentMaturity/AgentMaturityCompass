import { sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTrustRootRotation, signRootRotation, type RootRotationStatement } from "../../src/trust/rootRotation.js";
import { loadTrustContext, signTrustList } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import * as containedFs from "../../src/utils/containedFs.js";
import { listEntry, testKey, trustList, type TestKey } from "./trustFixtures.js";

const NOW = new Date("2026-10-06T00:00:00.000Z");
const homes: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

function home(roots: TestKey[], threshold: number, rootSetId = "acme-roots"): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-root-rotation-"));
  homes.push(dir);
  mkdirSync(join(dir, "trust"), { recursive: true });
  writeFileSync(join(dir, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: roots.map(root => root.keyId), threshold, rootSetId }));
  return dir;
}
function rotation(from: TestKey[], fromThreshold: number, to: TestKey[], toThreshold: number, patch: Partial<RootRotationStatement> = {}): RootRotationStatement {
  return { type: "amc.root-rotation", version: 1, rootSetId: "acme-roots", sequence: 1, previousSha256: null,
    previousRoots: from.map(key => key.keyId), previousThreshold: fromThreshold, newRoots: to.map(key => key.keyId), newThreshold: toThreshold,
    newRootPublicKeyPems: to.map(key => key.publicKeyPem), allowDecrease: false, issuedAt: "2026-10-05T00:00:00.000Z", ...patch };
}
const priv = (...keys: TestKey[]) => keys.map(key => key.privateKeyPem);
/** What an attacker writes by hand: rows by any key, in either role (signRootRotation refuses a key outside the role's set). */
function forge(statement: RootRotationStatement, current: TestKey[], next: TestKey[]): Buffer {
  const bytes = Buffer.concat([Buffer.from("amc.root-rotation/v1\0", "utf8"), Buffer.from(canonicalize(statement), "utf8")]);
  const rows = [...current.map(key => ({ by: "current", key })), ...next.map(key => ({ by: "new", key }))]
    .map(({ by, key }) => ({ by, keyId: key.keyId, signature: sign(null, bytes, key.privateKeyPem).toString("base64") }))
    .sort((x, y) => x.by.localeCompare(y.by) || x.keyId.localeCompare(y.keyId));
  return Buffer.from(canonicalize({ statement, signatures: rows }), "utf8");
}
const pub = (...keys: TestKey[]) => keys.map(key => key.publicKeyPem);
const apply = (amcHome: string, statement: Buffer, current: TestKey[]) => applyTrustRootRotation({ statement, currentRootPublicKeyPems: pub(...current), amcHome });

describe("trust-list root-set rotation (P1-08, security review)", () => {
  const [a, b, c, d, e] = [testKey(), testKey(), testKey(), testKey(), testKey()];

  it("m-of-n of the current set authorizes, m-of-n of the new set proves possession, and the new set then signs lists", () => {
    const amcHome = home([a, b, c], 2);
    const bytes = signRootRotation(rotation([a, b, c], 2, [b, c, d], 2), { current: priv(a, b), next: priv(c, d) });
    expect(apply(amcHome, bytes, [a, b, c])).toMatchObject({ sequence: 1, roots: [b.keyId, c.keyId, d.keyId], threshold: 2 });
    const listFile = join(amcHome, "trust", "amc-trust-list.json");
    const list = trustList([listEntry(testKey())]);
    writeFileSync(listFile, JSON.stringify({ list, signatures: [...signTrustList(list, c.privateKeyPem).signatures, ...signTrustList(list, d.privateKeyPem).signatures] }));
    expect(loadTrustContext({ amcHome, now: NOW }).lists).toHaveLength(1);
  });

  it("signatures from the new set alone, or one current signature under a threshold of 2, never authorize", () => {
    const amcHome = home([a, b, c], 2);
    expect(() => apply(amcHome, signRootRotation(rotation([a, b, c], 2, [c, d, e], 2), { current: [], next: priv(c, d, e) }), [a, b, c])).toThrow(/needs 2 distinct signatures from the current root set/);
    // New-set keys signing in the "current" role, even with their public keys handed in, carry no authority.
    expect(() => apply(amcHome, forge(rotation([a, b, c], 2, [c, d, e], 2), [d, e], [c, d, e]), [a, b, c, d, e])).toThrow(/not by a key of the current root set/);
    expect(() => apply(amcHome, signRootRotation(rotation([a, b, c], 2, [c, d, e], 2), { current: priv(a), next: priv(d, e) }), [a, b, c])).toThrow(/needs 2 distinct/);
    expect(() => apply(amcHome, signRootRotation(rotation([a, b, c], 2, [c, d, e], 2), { current: priv(a, b), next: priv(d) }), [a, b, c])).toThrow(/prove possession/);
  });

  it("refuses a threshold decrease signed only by the new set, a silent decrease, and a rotation to m=1", () => {
    const amcHome = home([a, b, c], 3);
    expect(() => apply(amcHome, signRootRotation(rotation([a, b, c], 3, [d, e], 2, { allowDecrease: true }), { current: [], next: priv(d, e) }), [a, b, c])).toThrow(/current root set/);
    expect(() => apply(amcHome, forge(rotation([a, b, c], 3, [d, e], 2, { allowDecrease: true }), [d, e], [d, e]), [a, b, c])).toThrow(/current root set/);
    expect(() => apply(amcHome, signRootRotation(rotation([a, b, c], 3, [d, e], 2), { current: priv(a, b, c), next: priv(d, e) }), [a, b, c])).toThrow(/allowDecrease/);
    expect(apply(amcHome, signRootRotation(rotation([a, b, c], 3, [d, e], 2, { allowDecrease: true }), { current: priv(a, b, c), next: priv(d, e) }), [a, b, c]).threshold).toBe(2);
    expect(() => signRootRotation(rotation([d, e], 2, [d], 1), { current: priv(d, e), next: priv(d) })).toThrow(/at least 2/);
    expect(() => signRootRotation(rotation([d, e], 2, [d, d], 2), { current: priv(d, e), next: priv(d) })).toThrow(/unique/);
  });

  it("refuses replaying an applied rotation and a fork from the version before last", () => {
    const amcHome = home([a, b], 2);
    const first = signRootRotation(rotation([a, b], 2, [b, c], 2), { current: priv(a, b), next: priv(b, c) });
    apply(amcHome, first, [a, b]);
    expect(() => apply(amcHome, first, [a, b, c])).toThrow(/already applied|does not follow/);
    const second = signRootRotation(rotation([b, c], 2, [c, d], 2, { sequence: 2, previousSha256: sha256Hex(first) }), { current: priv(b, c), next: priv(c, d) });
    apply(amcHome, second, [b, c]);
    // A fork that also claims to follow rotation 1, signed by the set rotation 1 installed.
    const fork = signRootRotation(rotation([b, c], 2, [b, e], 2, { sequence: 2, previousSha256: sha256Hex(first) }), { current: priv(b, c), next: priv(b, e) });
    expect(() => apply(amcHome, fork, [b, c])).toThrow(/does not follow|not the pinned root set/);
    expect(() => apply(amcHome, first, [a, b, c, d])).toThrow(/does not follow|not the pinned root set/);
    // The right sequence and signers, but chained to rotation 1 rather than the applied rotation 2.
    const stale = signRootRotation(rotation([c, d], 2, [c, e], 2, { sequence: 3, previousSha256: sha256Hex(first) }), { current: priv(c, d), next: priv(c, e) });
    expect(() => apply(amcHome, stale, [c, d])).toThrow(/previousSha256/);
    const gap = signRootRotation(rotation([c, d], 2, [c, e], 2, { sequence: 4, previousSha256: sha256Hex(second) }), { current: priv(c, d), next: priv(c, e) });
    expect(() => apply(amcHome, gap, [c, d])).toThrow(/sequence 4 does not follow the applied 2/);
  });

  it("refuses a rotation for another root set, and duplicate signatures from one key", () => {
    const amcHome = home([a, b], 2);
    expect(() => apply(amcHome, signRootRotation(rotation([a, b], 2, [b, c], 2, { rootSetId: "other-roots" }), { current: priv(a, b), next: priv(b, c) }), [a, b])).toThrow(/for root set other-roots/);
    const bytes = signRootRotation(rotation([a, b], 2, [b, c], 2), { current: priv(a, b), next: priv(b, c) });
    const parsed = JSON.parse(bytes.toString("utf8"));
    const dup = { ...parsed, signatures: [parsed.signatures[0], parsed.signatures[0], ...parsed.signatures.slice(1)] };
    expect(() => apply(amcHome, Buffer.from(JSON.stringify(dup)), [a, b])).toThrow(/canonical|one per key/);
  });

  it("once rotated, an edited trust-roots.json or a missing anchored statement fails closed", () => {
    const amcHome = home([a, b], 2);
    apply(amcHome, signRootRotation(rotation([a, b], 2, [b, c], 2), { current: priv(a, b), next: priv(b, c) }), [a, b]);
    const rootsFile = join(amcHome, "trust", "trust-roots.json");
    const installed = readFileSync(rootsFile, "utf8");
    writeFileSync(join(amcHome, "trust", "amc-trust-list.json"), JSON.stringify(signTrustList(trustList([listEntry(testKey())]), b.privateKeyPem)));
    writeFileSync(rootsFile, JSON.stringify({ ...JSON.parse(installed), roots: [b.keyId, e.keyId] }));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/differs from the root set rotation 1 installed/);
    writeFileSync(rootsFile, installed);
    rmSync(join(amcHome, "state", "root-rotations", "acme-roots", "1.json"));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/rotation 1 is missing/);
  });

  it("an apply interrupted after its anchor is finished by applying the same statement again", () => {
    const amcHome = home([a, b], 2);
    const bytes = signRootRotation(rotation([a, b], 2, [b, c], 2), { current: priv(a, b), next: priv(b, c) });
    const write = containedFs.writeContained;
    vi.spyOn(containedFs, "writeContained").mockImplementation((root, rel, data, mode) => {
      if (rel === "trust/trust-roots.json") throw new Error("simulated crash");
      write(root, rel, data, mode);
    });
    expect(() => apply(amcHome, bytes, [a, b])).toThrow(/simulated/);
    vi.restoreAllMocks();
    writeFileSync(join(amcHome, "trust", "amc-trust-list.json"), JSON.stringify(signTrustList(trustList([listEntry(testKey())]), a.privateKeyPem)));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/differs from the root set rotation 1 installed/);
    expect(() => apply(amcHome, bytes, [d, e])).toThrow(/needs 2 distinct signatures from the current root set|not by a key of the current/);
    expect(apply(amcHome, bytes, [a, b])).toMatchObject({ sequence: 1, roots: [b.keyId, c.keyId] });
    expect(() => apply(amcHome, bytes, [a, b])).toThrow(/already applied/);
  });

  it("after a rotation, a trust-roots.json that drops or changes rootSetId, or is deleted, fails closed", () => {
    const amcHome = home([a, b], 2);
    apply(amcHome, signRootRotation(rotation([a, b], 2, [b, c], 2), { current: priv(a, b), next: priv(b, c) }), [a, b]);
    const rootsFile = join(amcHome, "trust", "trust-roots.json");
    const list = trustList([listEntry(testKey())]);
    writeFileSync(join(amcHome, "trust", "amc-trust-list.json"), JSON.stringify({ list, signatures: [b, c].flatMap(key => signTrustList(list, key.privateKeyPem).signatures) }));
    expect(loadTrustContext({ amcHome, now: NOW }).lists).toHaveLength(1);
    // The 1.x file format, which has no rootSetId and so would skip every rotation check.
    writeFileSync(rootsFile, JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [b.keyId, c.keyId], threshold: 2 }));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/names no rootSetId/);
    writeFileSync(rootsFile, JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [b.keyId, c.keyId], threshold: 2, rootSetId: "fresh-roots" }));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/names fresh-roots/);
    rmSync(rootsFile);
    expect(() => loadTrustContext({ amcHome, now: NOW, trustRoots: [b.keyId] })).toThrow(/trust-roots.json is missing/);
  });

  it("a forged statement in the stored chain, with this machine's mark lost, installs nothing", () => {
    const amcHome = home([a, b], 2);
    const first = signRootRotation(rotation([a, b], 2, [b, c], 2), { current: priv(a, b), next: priv(b, c) });
    apply(amcHome, first, [a, b]);
    // Signed as "current" by keys the attacker holds, not by the set rotation 1 installed.
    const forged = forge(rotation([b, c], 2, [d, e], 2, { sequence: 2, previousSha256: sha256Hex(first) }), [d, e], [d, e]);
    writeFileSync(join(amcHome, "state", "root-rotations", "acme-roots", "2.json"), forged);
    rmSync(join(amcHome, "state", "high-water.json"));
    writeFileSync(join(amcHome, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [d.keyId, e.keyId], threshold: 2, rootSetId: "acme-roots" }));
    const list = trustList([listEntry(testKey())]);
    writeFileSync(join(amcHome, "trust", "amc-trust-list.json"), JSON.stringify({ list, signatures: [d, e].flatMap(key => signTrustList(list, key.privateKeyPem).signatures) }));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/current signature by .* is not by a key of the current root set/);
  });

  it("refuses to overwrite a different, never-anchored statement left at the next sequence", () => {
    const amcHome = home([a, b], 2);
    const first = signRootRotation(rotation([a, b], 2, [b, c], 2), { current: priv(a, b), next: priv(b, c) });
    apply(amcHome, first, [a, b]);
    const leftover = signRootRotation(rotation([b, c], 2, [b, d], 2, { sequence: 2, previousSha256: sha256Hex(first) }), { current: priv(b, c), next: priv(b, d) });
    writeFileSync(join(amcHome, "state", "root-rotations", "acme-roots", "2.json"), leftover);
    const second = signRootRotation(rotation([b, c], 2, [c, e], 2, { sequence: 2, previousSha256: sha256Hex(first) }), { current: priv(b, c), next: priv(c, e) });
    expect(() => apply(amcHome, second, [b, c])).toThrow(/never anchored/);
  });

  it("an older list signed by roots that survive the rotation stays refused after it", () => {
    const amcHome = home([a, b, c], 2);
    const listFile = join(amcHome, "trust", "amc-trust-list.json");
    const signedBy = (sequence: number, ...keys: TestKey[]) => {
      const list = trustList([listEntry(testKey())], { sequence });
      return { list, signatures: keys.flatMap(key => signTrustList(list, key.privateKeyPem).signatures) };
    };
    const older = signedBy(4, b, c);
    writeFileSync(listFile, JSON.stringify(signedBy(5, b, c)));
    expect(loadTrustContext({ amcHome, now: NOW }).lists[0]?.sequence).toBe(5);
    apply(amcHome, signRootRotation(rotation([a, b, c], 2, [b, c, d], 2), { current: priv(a, b), next: priv(b, c) }), [a, b, c]);
    writeFileSync(listFile, JSON.stringify(older));
    expect(() => loadTrustContext({ amcHome, now: NOW })).toThrow(/ROLLBACK_DETECTED/);
  });
});
