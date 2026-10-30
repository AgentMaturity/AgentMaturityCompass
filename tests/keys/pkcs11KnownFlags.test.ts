/** P2-08: token protection flags must be known before any signing or wrapping operation. */
import { describe, expect, it } from "vitest";
import { CK, pkcs11Provider, type Pkcs11Module } from "../../src/keys/providers/pkcs11.js";
import { signChecked, type KeyRef } from "../../src/keys/provider.js";
import { fakeKey, pkcs11Fake } from "./providerFakes.js";

type FlagValue = Buffer | undefined | null;
interface Flags { extractable: FlagValue; sensitive: FlagValue }
const allowed = (): Flags => ({ extractable: Buffer.from([0]), sensitive: Buffer.from([1]) });
const signingRef: KeyRef = { provider: "pkcs11", id: "pkcs11:token=amc;object=seal-ec" };
const wrappingRef: KeyRef = { provider: "pkcs11", id: "pkcs11:token=amc;object=dek-wrap" };
const refusal = { code: "KEY_PROVIDER_KEY_REFUSED", provider: "pkcs11" };

/** Reuse the existing token's real keys and AEAD; change only attribute replies and observe crypto entry points. */
function tokenWithFlags(initial: Flags = allowed()) {
  const fake = pkcs11Fake({ token: "amc", pin: "1234", keys: [{ label: "seal-ec", key: fakeKey("p256") }], secrets: ["dek-wrap"] });
  let current = initial;
  const cryptoCalls: string[] = [];
  const module: Pkcs11Module & { gcmParamsType: number } = {
    ...fake.module,
    C_GetAttributeValue(session, handle, template) {
      const isFlag = (type: number) => type === CK.CKA_EXTRACTABLE || type === CK.CKA_SENSITIVE;
      const rows = fake.module.C_GetAttributeValue(session, handle, template.filter(row => !isFlag(row.type)));
      for (const row of template.filter(row => isFlag(row.type))) {
        const value = row.type === CK.CKA_EXTRACTABLE ? current.extractable : current.sensitive;
        if (value !== null) rows.push(value === undefined ? { type: row.type } : { type: row.type, value });
      }
      return rows;
    },
    C_SignInit(session, mechanism, key) {
      cryptoCalls.push("C_SignInit");
      return fake.module.C_SignInit(session, mechanism, key);
    },
    C_EncryptInit(session, mechanism, key) {
      cryptoCalls.push("C_EncryptInit");
      return fake.module.C_EncryptInit(session, mechanism, key);
    },
    C_DecryptInit(session, mechanism, key) {
      cryptoCalls.push("C_DecryptInit");
      return fake.module.C_DecryptInit(session, mechanism, key);
    }
  };
  return {
    provider: pkcs11Provider({ module, env: { AMC_PKCS11_PIN: "1234", AMC_PKCS11_PROTECTION: "software" } }),
    cryptoCalls,
    setFlags(next: Flags) { current = next; }
  };
}

const refusedFlags: Array<{ name: string; flags: Flags }> = [
  { name: "extractable key", flags: { ...allowed(), extractable: Buffer.from([1]) } },
  { name: "non-sensitive key", flags: { ...allowed(), sensitive: Buffer.from([0]) } },
  { name: "missing extractable attribute", flags: { ...allowed(), extractable: null } },
  { name: "undefined extractable value", flags: { ...allowed(), extractable: undefined } },
  { name: "empty extractable value", flags: { ...allowed(), extractable: Buffer.alloc(0) } },
  { name: "two-byte false value", flags: { ...allowed(), extractable: Buffer.from([0, 0]) } },
  { name: "missing sensitive attribute", flags: { ...allowed(), sensitive: null } },
  { name: "undefined sensitive value", flags: { ...allowed(), sensitive: undefined } },
  { name: "empty sensitive value", flags: { ...allowed(), sensitive: Buffer.alloc(0) } },
  { name: "two-byte true value", flags: { ...allowed(), sensitive: Buffer.from([1, 0]) } },
  { name: "noncanonical true value", flags: { ...allowed(), sensitive: Buffer.from([2]) } }
];

describe("PKCS#11 private and symmetric keys require exact known protection flags", () => {
  it("signs and wraps only when both flags have their exact required values", async () => {
    const { provider, cryptoCalls } = tokenWithFlags();
    const description = await provider.describe(signingRef);
    expect(description.exportable).toBe(false);
    expect(await signChecked(provider, description, Buffer.from("AMC_P2_08_KNOWN_FLAGS_V1"))).toHaveLength(64);
    const plaintext = Buffer.alloc(32, 7);
    const wrapped = await provider.wrapKey!(wrappingRef, plaintext);
    expect(Buffer.from(await provider.unwrapKey!(wrappingRef, wrapped))).toEqual(plaintext);
    expect(cryptoCalls).toEqual(["C_SignInit", "C_EncryptInit", "C_DecryptInit"]);
  });

  it.each(refusedFlags)("refuses describe for $name", async ({ flags }) => {
    const { provider, cryptoCalls } = tokenWithFlags(flags);
    await expect(provider.describe(signingRef)).rejects.toMatchObject(refusal);
    expect(cryptoCalls).toEqual([]);
  });

  it.each(refusedFlags)("rechecks the actual signing handle after cached describe for $name", async ({ flags }) => {
    const { provider, setFlags, cryptoCalls } = tokenWithFlags();
    const description = await provider.describe(signingRef);
    setFlags(flags);
    await expect(signChecked(provider, description, Buffer.from("AMC_P2_08_CACHED_FLAGS_V1"))).rejects.toMatchObject(refusal);
    expect(cryptoCalls).toEqual([]);
  });

  it.each(refusedFlags)("refuses wrap before crypto for $name", async ({ flags }) => {
    const { provider, cryptoCalls } = tokenWithFlags(flags);
    await expect(provider.wrapKey!(wrappingRef, Buffer.alloc(32, 7))).rejects.toMatchObject(refusal);
    expect(cryptoCalls).toEqual([]);
  });

  it.each(refusedFlags)("refuses unwrap before crypto when the actual wrapping key has $name", async ({ flags }) => {
    const { provider, setFlags, cryptoCalls } = tokenWithFlags();
    const wrapped = await provider.wrapKey!(wrappingRef, Buffer.alloc(32, 7));
    cryptoCalls.length = 0;
    setFlags(flags);
    await expect(provider.unwrapKey!(wrappingRef, wrapped)).rejects.toMatchObject(refusal);
    expect(cryptoCalls).toEqual([]);
  });
});
