/**
 * The OSCAL loss report (P1-28): every AMC field the export could not carry in a native OSCAL field, with how it was
 * carried instead ("prop": an AMC-namespaced prop or part, "remarks", or "omitted") and how many values it covers.
 */
import { OSCAL_VERSION } from "./oscalIds.js";

export type OscalModel = "catalog" | "profile" | "assessment-results";
export type LossDisposition = "prop" | "remarks" | "omitted";
export interface OscalLoss { model: OscalModel; amcField: string; count: number; disposition: LossDisposition; note: string }
export interface OscalLossReport {
  schemaVersion: "amc.oscal-loss/1";
  oscalVersion: string;
  inputs: Array<{ kind: "catalog" | "plan" | "results"; digest: string }>;
  losses: OscalLoss[];
}

export const loss = (model: OscalModel, amcField: string, count: number, disposition: LossDisposition, note: string): OscalLoss =>
  ({ model, amcField, count, disposition, note });

const MODELS: readonly OscalModel[] = ["catalog", "profile", "assessment-results"];

/** Drops fields with no values in these inputs and orders the rest by model, then field. */
export function buildLossReport(inputs: OscalLossReport["inputs"], losses: readonly OscalLoss[]): OscalLossReport {
  const order = (a: OscalLoss, b: OscalLoss) =>
    MODELS.indexOf(a.model) - MODELS.indexOf(b.model) || (a.amcField < b.amcField ? -1 : a.amcField > b.amcField ? 1 : 0);
  return { schemaVersion: "amc.oscal-loss/1", oscalVersion: OSCAL_VERSION, inputs: [...inputs], losses: losses.filter((l) => l.count > 0).sort(order) };
}
