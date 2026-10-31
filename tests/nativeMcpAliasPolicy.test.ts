import { describe, expect, test } from "vitest";
import { nativeMcpToolName, validateNativeMcpToolAliases, type NativeMcpGrant } from "../src/mcp/nativeMcpClient.js";

const grant = (alias: unknown): NativeMcpGrant => ({ name: "remote.lookup", actionClass: "READ_ONLY", alias: alias as string });

describe("operator MCP alias policy", () => {
  test.each([null, 12, "", "a".repeat(65), "space name", "line\nname", "fs.read", "amc_reserved"])("refuses malformed alias %j", alias => {
    expect(() => validateNativeMcpToolAliases([grant(alias)], [])).toThrow(/alias/);
  });
  test.each(["run_code", "tool_search", "delegate", "workflow", "bash", "grep", "get_goal"])("reserves native capability %s even when hidden", alias => {
    expect(() => validateNativeMcpToolAliases([grant(alias)], [])).toThrow(/alias/);
  });
  test("refuses duplicate aliases and collisions with any reviewed canonical identity", () => {
    expect(() => validateNativeMcpToolAliases([grant("same"), { ...grant("same"), name: "other" }], [])).toThrow(/alias/);
    const canonical = nativeMcpToolName("second", "other");
    expect(() => validateNativeMcpToolAliases([grant(canonical)], [canonical])).toThrow(/alias/);
  });
  test("accepts absent aliases and distinct bounded provider names without rewriting them", () => {
    const grants: NativeMcpGrant[] = [{ name: "first", actionClass: "READ_ONLY" }, grant("mcp_fixture_lookup"),
      { name: "third", actionClass: "WRITE_LOW", alias: "a".repeat(64) }];
    const before = structuredClone(grants);
    expect(() => validateNativeMcpToolAliases(grants, ["unrelated"])).not.toThrow();
    expect(grants).toEqual(before);
  });
});
