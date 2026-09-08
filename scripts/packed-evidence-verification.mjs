/** Qualify installed evidence from structured verifier results, never display text. */
function parsed(result) {
  if (!result?.ok) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

const empty = (value) => Array.isArray(value) && value.length === 0;
const positiveCount = (value) => Number.isSafeInteger(value) && value > 0;

export function verifyPackedRun({ summary, runCommand, requireTool = true }) {
  if (!summary || typeof summary.sessionId !== "string" || !summary.sessionId.trim()
      || summary.driverStatus !== "idle" || summary.unsignedRows !== 0
      || !positiveCount(summary.events) || summary.turns !== 1
      || !positiveCount(summary.requests)
      || (requireTool && !positiveCount(summary.toolCalls))
      || !Array.isArray(summary.endings) || summary.endings.length !== 1
      || summary.endings[0]?.turn !== 1 || summary.endings[0]?.reason !== "complete"
      || summary.endings[0].interrupted !== false) return false;

  // Separate CLI processes exercise cold credential access in the installed artifact.
  const ledger = parsed(runCommand("amc session verify --json", ["session", "verify", "--json"]));
  if (ledger?.ok !== true || ledger.chain?.ok !== true || !empty(ledger.errors)
      || !Array.isArray(ledger.sessions?.closed)
      || !ledger.sessions.closed.includes(summary.sessionId)) return false;

  const run = parsed(runCommand("amc agent-loop verify --json", ["agent-loop", "verify", summary.sessionId, "--json"]));
  return run?.ok === true && run.sessionId === summary.sessionId && run.ledgerOk === true
    && empty(run.ledgerErrors) && empty(run.sessionChainErrors) && empty(run.unsignedRowIds)
    && Array.isArray(run.requests) && run.requests.length === summary.requests
    && run.requests.every((request) => request?.status === "reconstructed"
      && typeof request.headerEventId === "string" && request.headerEventId.trim().length > 0)
    && new Set(run.requests.map((request) => request.headerEventId)).size === run.requests.length;
}
