import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadStudioRuntimeConfig } from "../src/config/loadConfig.js";

describe("studio runtime workspace default is local-first", () => {
  test("defaults to the current working directory when AMC_WORKSPACE_DIR is unset", () => {
    const runtime = loadStudioRuntimeConfig({} as NodeJS.ProcessEnv);
    expect(runtime.workspaceDir).toBe(resolve(process.cwd()));
  });

  test("honors AMC_WORKSPACE_DIR when set (container/deployment mode)", () => {
    const runtime = loadStudioRuntimeConfig({ AMC_WORKSPACE_DIR: "/data/amc" } as NodeJS.ProcessEnv);
    expect(runtime.workspaceDir).toBe(resolve("/data/amc"));
  });

  test("explicit override wins over environment", () => {
    const runtime = loadStudioRuntimeConfig(
      { AMC_WORKSPACE_DIR: "/data/amc" } as NodeJS.ProcessEnv,
      { workspaceDir: "/tmp/amc-explicit" }
    );
    expect(runtime.workspaceDir).toBe("/tmp/amc-explicit");
  });
});
