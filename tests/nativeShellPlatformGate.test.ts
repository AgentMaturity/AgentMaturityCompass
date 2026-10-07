import { describe, expect, it } from "vitest";
import { decideNativeShell, type NativeShellDecision, type ShellOptInSource } from "../src/sandbox/nativeShellGate.js";

/**
 * P0-06 and P1-05 decision table. Pure: the platform and the Bubblewrap and
 * Seatbelt checks are inputs, so every row runs on every host.
 */
const bwrapOk = { ok: true } as const;
const bwrapMissing = { ok: false, reason: "Install a supported system Bubblewrap at /usr/bin/bwrap; AMC does not fall back to an unconfined Linux shell." } as const;
const seatbeltOk = { ok: true } as const;
const seatbeltMissing = { ok: false, reason: "/usr/bin/sandbox-exec is missing." } as const;
// Rows must not depend on the other platform's check; pass a value that would
// be wrong to read.
const notChecked = { ok: false, reason: "not checked" } as const;
type Check = typeof bwrapOk | typeof bwrapMissing | typeof seatbeltMissing | typeof notChecked;

const rows: ReadonlyArray<readonly [NodeJS.Platform, Check, Check, ShellOptInSource | null, (decision: NativeShellDecision) => void]> = [
  ["linux", bwrapOk, notChecked, null, decision => expect(decision).toEqual({ kind: "confined", boundary: "linux-bwrap" })],
  ["linux", bwrapOk, notChecked, "cli-flag", decision => expect(decision).toEqual({ kind: "confined", boundary: "linux-bwrap" })],
  ["linux", bwrapMissing, seatbeltOk, "cli-flag", decision => {
    expect(decision.kind).toBe("refused");
    if (decision.kind !== "refused") return;
    expect(decision.remediation).toContain("/usr/bin/bwrap");
    expect(decision.remediation).toContain("AMC never falls back to an unconfined Linux shell.");
  }],
  ["darwin", bwrapOk, seatbeltOk, null, decision => expect(decision).toEqual({ kind: "confined", boundary: "macos-seatbelt" })],
  // An opt-in never replaces an available boundary.
  ["darwin", notChecked, seatbeltOk, "cli-flag", decision => expect(decision).toEqual({ kind: "confined", boundary: "macos-seatbelt" })],
  ["darwin", notChecked, seatbeltMissing, null, decision => {
    expect(decision.kind).toBe("refused");
    if (decision.kind !== "refused") return;
    expect(decision.remediation).toContain("--unsafe-unconfined-shell");
  }],
  ["darwin", notChecked, seatbeltMissing, "cli-flag", decision => expect(decision).toEqual({ kind: "unconfined-opt-in", platform: "darwin", source: "cli-flag" })],
  ["darwin", notChecked, seatbeltMissing, "sdk-option", decision => expect(decision).toEqual({ kind: "unconfined-opt-in", platform: "darwin", source: "sdk-option" })],
  ["win32", bwrapOk, seatbeltOk, "cli-flag", decision => expect(decision.kind).toBe("refused")],
  ["freebsd", bwrapOk, seatbeltOk, "sdk-option", decision => expect(decision.kind).toBe("refused")]
];

describe("the native shell platform gate", () => {
  it.each(rows)("%s, bwrap %j, seatbelt %j, opt-in %s", (platform, bwrap, seatbelt, optIn, check) => {
    check(decideNativeShell({ platform, bwrap, seatbelt, optIn }));
  });

  it("uses the exact remediation strings operators are told", () => {
    expect(decideNativeShell({ platform: "darwin", bwrap: notChecked, seatbelt: seatbeltMissing, optIn: null })).toEqual({ kind: "refused", platform: "darwin",
      remediation: "The native shell is refused on macOS: /usr/bin/sandbox-exec is missing, so AMC cannot confine it with Seatbelt. To accept an unconfined shell with your full user rights, pass --unsafe-unconfined-shell (Studio: start it with AMC_UNSAFE_UNCONFINED_SHELL=1)." });
    expect(decideNativeShell({ platform: "linux", bwrap: { ok: false, reason: "Bubblewrap requires Linux." }, seatbelt: notChecked, optIn: null })).toEqual({ kind: "refused", platform: "linux",
      remediation: "The native shell is refused: Bubblewrap requires Linux. Install Bubblewrap at /usr/bin/bwrap (Debian and Ubuntu: apt install bubblewrap); on Ubuntu 24.04 also follow docs/NATIVE_SANDBOX_UBUNTU.md. AMC never falls back to an unconfined Linux shell." });
    expect(decideNativeShell({ platform: "win32", bwrap: notChecked, seatbelt: notChecked, optIn: "cli-flag" })).toEqual({ kind: "refused", platform: "win32",
      remediation: "The native shell is not available on Windows. AMC has no confined Windows runner yet; the unsafe flag does not apply on Windows." });
  });
});
