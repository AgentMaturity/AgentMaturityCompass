import { describe, expect, it } from "vitest";
import { decideNativeShell, type NativeShellDecision, type ShellOptInSource } from "../src/sandbox/nativeShellGate.js";

/**
 * P0-06 decision table. Pure: the platform and the Bubblewrap check are
 * inputs, so every row runs on every host.
 */
const bwrapOk = { ok: true } as const;
const bwrapMissing = { ok: false, reason: "Install a supported system Bubblewrap at /usr/bin/bwrap; AMC does not fall back to an unconfined Linux shell." } as const;
// Non-Linux rows must not depend on the Bubblewrap check; pass a value that would
// be wrong to read.
const notChecked = { ok: false, reason: "not checked" } as const;

const rows: ReadonlyArray<readonly [NodeJS.Platform, typeof bwrapOk | typeof bwrapMissing | typeof notChecked, ShellOptInSource | null, (decision: NativeShellDecision) => void]> = [
  ["linux", bwrapOk, null, decision => expect(decision).toEqual({ kind: "confined", boundary: "linux-bwrap" })],
  ["linux", bwrapOk, "cli-flag", decision => expect(decision).toEqual({ kind: "confined", boundary: "linux-bwrap" })],
  ["linux", bwrapMissing, "cli-flag", decision => {
    expect(decision.kind).toBe("refused");
    if (decision.kind !== "refused") return;
    expect(decision.remediation).toContain("/usr/bin/bwrap");
    expect(decision.remediation).toContain("AMC never falls back to an unconfined Linux shell.");
  }],
  ["darwin", notChecked, null, decision => {
    expect(decision.kind).toBe("refused");
    if (decision.kind !== "refused") return;
    expect(decision.remediation).toContain("--unsafe-unconfined-shell");
  }],
  ["darwin", notChecked, "cli-flag", decision => expect(decision).toEqual({ kind: "unconfined-opt-in", platform: "darwin", source: "cli-flag" })],
  ["darwin", notChecked, "signed-config", decision => expect(decision).toEqual({ kind: "unconfined-opt-in", platform: "darwin", source: "signed-config" })],
  ["win32", notChecked, "cli-flag", decision => expect(decision.kind).toBe("refused")],
  ["freebsd", notChecked, "sdk-option", decision => expect(decision.kind).toBe("refused")]
];

describe("the native shell platform gate", () => {
  it.each(rows)("%s, bwrap %j, opt-in %s", (platform, bwrap, optIn, check) => {
    check(decideNativeShell({ platform, bwrap, optIn }));
  });

  it("uses the exact remediation strings operators are told", () => {
    expect(decideNativeShell({ platform: "darwin", bwrap: notChecked, optIn: null })).toEqual({ kind: "refused", platform: "darwin",
      remediation: "The native shell is refused on macOS: AMC cannot confine it yet (Seatbelt confinement arrives with P1-05). To accept an unconfined shell with your full user rights, pass --unsafe-unconfined-shell or set runtime.shell.allowUnconfined: true in a signed .amc/amc.config.yaml." });
    expect(decideNativeShell({ platform: "linux", bwrap: { ok: false, reason: "Bubblewrap requires Linux." }, optIn: null })).toEqual({ kind: "refused", platform: "linux",
      remediation: "The native shell is refused: Bubblewrap requires Linux. Install Bubblewrap at /usr/bin/bwrap (Debian and Ubuntu: apt install bubblewrap); on Ubuntu 24.04 also follow docs/NATIVE_SANDBOX_UBUNTU.md. AMC never falls back to an unconfined Linux shell." });
    expect(decideNativeShell({ platform: "win32", bwrap: notChecked, optIn: "cli-flag" })).toEqual({ kind: "refused", platform: "win32",
      remediation: "The native shell is not available on Windows. AMC has no confined Windows runner yet; the unsafe flag does not apply on Windows." });
  });
});
