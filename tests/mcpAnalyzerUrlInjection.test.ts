import { existsSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeMcpSecurity } from "../src/shield/mcpSecurityAnalyzer.js";

/**
 * The URL a caller hands the analyzer must never reach a shell.
 *
 * `loadContent` fetched an http(s) argument by building a `curl` command STRING
 * and running it through `execSync`, quoting the URL with `JSON.stringify`. That
 * produces DOUBLE quotes, and `sh` expands `$(...)` and backticks inside double
 * quotes -- so the quoting looked like escaping and was not.
 *
 * The reachable shape is the one P6.2 would have created: gating an MCP mount
 * means analysing a server a caller names, and a server URL is exactly the
 * untrusted string that would arrive there.
 */
const MARKER = "/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/c5c61ae5-1f16-447b-bd19-a171b760d0cc/scratchpad/injection-marker.txt";

describe("the analyzer does not hand a URL to a shell", () => {
  it("does not execute a subshell embedded in the URL", () => {
    rmSync(MARKER, { force: true });
    // SPACE-FREE on purpose. `new URL()` percent-encodes a literal space, so
    // a payload written as `$(touch /path)` is defused by the URL parse alone --
    // and an earlier version of this test passed even with the shell RESTORED,
    // proving the parse rather than the fix. `$IFS` is the shell's own field
    // separator: it survives URL parsing intact and expands to a space, so this
    // now isolates whether a shell sees the string at all.
    const hostile = `https://example.invalid/$(touch$IFS${MARKER})`;

    try {
      analyzeMcpSecurity(hostile);
    } catch {
      // A fetch failure is fine and expected. What must not happen is the
      // subshell running on the way to that failure.
    }

    expect(existsSync(MARKER), "the embedded command must not have run").toBe(false);
  });
});
