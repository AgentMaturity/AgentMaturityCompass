import { describe, expect, it } from "vitest";
import { detectFramework } from "../src/guide/guideGenerator.js";

/** Only the named files exist; `contents` answers reads. */
function project(contents: Record<string, string>, extraFiles: string[] = []) {
  const files = new Set([...Object.keys(contents), ...extraFiles]);
  return [(path: string) => files.has(path), (path: string) => contents[path] ?? null] as const;
}

describe("detectFramework: which project file names which framework", () => {
  it.each([
    ["CLAUDE.md", "claudecode"],
    ["AGENTS.md", "claudecode"],
    [".cursorrules", "cursor"],
    [".cursor/rules", "cursor"],
    [".kiro/steering/guide.md", "kiro"],
    [".gemini/style.md", "gemini"]
  ])("the config file %s names %s with high confidence", (file, name) => {
    const [exists, read] = project({}, [file]);
    expect(detectFramework(exists, read)).toMatchObject({ name, confidence: "high" });
  });

  it("an agent config file wins over dependency files", () => {
    const [exists, read] = project({ "pyproject.toml": "crewai" }, ["CLAUDE.md"]);
    expect(detectFramework(exists, read)?.name).toBe("claudecode");
  });

  it.each([
    ["langchain = \"^0.1\"", "langchain", "high"],
    ["crewai = \"^0.28\"", "crewai", "high"],
    ["autogen = \"*\"", "autogen", "high"],
    ["ag2 = \"*\"", "autogen", "high"],
    ["llama-index = \"*\"", "llamaindex", "high"],
    ["llama_index = \"*\"", "llamaindex", "high"],
    ["openai = \"^1\"", "openai", "medium"]
  ])("pyproject.toml with %s names %s (%s)", (body, name, confidence) => {
    const [exists, read] = project({ "pyproject.toml": `[tool.poetry.dependencies]\n${body}` });
    expect(detectFramework(exists, read)).toEqual({ name, confidence, detectedFrom: "pyproject.toml" });
  });

  it("a pyproject.toml naming no known framework falls through to requirements.txt", () => {
    const [exists, read] = project({ "pyproject.toml": "requests = \"*\"", "requirements.txt": "autogen==0.2" });
    expect(detectFramework(exists, read)).toEqual({ name: "autogen", confidence: "high", detectedFrom: "requirements.txt" });
  });

  it.each([
    ["langchain==0.1", "langchain"],
    ["crewai>=0.28", "crewai"],
    ["ag2", "autogen"],
    ["llama-index", "llamaindex"],
    ["llama_index", "llamaindex"]
  ])("requirements.txt with %s names %s", (body, name) => {
    const [exists, read] = project({ "requirements.txt": body });
    expect(detectFramework(exists, read)).toEqual({ name, confidence: "high", detectedFrom: "requirements.txt" });
  });

  it("requirements.txt with only openai names nothing (no openai rule there)", () => {
    const [exists, read] = project({ "requirements.txt": "openai>=1" });
    expect(detectFramework(exists, read)).toBeNull();
  });

  it("package.json naming langchain is medium confidence", () => {
    const [exists, read] = project({ "package.json": "{\"dependencies\":{\"langchain\":\"0.1\"}}" });
    expect(detectFramework(exists, read)).toEqual({ name: "langchain", confidence: "medium", detectedFrom: "package.json" });
  });

  it("package.json with unrelated dependencies names nothing", () => {
    const [exists, read] = project({ "package.json": "{\"dependencies\":{\"express\":\"4\"}}" });
    expect(detectFramework(exists, read)).toBeNull();
  });

  it("a .csproj referencing Microsoft.SemanticKernel names semantickernel", () => {
    const [exists, read] = project({ "*.csproj": "<PackageReference Include=\"Microsoft.SemanticKernel\" />" });
    expect(detectFramework(exists, read)).toEqual({ name: "semantickernel", confidence: "high", detectedFrom: "*.csproj" });
  });

  it("a .csproj without Semantic Kernel names nothing", () => {
    const [exists, read] = project({ "*.csproj": "<PackageReference Include=\"Newtonsoft.Json\" />" });
    expect(detectFramework(exists, read)).toBeNull();
  });

  it("without a file reader only config files are checked", () => {
    expect(detectFramework(path => path === "requirements.txt")).toBeNull();
  });
});
