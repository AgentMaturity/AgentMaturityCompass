import { z } from "zod";

/** Local synthetic protocol only. These schemas do not establish a production enforcement point. */
export const identifier = z.string().min(1).max(512).refine(value => value === value.trim());
export const utcTime = z.iso.datetime().regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
export const bindingSchema = z.object({ tenantId: identifier, workspaceId: identifier, agentId: identifier,
  deploymentId: identifier, controlId: z.string().regex(/^L1-GOV-0[1-6]$/), controlVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict();
export type Binding = z.infer<typeof bindingSchema>;
export const contextFor = (controlId: Binding["controlId"]) => bindingSchema.refine(value => value.controlId === controlId);

/** Exact equality, including the compiled-plan identity; a sibling record cannot vouch for this context. */
export function sameBinding(expected: Binding, actual: Binding): boolean {
  return expected.tenantId === actual.tenantId && expected.workspaceId === actual.workspaceId
    && expected.agentId === actual.agentId && expected.deploymentId === actual.deploymentId
    && expected.controlId === actual.controlId && expected.controlVersion === actual.controlVersion
    && expected.planDigest === actual.planDigest;
}

export const endpoint = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === ""
      && url.href === value;
  } catch { return false; }
});
export interface Capture { endpoint: string; purpose: string; body: string }
export interface OracleOutcome {
  result: "allow" | "deny" | "pass" | "fail" | "not_evaluated";
  reasonCode: string;
  claimKind: "synthetic_example";
  effects: string[];
  captures: Capture[];
  refusals: string[];
}
export function outcome(result: OracleOutcome["result"], reasonCode: string, effects: string[] = [], captures: Capture[] = []): OracleOutcome {
  const positive = result === "allow" || result === "pass";
  return { result, reasonCode, claimKind: "synthetic_example", effects: positive ? effects : [], captures: positive ? captures : [],
    refusals: positive ? [] : [reasonCode] };
}
export const invalidInput = () => outcome("not_evaluated", "invalid_fixture_input");
