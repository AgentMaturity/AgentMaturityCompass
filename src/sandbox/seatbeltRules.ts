/**
 * Seatbelt rules shared by the generic profile (seatbeltBackend.ts) and the native shell profile
 * (seatbeltNativeShell.ts). Measured on macOS 26.6.2 with /bin/sh, git, node and curl.
 */

/** The only Mach services the shell may look up: temp-dir helper, logging, notifications, user and group lookups. */
const MACOS_MACH_SERVICES = ["com.apple.bsd.dirhelper", "com.apple.logd", "com.apple.system.notification_center",
  "com.apple.system.opendirectoryd.libinfo", "com.apple.system.opendirectoryd.membership"] as const;

/** Launchers denied by path as well, in case a later macOS reaches them without a Mach lookup. */
const LAUNCHERS = ["/usr/bin/open", "/usr/bin/osascript", "/bin/launchctl", "/usr/bin/at"] as const;

/** All networking denied, Unix sockets included (so DNS through mDNSResponder too); with a proxy, only its localhost port. */
export function seatbeltNetworkRules(proxyPort: number | null): string[] {
  return ["(deny network*)", ...(proxyPort === null ? [] : [`(allow network-outbound (remote ip "localhost:${proxyPort}"))`])];
}

/** Rules that stop a command asking launchd, LaunchServices, another app or an XPC service to act (or fetch) for it. */
export const SEATBELT_NO_OUTSIDE_HELPERS: readonly string[] = [
  ";; Nothing may ask launchd, LaunchServices or another app to start a process outside this profile.",
  "(deny mach-lookup)",
  `(allow mach-lookup (global-name ${MACOS_MACH_SERVICES.map(name => `"${name}"`).join(" ")}))`,
  "(deny lsopen)",
  "(deny appleevent-send)",
  "(deny job-creation)",
  `(deny process-exec ${LAUNCHERS.map(path => `(literal "${path}")`).join(" ")})`
];

