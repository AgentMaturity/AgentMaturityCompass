import { z } from "zod";

/** Synthetic local protocols only; these schemas establish no production authority or enforcement. */
export const identifier = z.string().min(1).max(512).refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value));
export const utcTime = z.iso.datetime().regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
export const bindingSchema = z.object({ tenantId: identifier, workspaceId: identifier, deploymentId: identifier,
  agentId: identifier, controlId: z.string().regex(/^L1-EDU-0[1-4]$/), controlVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict();
export type Binding = z.infer<typeof bindingSchema>;
export const contextFor = (controlId: string) => bindingSchema.refine(value => value.controlId === controlId);

export function sameBinding(expected: Binding, actual: Binding): boolean {
  return expected.tenantId === actual.tenantId && expected.workspaceId === actual.workspaceId
    && expected.deploymentId === actual.deploymentId && expected.agentId === actual.agentId
    && expected.controlId === actual.controlId && expected.controlVersion === actual.controlVersion
    && expected.planDigest === actual.planDigest;
}

export const endpoint = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === "" && url.href === value;
  } catch { return false; }
});
export interface OracleOutcome {
  result: "allow" | "deny" | "pass" | "fail" | "not_evaluated";
  reasonCode: string;
  claimKind: "synthetic_example";
  effects: string[];
  refusals: string[];
  observations: Record<string, unknown>;
}
export function outcome(result: OracleOutcome["result"], reasonCode: string, observations: Record<string, unknown> = {}, effects: string[] = []): OracleOutcome {
  const positive = result === "allow" || result === "pass";
  return { result, reasonCode, claimKind: "synthetic_example", effects: positive ? effects : [], refusals: positive ? [] : [reasonCode], observations };
}
export const invalidInput = () => outcome("not_evaluated", "invalid_fixture_input");
