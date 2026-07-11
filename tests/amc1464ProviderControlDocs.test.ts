import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const DOC = "docs/source-reviews/AMC-1464-provider-native-signed-control-responses.md";

describe("AMC-1464 provider control public boundary", () => {
  test("documents primary-source pins, eight-surface relevance, fail-closed behavior, and no-bloat limits", () => {
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toContain("AMC-1464");
    expect(doc).toContain("e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1");
    expect(doc).toContain("f354eebaf43b25bacb176007e449bb9a638fd101");
    expect(doc).toContain("2583cff9380f8f0a459d52c7112b6105c46496ed");
    expect(doc).toContain("83188b62c63e2b4ff9ada87048fd99605184ee5a");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
    expect(doc).toContain("not proof that AMC approval quorum was met");
    expect(doc).toContain("No second policy engine");
  });

  test("publishes explicit observe and loopback control setup without claiming provider parity", () => {
    for (const path of ["README.md", "docs/GETTING_STARTED.md", "docs/QUICKSTART.md", "docs/SDK.md", "website/docs/adapters.html"]) {
      const body = readFileSync(path, "utf8");
      expect(body).toContain("--mode control");
      expect(body).toMatch(/loopback/i);
      expect(body).toMatch(/Gemini CLI.*ask|ask.*Gemini CLI/i);
    }
    const openApi = readFileSync("website/openapi.yaml", "utf8");
    expect(openApi).toContain("/bridge/hooks/control/v1:");
    expect(openApi).toContain("hook:control");
    const inventory = readFileSync("docs/CLI_COMMAND_INVENTORY.md", "utf8");
    expect(inventory).toContain("`--mode <mode>`");
  });

  test("keeps competitor identifiers and source URLs out of the generic control implementation", () => {
    const implementation = [
      "src/bridge/hookControl.ts",
      "src/adapters/hookIntegration.ts",
      "src/toolhub/toolhubValidators.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(implementation).not.toContain("agentcontrol.dev");
    expect(implementation).not.toContain("agentapprove.com");
    expect(implementation).not.toContain("agentcontrol/agent-control");
    expect(implementation).not.toContain("agentapprove/agent-event-protocol");
  });
});
