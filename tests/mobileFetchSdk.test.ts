import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, test } from "vitest";
import { createAMCMobileFetchBridge, createReactNativeAMCFetch } from "../src/sdk/mobileFetch.js";
import * as sdkExports from "../src/sdk/index.js";
import { orgSignatureSchema, orgScorecardSignatureSchema } from "../src/org/orgSchema.js";
import { createHash } from "node:crypto";
import ts from "typescript";
import { landedText } from "./helpers/landedSource.js";

function headersObject(headers: HeadersInit | undefined): Record<string, string> {
  const headersObj = new Headers(headers);
  const out: Record<string, string> = {};
  headersObj.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

describe("AMC mobile fetch bridge", () => {
  test("rewrites React Native-style OpenAI fetch calls to AMC Bridge and strips provider auth", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "x-amc-receipt": "receipt-1" }
      });
    }) as typeof fetch;

    const amcFetch = createAMCMobileFetchBridge({
      bridgeUrl: "https://amc.example.com",
      token: "amc-token",
      agentId: "mobile-agent",
      workspaceId: "workspace-1",
      fetchImpl,
      correlationIdFactory: () => "corr-mobile-1"
    });

    const response = await amcFetch("https://api.openai.com/v1/chat/completions?trace=1", {
      method: "POST",
      headers: {
        authorization: "Bearer provider-key",
        "content-type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hello" }] })
    });

    expect(response.status).toBe(200);
    expect(calls[0]?.url).toBe("https://amc.example.com/bridge/openai/v1/chat/completions?trace=1");
    const headers = headersObject(calls[0]?.init?.headers);
    expect(headers.authorization).toBe("Bearer amc-token");
    expect(headers["x-amc-agent-id"]).toBe("mobile-agent");
    expect(headers["x-amc-workspace-id"]).toBe("workspace-1");
    expect(headers["x-amc-correlation-id"]).toBe("corr-mobile-1");
    expect(headers["x-amc-sdk-name"]).toBe("amc-mobile-fetch");
  });

  test("infers non-OpenAI providers from host names", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const amcFetch = createAMCMobileFetchBridge({
      bridgeUrl: "https://amc.example.com/root/",
      agentId: "mobile-agent",
      fetchImpl,
      correlationIdFactory: () => "corr-mobile-2"
    });

    await amcFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "claude-3-5-sonnet", messages: [] })
    });
    await amcFetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent", {
      method: "POST",
      body: JSON.stringify({ contents: [] })
    });

    expect(urls).toEqual([
      "https://amc.example.com/root/bridge/anthropic/v1/messages",
      "https://amc.example.com/root/bridge/gemini/v1beta/models/gemini-pro:generateContent"
    ]);
  });

  test("blocks self-scoring fields before the mobile request leaves the app", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const amcFetch = createAMCMobileFetchBridge({
      bridgeUrl: "https://amc.example.com",
      agentId: "mobile-agent",
      fetchImpl
    });

    await expect(
      amcFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
          metadata: { maturityScore: 5 }
        })
      })
    ).rejects.toMatchObject({ code: "SELF_SCORING_BLOCKED" });
  });

  test("mobile wrapper stays free of Node-only imports and process env reads", () => {
    const source = readFileSync(join(process.cwd(), "src/sdk/mobileFetch.ts"), "utf8");
    expect(source).not.toContain("node:");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("Buffer.");
  });
});


const aliasArchive = "unused-code/2026-10-01-main/public-identity-aliases";
describe("public SDK and scorecard identity aliases", () => {
  test("React Native name preserves function identity, type and SDK barrel routing", async () => {
    expect(createReactNativeAMCFetch).toBe(createAMCMobileFetchBridge);
    expect(sdkExports.createReactNativeAMCFetch).toBe(createAMCMobileFetchBridge);
    expect(sdkExports.createAMCMobileFetchBridge).toBe(createAMCMobileFetchBridge);
    expect(createReactNativeAMCFetch.name).toBe("createAMCMobileFetchBridge");
    expect(createReactNativeAMCFetch.length).toBe(1);
    expectTypeOf(createReactNativeAMCFetch).toEqualTypeOf<typeof createAMCMobileFetchBridge>();
    const urls: string[] = [];
    const proxy = createReactNativeAMCFetch({
      bridgeUrl: "https://amc.example.invalid", agentId: "alias-fixture",
      fetchImpl: (async (url: RequestInfo | URL) => { urls.push(String(url)); return new Response("owned fixture"); }) as typeof fetch,
    });
    const response = await proxy("https://api.openai.com/v1/chat/completions", { method: "POST", body: JSON.stringify({ messages: [] }) });
    expect(await response.text()).toBe("owned fixture");
    expect(urls).toEqual(["https://amc.example.invalid/bridge/openai/v1/chat/completions"]);
  });
  test("scorecard signature name preserves schema object identity, type and validation", () => {
    expect(orgScorecardSignatureSchema).toBe(orgSignatureSchema);
    expectTypeOf(orgScorecardSignatureSchema).toEqualTypeOf<typeof orgSignatureSchema>();
    const signature = { digestSha256: "a".repeat(64), signature: "owned schema fixture", signedTs: 1_700_000_000_000, signer: "auditor" };
    expect(orgScorecardSignatureSchema.parse(signature)).toEqual(orgSignatureSchema.parse(signature));
    for (const value of [null, {}, { ...signature, digestSha256: "short" }, { ...signature, signedTs: 1.5 }, { ...signature, signer: "owner" }]) {
      const original = orgSignatureSchema.safeParse(value), alias = orgScorecardSignatureSchema.safeParse(value);
      expect(alias.success).toBe(original.success);
      expect(alias.success).toBe(false);
      if (!alias.success && !original.success) expect(alias.error.issues).toEqual(original.error.issues);
    }
  });
  test("keeps every other declaration and public implementation byte-identical", () => {
    const restoration = JSON.parse(readFileSync(join(process.cwd(), aliasArchive, "restoration.json"), "utf8")) as {
      files: Array<{ originalPath: string; archivePath: string; sha256: string }>;
    };
    const aliases = new Set(["createReactNativeAMCFetch", "orgScorecardSignatureSchema"]);
    function unchanged(source: string) {
      const file = ts.createSourceFile("alias.ts", source, ts.ScriptTarget.ES2022, true);
      return file.statements.filter(node => {
        if (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && aliases.has(decl.name.text))) return false;
        if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.every(element => aliases.has(element.name.text))) return false;
        return true;
      }).map(node => node.getText(file)).join("\n");
    }
    for (const row of restoration.files.filter(item => item.originalPath.startsWith("src/"))) {
      const original = readFileSync(join(process.cwd(), row.archivePath), "utf8");
      expect(createHash("sha256").update(original).digest("hex")).toBe(row.sha256);
      expect(unchanged(landedText(row.originalPath))).toBe(unchanged(original));
    }
  });
});
