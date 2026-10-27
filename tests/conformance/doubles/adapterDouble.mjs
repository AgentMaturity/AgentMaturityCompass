#!/usr/bin/env node
/**
 * P1-32 test double: `adapterDouble.mjs <mode> <hookPayload> <policy>` prints a decision and a receipt for one hook
 * payload. `honest` follows the policy and, in observation-only mode, allows and claims only observation;
 * `observer-claims-enforced` claims enforcement at the hook even in observation-only mode.
 */
import { readFileSync } from "node:fs";

const [mode, payloadPath, policyPath] = process.argv.slice(2);
const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const ruled = policy.rules.find(rule => rule.tool === payload.tool_name)?.decision ?? policy.default;
const observing = policy.mode === "observe";
const enforced = { level: "enforced", boundary: `hook:${payload.hook_event_name}` };
const enforcement = observing && mode !== "observer-claims-enforced" ? { level: "observed" } : enforced;
process.stdout.write(JSON.stringify({ decision: observing ? "allow" : ruled, receipt: { enforcement } }));
