/**
 * GAP-WP12: a composition signature is valid only when an injected verifier
 * built from the workspace's admitted keys authenticates it; a digest match
 * plus a nonempty signature string is integrity, not attestation. The exact
 * bytes Include parses are admitted at boot and at every reload.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { boot, loadComposition, CompositionError, type BootResult } from "@amc/core";
import { initWorkspace } from "../../src/workspace.js";
import { getSigningKey, signHexDigest } from "../../src/crypto/keys.js";
import { createCompositionSignatureVerifier } from "../../src/config/amcConfigSignature.js";

const roots: string[] = [];
const newWorkspace = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "amc-composition-admission-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  mkdirSync(join(dir, "plugins"), { recursive: true });
  return dir;
};
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const log = (): string[] => (globalThis as Record<string, unknown>).__amcAdmission as string[];

let workspace: string;
let foreign: string;
let booted: BootResult | undefined;
beforeAll(() => { workspace = newWorkspace(); foreign = newWorkspace(); }, 60_000);
afterEach(async () => { await booted?.dispose(); booted = undefined; });
afterAll(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });

const compositionPath = (): string => join(workspace, "amc.cordis.yml");
const writePlugin = (name: string): void => writeFileSync(join(workspace, "plugins", `${name}.js`),
  `export default { name: ${JSON.stringify(name)}, apply(ctx) { globalThis.__amcAdmission.push(${JSON.stringify(name)});` +
  ` ctx.effect(() => () => globalThis.__amcAdmission.push(${JSON.stringify(`${name}:dispose`)})); } };\n`);
const compose = (names: string[]): string => {
  const text = names.length === 0 ? "[]\n" : `${names.map((n, i) => `- id: "${i}"\n  name: "./plugins/${n}.js"`).join("\n")}\n`;
  writeFileSync(compositionPath(), text);
  return text;
};
const sidecar = (text: string, signature: string): void =>
  writeFileSync(`${compositionPath()}.sig`, JSON.stringify({ configSha256: sha(text), signature, signedTs: 1, signer: "auditor" }));
const signWith = (keyWorkspace: string, text: string): void => sidecar(text, signHexDigest(sha(text), getSigningKey(keyWorkspace, "config-signature")));

describe("composition signature status", () => {
  it("a correct digest with an arbitrary nonempty signature is not verified and fails a required signature", async () => {
    const text = compose([]);
    sidecar(text, "c2lnbmF0dXJl");
    const verifySignature = createCompositionSignatureVerifier(workspace);
    expect(loadComposition({ workspace, verifySignature }).signature).toMatchObject({
      present: true, digestMatched: true, signatureVerified: false, signer: null, valid: false });
    expect(() => loadComposition({ workspace, verifySignature, requireSignature: true })).toThrow(CompositionError);
    await expect(boot({ workspace, verifySignature, requireSignature: true })).rejects.toThrow(CompositionError);
  });

  it("without an injected verifier a digest match is reported as unverified", () => {
    const text = compose([]);
    signWith(workspace, text);
    expect(loadComposition({ workspace }).signature).toMatchObject({ digestMatched: true, signatureVerified: false, valid: false });
    expect(loadComposition({ workspace }).signature.reason).toMatch(/no signature verifier/);
    expect(() => loadComposition({ workspace, requireSignature: true })).toThrow(CompositionError);
  });

  it("a signature from this workspace's admitted key verifies; another workspace's key and a tampered file do not", () => {
    const verifySignature = createCompositionSignatureVerifier(workspace);
    const text = compose([]);
    signWith(workspace, text);
    expect(loadComposition({ workspace, verifySignature, requireSignature: true }).signature).toMatchObject({
      digestMatched: true, signatureVerified: true, signer: "auditor", valid: true, reason: null });
    signWith(foreign, text);
    expect(loadComposition({ workspace, verifySignature }).signature).toMatchObject({ digestMatched: true, signatureVerified: false });
    signWith(workspace, text);
    writeFileSync(compositionPath(), "[]\n# edited\n");
    expect(loadComposition({ workspace, verifySignature }).signature).toMatchObject({ digestMatched: false, signatureVerified: false });
  });
});

describe("admission at boot and reload", () => {
  it("rejects bytes that change between the boot check and Include's mount read", async () => {
    (globalThis as Record<string, unknown>).__amcAdmission = [];
    writePlugin("alpha");
    const text = compose([]);
    signWith(workspace, text);
    const real = createCompositionSignatureVerifier(workspace);
    let swapped = false;
    const verifySignature = (input: { sha256: string; signature: string }): boolean => {
      const ok = real(input);
      // After the boot-time check passes, the file changes under the old sidecar before Include reads it.
      if (!swapped) { swapped = true; writeFileSync(compositionPath(), `- id: "0"\n  name: "./plugins/alpha.js"\n`); }
      return ok;
    };
    const error = await boot({ workspace, verifySignature, requireSignature: true }).catch((e: unknown) => e);
    // The loader wraps the mount-time refusal; its cause is the admission error.
    expect((error as Error).cause ?? error).toBeInstanceOf(CompositionError);
    expect(String(((error as Error).cause as Error | undefined)?.message ?? error)).toMatch(/changed since signing/);
    expect(log()).toEqual([]);
  });

  it("a reload with a forged signature is refused and the last admitted tree stays active", async () => {
    (globalThis as Record<string, unknown>).__amcAdmission = [];
    writePlugin("alpha");
    writePlugin("beta");
    const verifySignature = createCompositionSignatureVerifier(workspace);
    const first = compose(["alpha"]);
    signWith(workspace, first);
    booted = await boot({ workspace, verifySignature, requireSignature: true });
    expect(booted.composition.signature.signatureVerified).toBe(true);
    expect(log()).toEqual(["alpha"]);

    const forged = compose(["beta"]);
    sidecar(forged, "Zm9yZ2Vk");
    await expect(booted.reload()).rejects.toThrow(CompositionError);
    expect(log(), "the rejected tree never mounts and alpha is not disposed").toEqual(["alpha"]);
    expect(booted.composition.sha256).toBe(sha(first));

    signWith(workspace, forged);
    await booted.reload();
    expect(log()).toEqual(["alpha", "alpha:dispose", "beta"]);
    expect(booted.composition).toMatchObject({ sha256: sha(forged), signature: { signatureVerified: true } });
  }, 30_000);
});
