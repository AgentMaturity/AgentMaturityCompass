import { MODEL_PRICING, blendedCostPer1k } from './modelPricing.js';
/**
 * Cost/latency routing — routes tasks to optimal model profiles.
 */

export interface RoutingProfile {
  name: string;
  model: string;
  estimatedCostPer1k: number;
  estimatedLatencyMs: number;
  qualityScore: number;
}

export interface RouteResult {
  profile: RoutingProfile;
  rationale: string;
}

// Derived from the shared pricing table so routing and cost estimation cannot
// disagree about the same model. See src/product/modelPricing.ts.
const DEFAULT_PROFILES: RoutingProfile[] = [
  { name: 'gpt-4o', model: 'gpt-4o' },
  { name: 'claude-sonnet', model: 'claude-sonnet-4-20250514' },
  { name: 'gemini-flash', model: 'gemini-flash' },
].map(({ name, model }) => {
  const price = MODEL_PRICING[model]!;
  return {
    name,
    model,
    estimatedCostPer1k: blendedCostPer1k(price),
    estimatedLatencyMs: price.typicalLatencyMs,
    qualityScore: price.qualityScore,
  };
});

export class CostLatencyRouter {
  private profiles: RoutingProfile[] = [...DEFAULT_PROFILES];

  route(taskType: string, maxCost?: number, maxLatency?: number): RouteResult {
    let eligible = this.profiles;
    if (maxCost !== undefined) eligible = eligible.filter(p => p.estimatedCostPer1k <= maxCost);
    if (maxLatency !== undefined) eligible = eligible.filter(p => p.estimatedLatencyMs <= maxLatency);
    if (eligible.length === 0) eligible = this.profiles;

    const chosen = eligible.sort((a, b) => (b.qualityScore / b.estimatedCostPer1k) - (a.qualityScore / a.estimatedCostPer1k))[0]!;
    return { profile: chosen, rationale: `Best value for ${taskType}: ${chosen.name}` };
  }

  addProfile(profile: RoutingProfile): void {
    this.profiles.push(profile);
  }
}
