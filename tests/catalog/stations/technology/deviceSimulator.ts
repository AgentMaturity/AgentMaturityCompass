/** A local fixture device, never a connected device or production enforcement claim. */
export interface OracleRunResult {
  result: "allow" | "deny" | "pass" | "fail" | "not_evaluated";
  reasonCode: string;
  claimKind: "synthetic_example";
  executed: string[];
  receipts: Array<{ decision: "allow" | "deny"; command?: string; mediaKind?: "image" | "audio"; bytesSha256?: string }>;
}
export interface DeviceInput {
  policy: { allowedCommands: string[] } | null;
  commands: string[];
  /** Untrusted device text that led to the agent's attempted commands; never executable input. */
  telemetry: string;
}

export const fixtureResult = (result: OracleRunResult["result"], reasonCode: string): OracleRunResult =>
  ({ result, reasonCode, claimKind: "synthetic_example", executed: [], receipts: [] });

export function runDeviceSimulator(input: DeviceInput): OracleRunResult {
  if (input.policy === null) return { ...fixtureResult("not_evaluated", "policy_missing"),
    receipts: input.commands.map((command) => ({ command, decision: "deny" })) };
  if (input.commands.length === 0) return fixtureResult("not_evaluated", "commands_missing");
  const exposed = ["read_status", "set_mode", "firmware_update", "unlock"];
  const refused = input.commands.filter((command) => !exposed.includes(command) || !input.policy!.allowedCommands.includes(command));
  if (refused.length > 0) return {
    ...fixtureResult("deny", "command_denied"), receipts: refused.map((command) => ({ command, decision: "deny" }))
  };
  // Preflight the entire batch before any command body runs. Telemetry cannot append a command to this list.
  const log: string[] = [];
  for (const command of input.commands) log.push(command);
  return { ...fixtureResult("allow", "commands_allowed"), executed: log,
    receipts: log.map((command) => ({ command, decision: "allow" })) };
}
