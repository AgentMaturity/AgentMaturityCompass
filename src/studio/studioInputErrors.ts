/**
 * C-08: refusals about what the caller sent that some routes throw as plain Errors deep inside (an advisory, plugin,
 * registry or org role that does not exist, a file that is not there). They answer 404 or 400 with words a person can
 * act on, instead of "internal server error". Only these known messages are mapped; anything else stays a 500.
 */
const NOT_FOUND = /^(?:advisory not found|plugin is not installed|registry not configured in workspace)\b/i;
const BAD_INPUT = /^(?:Unknown org role\(s\))/i;
const SAID_PLAINLY = /^Username must be /;

export function studioInputError(pathname: string, error: unknown): { status: 400 | 404; body: { error: string; code: string } } | null {
  const message = error instanceof Error ? error.message : String(error);
  if (NOT_FOUND.test(message)) return { status: 404, body: { error: message, code: "NOT_FOUND" } };
  if (SAID_PLAINLY.test(message)) return { status: 400, body: { error: message, code: "BAD_INPUT" } };
  if (BAD_INPUT.test(message)) return { status: 400, body: { error: `${message}. Pick roles from the list.`, code: "BAD_INPUT" } };
  // A file the caller named that is not there: say so without the server's full path.
  if (pathname === "/bench/publish" && (error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
    return { status: 400, body: { error: "That file was not found in the workspace. Check the path and try again.", code: "FILE_NOT_FOUND" } };
  }
  return null;
}

/** C-04: a run that needs a real agent to test, when none is set up, is a state the person can fix, not a server fault. */
export function studioSetupError(error: unknown): { status: 409; body: { error: string; code: string } } | null {
  const candidate = error as { code?: unknown; reason?: unknown; remediation?: unknown } | null;
  if (candidate?.code !== "AGENT_RESPONDER_UNAVAILABLE" || typeof candidate.reason !== "string") return null;
  const fix = typeof candidate.remediation === "string" ? ` ${candidate.remediation}` : "";
  return { status: 409, body: { error: `Assurance needs a real agent to test, and none is set up: ${candidate.reason}.${fix}`, code: "AGENT_RESPONDER_UNAVAILABLE" } };
}
