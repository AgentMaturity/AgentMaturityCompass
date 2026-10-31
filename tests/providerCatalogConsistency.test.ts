import { describe, expect, it } from "vitest";
import { discoverNativeProviders, nativeRouteFor } from "../src/cli-agent-options.js";
import { credentialRefName } from "../src/credentials/credentialRef.js";
import { defaultModelTaxonomy } from "../src/bridge/modelTaxonomy.js";
import { lookupProviderCatalog } from "../src/llm/providerCatalog.js";
import { listModelMetadata } from "../src/llm/modelCatalog.js";
import { getProviderTemplateById, listProviderTemplates } from "../src/providers/providerTemplates.js";

describe("provider endpoint and credential metadata share gateway templates", () => {
  it.each([
    ["openai", "openai"], ["openai-responses", "openai"], ["anthropic", "anthropic"],
    ["deepseek", "deepseek"], ["gemini", "gemini"], ["gemini-audio", "gemini"]
  ])("native %s defaults use template %s", (providerId, templateId) => {
    const template = getProviderTemplateById(templateId);
    const metadata = lookupProviderCatalog(providerId);
    const route = nativeRouteFor(providerId, {}, "operator-selected-model");
    expect(metadata?.templateId).toBe(templateId);
    expect(route.baseUrl).toBe(template.defaultBaseUrl);
    expect(credentialRefName(route.credentialRef!)).toBe(template.defaultAuthEnv);
    expect(metadata?.defaultBaseUrl).toBe(route.baseUrl);
    expect(metadata?.defaultCredentialRef).toBe(template.defaultAuthEnv);
  });

  it("preserves the existing native Gemini and DeepSeek endpoint defaults", () => {
    expect(getProviderTemplateById("gemini").defaultBaseUrl).toBe("https://generativelanguage.googleapis.com");
    expect(getProviderTemplateById("deepseek").defaultBaseUrl).toBe("https://api.deepseek.com");
  });

  it.each([["xai", "xai_grok"], ["local", "local_openai"], ["google", "gemini"]])(
    "maps the explicit %s provider alias to %s", (providerId, templateId) => {
      expect(lookupProviderCatalog(providerId)?.templateId).toBe(templateId);
    }
  );

  it("maps every default bridge taxonomy provider to an existing template without changing policy", () => {
    const templateIds = new Set(listProviderTemplates().map(template => template.id));
    for (const provider of defaultModelTaxonomy().taxonomy.providers) {
      const metadata = lookupProviderCatalog(provider.provider);
      expect(metadata).not.toBeNull();
      expect(templateIds.has(metadata!.templateId)).toBe(true);
    }
  });

  it.each(["not-a-provider", "__proto__", "constructor", "toString"])("refuses unknown provider %s without fallback", providerId => {
    expect(lookupProviderCatalog(providerId)).toBeNull();
    expect(() => nativeRouteFor(providerId, {}, "operator-selected-model")).toThrow(/unknown provider/);
  });

  it("leaves unconfigured template endpoints unknown and unauthenticated local defaults without a credential", () => {
    expect(lookupProviderCatalog("xai")?.defaultBaseUrl).toBeNull();
    expect(lookupProviderCatalog("local")?.defaultCredentialRef).toBeNull();
  });

  it("preserves explicit native overrides and the separate Ollama and stub routes", () => {
    const route = nativeRouteFor("openai", { baseUrl: "https://operator.example", credential: "OPERATOR_KEY" }, "custom-model");
    expect(route.baseUrl).toBe("https://operator.example");
    expect(credentialRefName(route.credentialRef!)).toBe("OPERATOR_KEY");
    expect(nativeRouteFor("ollama", {}, "local-model").credentialRef).toBeNull();
    expect(nativeRouteFor("stub", {}, undefined).providerId).toBe("stub");
  });

  it("reports reviewed catalog assertions separately from model discovery and availability", () => {
    const discovery = discoverNativeProviders("openai");
    const provider = discovery.providers[0]!;
    expect(discovery.modelDiscovery).toBe("not-performed");
    expect(discovery.credentialsChecked).toBe(false);
    expect(discovery.measurement).toBe("not-performed");
    expect(provider.models).toBeNull();
    expect(provider.capabilities?.modelSupport).toBe("not-probed");
    expect(provider.reviewedCatalog).toEqual(listModelMetadata("openai", provider.capabilities!.protocol));
    expect(provider.reviewedCatalog!.length).toBeGreaterThan(0);
    expect(provider.reviewedCatalog!.every(model => model.modelSupport === "catalog-not-probed")).toBe(true);
  });
});
