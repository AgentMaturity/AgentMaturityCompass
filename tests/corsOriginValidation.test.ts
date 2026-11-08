import { describe, expect, test } from "vitest";
import { loadStudioRuntimeConfig } from "../src/config/loadConfig.js";

// Coordinator section 9 (P2): an AMC_CORS_ALLOWED_ORIGINS entry with a path used to start fine and fail every native
// request with a 500; Studio now refuses to start and names the entry.
describe("AMC_CORS_ALLOWED_ORIGINS validation", () => {
  test("origins pass; a path, query or credentials refuse the configuration by name", () => {
    expect(loadStudioRuntimeConfig({ AMC_CORS_ALLOWED_ORIGINS: "https://studio.example.com,http://localhost:3212" }).corsAllowedOrigins)
      .toEqual(["https://studio.example.com", "http://localhost:3212"]);
    for (const bad of ["https://studio.example.com/app", "https://studio.example.com?x=1", "https://user:pw@studio.example.com", "studio.example.com"]) {
      expect(() => loadStudioRuntimeConfig({ AMC_CORS_ALLOWED_ORIGINS: bad }), bad).toThrow(`AMC_CORS_ALLOWED_ORIGINS takes origins only (scheme://host[:port], no path, query or credentials): ${bad}`);
    }
  });
});
