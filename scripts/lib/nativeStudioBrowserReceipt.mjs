/** Public scenario names are shared by the browser driver and its receipt. */
export const NATIVE_STUDIO_SCENARIOS = Object.freeze([
  "owner-login-and-missing-credential",
  "rendered-layout-keyboard-and-home-handoff",
  "selected-agent-committed-task-and-follow-up",
  "release-reload-explicit-resume",
  "lost-create-acknowledgement-never-replayed",
  "unreceived-create-explicit-identical-retry",
  "unreceived-turn-explicit-identical-retry",
  "real-pending-approval-link-and-denial",
  "cancel-actual-turn-waiting-for-approval",
  "browser-verification-control-reports-actual-verdict",
  "explicit-closed-task-archive-retains-inspection",
  "native-write-browser-proof-and-agent-binding",
  "demo-stub-only-and-approval-refusal"
]);

/** Success requires exactly one passing result for every declared scenario. */
export function nativeStudioBrowserReceiptPassed({ planned, checks, cleanup, notes }) {
  return planned.length > 0 && new Set(planned).size === planned.length &&
    checks.length === planned.length &&
    planned.every(name => checks.filter(check => check.name === name && check.status === "passed").length === 1) &&
    cleanup.some(item => item.resource === "owned browser" && item.ok === true) &&
    cleanup.every(item => item.ok === true) &&
    !notes.some(note => note.kind === "page-error" || note.kind === "run-stopped");
}
