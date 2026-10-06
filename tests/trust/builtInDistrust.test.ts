import { afterEach, describe, expect, it, vi } from "vitest";
import { distrustEntry, testKey } from "./trustFixtures.js";

const shipped = vi.hoisted(() => ({ text: "" }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: unknown, ...rest: unknown[]) => /[\\/]trust[\\/]data[\\/]amc-distrust\.json$/.test(String(path)) && shipped.text
    ? shipped.text
    : (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest)) as typeof actual.readFileSync;
  return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});
const { admitKey, loadTrustContext, workspaceSelfTrust } = await import("../../src/trust/index.js");

afterEach(() => { shipped.text = ""; });

describe("built-in distrust (src/trust/data/amc-distrust.json)", () => {
  const key = testKey();
  const pin = { keyId: key.keyId, purposes: ["artifact-seal" as const], origin: "--pubkey k.pub" };

  it("refuses a key in an injected built-in entry even when --pubkey pins it, with or without --allow-unpinned", () => {
    shipped.text = JSON.stringify({ distrust: [distrustEntry(key.keyId, { reason: "exposed-in-public-history", source: "amc-project" })] });
    for (const allowUnpinned of [false, true]) {
      const context = { ...loadTrustContext({ amcHome: "/nonexistent-amc-home", allowUnpinned }), explicitPins: [pin] };
      expect(context.distrust.map(entry => entry.keyId)).toEqual([key.keyId]);
      expect(admitKey({ publicKeyPem: key.publicKeyPem, purpose: "artifact-seal", signature: "s", context }))
        .toMatchObject({ status: "distrusted", keyId: key.keyId, source: null });
    }
  });

  it("applies to workspace self-trust as well", () => {
    shipped.text = JSON.stringify({ distrust: [distrustEntry(key.keyId)] });
    expect(() => workspaceSelfTrust("/nonexistent-workspace")).not.toThrow();
    expect(workspaceSelfTrust("/nonexistent-workspace").distrust.map(entry => entry.keyId)).toEqual([key.keyId]);
  });

  it("fails closed when the shipped file is malformed", () => {
    shipped.text = JSON.stringify({ distrust: [{ keyId: key.keyId }] });
    expect(() => loadTrustContext({ amcHome: "/nonexistent-amc-home" })).toThrow();
    shipped.text = JSON.stringify({ distrust: [], disabled: true });
    expect(() => loadTrustContext({ amcHome: "/nonexistent-amc-home" })).toThrow();
  });
});
