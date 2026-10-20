import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";

interface RenderParams {
  apiGet(path: string): Promise<unknown>;
  root: { innerHTML: string };
  card(title: string, body: string): string;
  htmlEscape(value: unknown): string;
}

describe("actual trust console protection basis rendering", () => {
  test.each(["provider-metadata", "provider-reported", undefined])("retains the truthful %s basis in the rendered trust details", async basis => {
    const source = readFileSync(new URL("../../src/console/assets/trust.js", import.meta.url), "utf8");
    const render = runInNewContext(source.replace(/^export /m, "") + "; renderTrustPage", {}, { timeout: 1000 }) as (params: RenderParams) => Promise<void>;
    const root = { innerHTML: "" }, escaped: string[] = [];
    await render({ root, apiGet: async path => {
      expect(path).toBe("/trust/status");
      return { signature: { valid: true }, trust: { mode: "NOTARY", ok: true, attestationLevel: "HARDWARE", attestationBasis: basis } };
    }, card: (title, body) => `<section><h2>${title}</h2>${body}</section>`, htmlEscape: value => {
      const text = String(value); escaped.push(text); return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    } });
    const details = escaped.find(value => value.includes('"attestationBasis"'));
    expect(details).toBeDefined();
    expect(JSON.parse(details!)).toMatchObject({ attestationLevel: "HARDWARE", attestationBasis: basis ?? null });
    expect(root.innerHTML).toContain(details!);
    expect(root.innerHTML).not.toContain('"attestationBasis": "attested"');
  });
});
