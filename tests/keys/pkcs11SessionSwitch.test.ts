/** P2-08 provider boundary regression; injected clients and token fakes never use real services. */
import { describe, expect, it } from "vitest";
import { pkcs11Provider, type Pkcs11Module } from "../../src/keys/providers/pkcs11.js";
import { signChecked, type KeyRef } from "../../src/keys/provider.js";
import { fakeKey, pkcs11Fake } from "./providerFakes.js";

/** One allowed session per token makes a leaked displaced session fail on returning to that token. */
function twoTokens() {
  const labels = ["a", "b"];
  const tokens = labels.map(token => pkcs11Fake({ token, pin: "1234", keys: [{ label: "seal-ec", key: fakeKey("p256") }] }));
  const slots = [Buffer.from([1]), Buffer.from([2])];
  const opened: string[] = [];
  const closed: string[] = [];
  const active = new Map<string, { token: number; inner: Buffer }>();
  let nextHandle = 1;
  const selected = (handle: Buffer) => {
    const record = active.get(handle.toString("hex"));
    if (!record) throw Object.assign(new Error("session missing"), { code: 0xb3 });
    return { ...record, module: tokens[record.token]!.module };
  };
  const module: Pkcs11Module & { gcmParamsType: number } = {
    ...tokens[0]!.module,
    C_GetSlotList: () => slots,
    C_GetTokenInfo: slot => ({ label: labels[slots.findIndex(value => value.equals(slot))]! }),
    C_GetMechanismList: () => tokens[0]!.module.C_GetMechanismList(Buffer.from([0xaa])),
    C_OpenSession(slot, flags) {
      const token = slots.findIndex(value => value.equals(slot));
      if ([...active.values()].some(record => record.token === token)) throw Object.assign(new Error("session count exceeded"), { code: 0xb1 });
      const inner = tokens[token]!.module.C_OpenSession(Buffer.from([0xaa]), flags);
      const handle = Buffer.from([nextHandle++]);
      active.set(handle.toString("hex"), { token, inner });
      opened.push(labels[token]!);
      return handle;
    },
    C_CloseSession(handle) {
      const record = selected(handle);
      record.module.C_CloseSession(record.inner);
      active.delete(handle.toString("hex"));
      closed.push(labels[record.token]!);
    },
    C_Login(handle, userType, pin) { const record = selected(handle); return record.module.C_Login(record.inner, userType, pin); },
    C_FindObjectsInit(handle, template) { const record = selected(handle); return record.module.C_FindObjectsInit(record.inner, template); },
    C_FindObjects(handle, count) { const record = selected(handle); return record.module.C_FindObjects(record.inner, count); },
    C_FindObjectsFinal(handle) { const record = selected(handle); return record.module.C_FindObjectsFinal(record.inner); },
    C_GetAttributeValue(handle, object, template) { const record = selected(handle); return record.module.C_GetAttributeValue(record.inner, object, template); },
    C_SignInit(handle, mechanism, key) { const record = selected(handle); return record.module.C_SignInit(record.inner, mechanism, key); },
    C_Sign(handle, data, output) { const record = selected(handle); return record.module.C_Sign(record.inner, data, output); }
  };
  return { module, opened, closed, active };
}

describe("PKCS#11 token switching closes displaced sessions", () => {
  it("can return to a previously used token without exhausting its session count", async () => {
    const { module, opened, closed, active } = twoTokens();
    const provider = pkcs11Provider({ module, env: { AMC_PKCS11_PIN: "1234" } });
    const refA: KeyRef = { provider: "pkcs11", id: "pkcs11:token=a;object=seal-ec" };
    const refB: KeyRef = { provider: "pkcs11", id: "pkcs11:token=b;object=seal-ec" };
    const descriptionA = await provider.describe(refA);
    await provider.describe(refB);
    expect(await signChecked(provider, descriptionA, Buffer.from("AMC_PKCS11_TOKEN_SWITCH_V1"))).toHaveLength(64);
    expect(opened).toEqual(["a", "b", "a"]);
    expect(closed).toEqual(["a", "b"]);
    expect(active.size).toBe(1);
  });
});
