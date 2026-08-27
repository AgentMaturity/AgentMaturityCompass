import { mkdtempSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeMcpSecurity } from "../src/shield/mcpSecurityAnalyzer.js";

/**
 * The score must not be buyable with vocabulary.
 *
 * `analyzeMcpSecurity` awards +5 auth, +10 sandbox, +5 rate-limiting and +5
 * logging when the manifest merely HAS a key of that name with a truthy value.
 * It never reads what the value says. Measured before fixing: an untrusted
 * `npx -y untrusted@latest` server scored 66/100 L3 ACCEPTABLE, and the same
 * server with `auth`, `sandbox`, `rateLimit` and `logging` all set to the string
 * "none" scored 100/100 L5 SECURE -- the top grade, awarded for four fields
 * that state the protections are absent.
 *
 * This matters beyond the report. P6.2 proposes gating MCP mounts on this score,
 * and a gate that grants the highest trust to a manifest declaring it has no
 * auth and no sandbox would be worse than no gate at all.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const SERVER = { mcpServers: { evil: { command: "npx", args: ["-y", "untrusted@latest"] } } };

function manifest(extra: Record<string, unknown>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-mcp-score-")));
  dirs.push(dir);
  const path = join(dir, "mcp.json");
  writeFileSync(path, JSON.stringify({ ...SERVER, ...extra }), "utf8");
  return path;
}

describe("security points are not awarded for saying the word", () => {
  it("does not raise the score for fields whose values deny the property", () => {
    const bare = analyzeMcpSecurity(manifest({}));
    const claimsNone = analyzeMcpSecurity(manifest({
      auth: "none", sandbox: "none", rateLimit: "none", logging: "none"
    }));

    expect(claimsNone.securityScore, "\"none\" is not a configuration").toBe(bare.securityScore);
    expect(claimsNone.securityLevel).toBe(bare.securityLevel);
  });

  it("does not raise it for an empty object either", () => {
    // The other shape of the same trick: a key that exists and configures
    // nothing.
    const bare = analyzeMcpSecurity(manifest({}));
    const empty = analyzeMcpSecurity(manifest({ auth: {}, sandbox: {}, rateLimit: {}, logging: {} }));

    expect(empty.securityScore).toBe(bare.securityScore);
  });

  it("still credits a manifest that actually configures them", () => {
    // The bonus is not deleted -- a real configuration is real evidence, and
    // removing the credit entirely would push honest servers toward the same
    // grade as hostile ones.
    const bare = analyzeMcpSecurity(manifest({}));
    const configured = analyzeMcpSecurity(manifest({
      auth: { type: "oauth2", issuer: "https://issuer.example" },
      sandbox: { mode: "container", image: "node:20-alpine" }
    }));

    expect(configured.securityScore).toBeGreaterThan(bare.securityScore);
  });
});
