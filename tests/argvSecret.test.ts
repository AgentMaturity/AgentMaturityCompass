import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveSecretOption, warnInlineSecret, watchApiKey } from "../src/cli/argvSecret.js";

/** LIVE-VAULT-14: secrets come from a file or the environment before the command line, and an inline secret is warned about. */
afterEach(() => vi.restoreAllMocks());
const files = (map: Record<string, string>) => (path: string) => { if (!(path in map)) throw new Error(`no such file ${path}`); return map[path]!; };
const WARNING = { option: "--api-key", alternatives: "--api-key-file <path> or AMC_WATCH_API_KEY" };

describe("resolveSecretOption", () => {
  test("the file wins (trimmed), then the environment, then the inline value; nothing is null", () => {
    const read = files({ "/run/secret": "  from-file\n" });
    expect(resolveSecretOption({ inline: "inline", file: "/run/secret" }, "AMC_WATCH_API_KEY", undefined, { AMC_WATCH_API_KEY: "from-env" }, read)).toBe("from-file");
    expect(resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", undefined, { AMC_WATCH_API_KEY: "from-env" }, read)).toBe("from-env");
    expect(resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", undefined, { AMC_WATCH_API_KEY: "" }, read)).toBe("inline");
    expect(resolveSecretOption({ inline: "inline" }, null, undefined, { AMC_WATCH_API_KEY: "from-env" }, read)).toBe("inline");
    expect(resolveSecretOption({}, "AMC_WATCH_API_KEY", undefined, {}, read)).toBeNull();
    expect(() => resolveSecretOption({ file: "/run/empty" }, null, undefined, {}, files({ "/run/empty": " \n" }))).toThrow("/run/empty is empty");
  });

  test("warns once on stderr only when the inline value is the one used", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    resolveSecretOption({ inline: "inline", file: "/run/secret" }, "AMC_WATCH_API_KEY", WARNING, {}, files({ "/run/secret": "f" }));
    resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", WARNING, { AMC_WATCH_API_KEY: "e" });
    expect(stderr).not.toHaveBeenCalled();
    resolveSecretOption({ inline: "inline" }, "AMC_WATCH_API_KEY", WARNING, {});
    expect(stderr.mock.calls.map((call) => String(call[0]))).toEqual([
      "Warning: --api-key is visible to every process on this machine (ps); use --api-key-file <path> or AMC_WATCH_API_KEY.\n"
    ]);
  });

  test("warnInlineSecret writes the one line; watchApiKey reads AMC_WATCH_API_KEY", () => {
    const lines: string[] = [];
    warnInlineSecret("--token", "--token-file <path>", (line) => lines.push(line));
    expect(lines).toEqual(["Warning: --token is visible to every process on this machine (ps); use --token-file <path>.\n"]);
    vi.stubEnv("AMC_WATCH_API_KEY", "env-key");
    expect(watchApiKey({ apiKey: "inline-key" })).toBe("env-key");
    vi.unstubAllEnvs();
  });
});
