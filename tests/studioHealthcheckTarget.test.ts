import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { studioProbeBase, writeStudioState } from "../src/studio/studioState.js";

// Coordinator section 9 (P2): `amc studio healthcheck` probes where the running Studio is bound (state.json), not the
// configured port, which a default-port fallback or the signed LAN port leaves behind.
const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-probe-target-"));
  roots.push(dir);
  return dir;
}

const state = (host: string, apiPort: number) => ({ pid: 1, startedTs: 0, apiPort, gatewayPort: 0, proxyPort: 0, dashboardPort: 0, host,
  currentAgent: "default", vaultUnlocked: true, untrustedConfig: false, logFile: "studio.log" });

describe("healthcheck probe target", () => {
  test("the bound address from state.json wins; wildcard binds probe loopback; IPv6 is bracketed", () => {
    const dir = workspace();
    expect(studioProbeBase(dir, { host: "127.0.0.1", port: 3212 })).toBe("http://127.0.0.1:3212");
    writeStudioState(dir, state("127.0.0.1", 47391));
    expect(studioProbeBase(dir, { host: "127.0.0.1", port: 3212 })).toBe("http://127.0.0.1:47391");
    writeStudioState(dir, state("0.0.0.0", 47392));
    expect(studioProbeBase(dir, { host: "127.0.0.1", port: 3212 })).toBe("http://127.0.0.1:47392");
    writeStudioState(dir, state("::1", 47393));
    expect(studioProbeBase(dir, { host: "127.0.0.1", port: 3212 })).toBe("http://[::1]:47393");
  });
});
