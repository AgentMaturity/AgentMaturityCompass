import { describe, expect, test } from "vitest";
import { normalizeArguments } from "../../src/actions/normalizeArguments.js";
import { toolDefinitionSchema, type ToolDefinition } from "../../src/toolhub/toolsSchema.js";

const financial = toolDefinitionSchema.parse({ name: "payments.transfer", actionClass: "FINANCIAL",
  bindingFields: { amount: "amount", currency: "currency", recipient: "recipient" } });
const payment = { amount: "100.50", currency: "usd", recipient: "acme-001" };
const normalize = (args: Record<string, unknown>, definition: ToolDefinition = financial) =>
  normalizeArguments(definition, definition.actionClass, args);

describe("P1-02 declared argument normalization", () => {
  test("key order, leading zeros and fractional zeros preserve the same protected amount and digest", () => {
    const first = normalize(payment);
    const second = normalize({ recipient: "acme-001", currency: "USD", amount: "00100.5000" });
    expect(first).toMatchObject({ ok: true, normalizer: "amc.args/v1",
      bindings: { amount: { value: "100.5", currency: "USD" }, recipient: "acme-001" } });
    expect(second).toEqual(first);
  });

  test("NFC normalizes argument keys, nested strings and array contents without mutating input", () => {
    const input = { ...payment, "cafe\u0301": Object.freeze({ label: "cafe\u0301", values: ["e\u0301"] }) };
    const before = JSON.stringify(input);
    const actual = normalize(Object.freeze(input));
    const composed = normalize({ ...payment, "café": { label: "café", values: ["é"] } });
    expect(actual.ok).toBe(true);
    expect(actual).toEqual(composed);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("signed Unicode binding-field names use the same NFC lookup and decimal substitution", () => {
    const names = { amount: "montante\u0301", currency: "monnaie\u0301", recipient: "destinataire\u0301",
      destination: "destinatione\u0301", resourceId: "ressource\u0301", resourceVersion: "versione\u0301" };
    const definition = toolDefinitionSchema.parse({ ...financial, bindingFields: names });
    const values = ["00100.5000", "usd", "café", "https://Example.com/payments?q=1", "dossier-é", "révision-1"];
    const decomposed = Object.fromEntries(Object.values(names).map((name, index) => [name, values[index]!]));
    const composed = Object.fromEntries(Object.values(names).map((name, index) => [name.normalize("NFC"), values[index]!]));
    const result = normalize(decomposed, definition);
    expect(result).toMatchObject({ ok: true, normalizer: "amc.args/v1", bindings: {
      amount: { value: "100.5", currency: "USD" }, recipient: "café", destination: "https://example.com",
      resourceId: "dossier-é", resourceVersion: "révision-1" } });
    expect(normalize(composed, definition)).toEqual(result);
    const canonicalDefinition = toolDefinitionSchema.parse({ ...financial,
      bindingFields: Object.fromEntries(Object.entries(names).map(([role, name]) => [role, name.normalize("NFC")])) });
    expect(normalize(composed, canonicalDefinition)).toEqual(result);
  });

  test.each([
    { name: "top-level", extra: { "café": "first", "cafe\u0301": "second" } },
    { name: "nested object", extra: { details: { "café": "first", "cafe\u0301": "second" } } },
    { name: "nested array", extra: { items: [{ "café": "first", "cafe\u0301": "second" }] } },
    { name: "reversed keys", extra: { "cafe\u0301": "second", "café": "first" } },
    { name: "equal values", extra: { "café": "same", "cafe\u0301": "same" } }
  ])("refuses ambiguous NFC keys in $name instead of overwriting an argument", ({ extra }) => {
    const result = normalize({ ...payment, ...extra });
    expect(result).toMatchObject({ ok: false, failure: "binding_fields_missing" });
    if (!result.ok) expect(result.reason).toMatch(/NFC/);
  });

  test.each([100, 0.1, "1e2", "+100", "100.", " 100", "100 USD"])("refuses non-decimal or numeric amount %j", amount => {
    expect(normalize({ ...payment, amount })).toMatchObject({ ok: false, failure: "binding_fields_missing" });
  });

  test.each(["amount", "currency", "recipient"] as const)("requires the signed %s binding declaration", role => {
    const fields = { ...financial.bindingFields };
    delete fields[role];
    expect(normalize(payment, toolDefinitionSchema.parse({ ...financial, bindingFields: fields })))
      .toMatchObject({ ok: false, failure: "binding_fields_missing" });
  });

  test("requires a financial signed definition and a data-export destination declaration", () => {
    expect(normalizeArguments(null, "FINANCIAL", payment)).toMatchObject({ ok: false, failure: "binding_fields_missing" });
    expect(normalizeArguments(null, "DATA_EXPORT", { destination: "account-001" }))
      .toMatchObject({ ok: false, failure: "binding_fields_missing" });
  });

  test("treats an explicitly undefined signed binding field as undeclared", () => {
    const definition = toolDefinitionSchema.parse({ ...financial,
      bindingFields: { ...financial.bindingFields, amount: undefined } });
    expect(normalize(payment, definition)).toMatchObject({ ok: false, failure: "binding_fields_missing" });
  });

  test("binds route destinations literally and HTTP destinations by origin", () => {
    const definition = toolDefinitionSchema.parse({ name: "records.export", actionClass: "DATA_EXPORT",
      bindingFields: { destination: "destination" } });
    expect(normalize({ destination: "account-001" }, definition)).toMatchObject({ ok: true,
      bindings: { destination: "account-001" } });
    expect(normalize({ destination: "https://Example.com:443/private/path" }, definition)).toMatchObject({ ok: true,
      bindings: { destination: "https://example.com" } });
    expect(normalize({ destination: 7 }, definition)).toMatchObject({ ok: false, failure: "binding_fields_missing" });
  });

  test("records agent-supplied authority metadata without making it a protected binding", () => {
    const metadata = { approvalId: "untrusted-request", approved: true, consent: "patient consented", _amcRole: "owner" };
    const result = normalize({ ...payment, ...metadata });
    expect(result).toMatchObject({ ok: true, agentSuppliedMetadata: metadata,
      bindings: { amount: { value: "100.5", currency: "USD" }, recipient: "acme-001" } });
  });

  test("preserves the signed ASCII idempotency-carrier exclusion and records its untrusted value", () => {
    const definition = toolDefinitionSchema.parse({ ...financial,
      effects: { repeatable: false, idempotency: { carrier: "argument", name: "execution_key" } } });
    const first = normalize({ ...payment, execution_key: "model-key-a" }, definition);
    const second = normalize({ ...payment, execution_key: "model-key-b" }, definition);
    expect(first).toMatchObject({ ok: true, agentSuppliedMetadata: { execution_key: "model-key-a" } });
    expect(second).toMatchObject({ ok: true, agentSuppliedMetadata: { execution_key: "model-key-b" } });
    if (first.ok && second.ok) expect(first.argumentsDigest).toBe(second.argumentsDigest);
  });

  test("refuses a declared resource whose NFC name aliases the idempotency carrier", () => {
    const definition = toolDefinitionSchema.parse({ ...financial,
      bindingFields: { ...financial.bindingFields, resourceId: "K" },
      effects: { repeatable: false, idempotency: { carrier: "argument", name: "K" } } });
    for (const resourceId of ["dataset-a", "dataset-b"]) {
      const result = normalize({ ...payment, "K": resourceId }, definition);
      expect(result).toMatchObject({ ok: false, failure: "binding_fields_missing" });
      if (!result.ok) expect(result.reason).toMatch(/idempotency/);
    }
  });

  test("keeps prototype-like JSON keys as data and preserves array order in the digest", () => {
    const prototypeBefore = Object.getOwnPropertyDescriptor(Object.prototype, "polluted");
    const args = JSON.parse('{"__proto__":{"polluted":true},"constructor":"data","values":[1,2]}') as Record<string, unknown>;
    const result = normalizeArguments(null, "READ_ONLY", args);
    expect(result.ok).toBe(true);
    expect(Object.getOwnPropertyDescriptor(Object.prototype, "polluted")).toEqual(prototypeBefore);
    const changedData = JSON.parse('{"__proto__":{"polluted":false},"constructor":"data","values":[1,2]}') as Record<string, unknown>;
    const changed = normalizeArguments(null, "READ_ONLY", changedData);
    expect(changed.ok).toBe(true);
    if (result.ok && changed.ok) expect(result.argumentsDigest).not.toBe(changed.argumentsDigest);
    const reversed = normalizeArguments(null, "READ_ONLY", { ...args, values: [2, 1] });
    if (result.ok && reversed.ok) expect(result.argumentsDigest).not.toBe(reversed.argumentsDigest);
  });
});
