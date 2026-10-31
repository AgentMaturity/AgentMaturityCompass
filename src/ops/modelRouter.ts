/**
 * modelRouter.ts — Multi-provider model routing with cost optimization.
 *
 * Routes LLM requests across multiple providers (OpenAI, Anthropic, Google,
 * local models) with intelligent selection based on:
 *   - Cost optimization (cheapest capable model)
 *   - Latency requirements (fastest available)
 *   - Capability matching (model supports required features)
 *   - Fallback chains (if primary fails, try secondary)
 *   - Load balancing across providers
 *   - Rate limit awareness
 */

import { randomUUID } from 'node:crypto';
import { createModelMetadataSnapshot, type ModelMetadataSnapshot } from '../llm/modelCatalog.js';
import { lookupProviderCatalog } from '../llm/providerCatalog.js';

/* ── Types ──────────────────────────────────────────────────────── */

export interface ModelProvider {
  id: string;
  name: string;
  /** Base URL for API calls */
  baseUrl: string;
  /** Models available on this provider */
  models: ModelSpec[];
  /** Current status */
  status: 'healthy' | 'degraded' | 'down';
  /** Rate limit: requests per minute */
  rateLimit: number;
  /** Current request count this minute */
  currentLoad: number;
  /** Priority (lower = preferred) */
  priority: number;
  /** Whether this is a local model */
  isLocal: boolean;
}

export interface ModelSpec {
  id: string;
  name: string;
  provider: string;
  /** Cost per 1K input tokens in USD */
  inputCostPer1K: number | null;
  /** Cost per 1K output tokens in USD */
  outputCostPer1K: number | null;
  /** Max context window in tokens */
  maxContext: number | null;
  /** Capabilities this model supports */
  capabilities: ModelCapability[];
  /** Immutable reviewed catalog pin; absent facts stay unknown. */
  modelMetadata?: ModelMetadataSnapshot | null;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Quality tier (1-5, 5=best) */
  qualityTier: number;
}

export type ModelCapability =
  | 'text-generation'
  | 'code-generation'
  | 'function-calling'
  | 'vision'
  | 'embedding'
  | 'json-mode'
  | 'streaming'
  | 'long-context';

export type RoutingStrategy = 'cheapest' | 'fastest' | 'best-quality' | 'round-robin' | 'fallback';

export interface RoutingRequest {
  /** Required capabilities */
  requiredCapabilities: ModelCapability[];
  /** Minimum context window needed */
  minContext?: number;
  /** Preferred strategy */
  strategy: RoutingStrategy;
  /** Max cost per 1K tokens (input + output) */
  maxCostPer1K?: number;
  /** Max acceptable latency in ms */
  maxLatencyMs?: number;
  /** Specific provider to prefer */
  preferredProvider?: string;
  /** Specific model to prefer */
  preferredModel?: string;
  /** Exclude these providers */
  excludeProviders?: string[];
}

export interface RoutingDecision {
  requestId: string;
  selectedModel: ModelSpec;
  selectedProvider: ModelProvider;
  strategy: RoutingStrategy;
  reason: string;
  alternativeModels: ModelSpec[];
  estimatedCost: { inputPer1K: number | null; outputPer1K: number | null };
  estimatedLatencyMs: number;
  timestamp: number;
}

export interface RoutingStats {
  totalRequests: number;
  requestsByProvider: Record<string, number>;
  requestsByModel: Record<string, number>;
  requestsByStrategy: Record<string, number>;
  avgCostPer1K: number | null;
  avgLatencyMs: number;
  failoverCount: number;
}

/* ── Built-in model catalog ──────────────────────────────────────── */

// Capability, latency and quality values below are legacy routing heuristics, not
// provider support probes. Limits and prices come only from the shared catalog.
const DEFAULT_MODELS: ModelSpec[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: ['text-generation', 'code-generation', 'function-calling', 'vision', 'json-mode', 'streaming', 'long-context'], avgLatencyMs: 800, qualityTier: 5 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', capabilities: ['text-generation', 'code-generation', 'function-calling', 'json-mode', 'streaming', 'long-context'], avgLatencyMs: 400, qualityTier: 3 },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', capabilities: ['text-generation', 'code-generation', 'function-calling', 'vision', 'json-mode', 'streaming', 'long-context'], avgLatencyMs: 700, qualityTier: 5 },
  { id: 'claude-haiku-3.5', name: 'Claude 3.5 Haiku', provider: 'anthropic', capabilities: ['text-generation', 'code-generation', 'function-calling', 'json-mode', 'streaming', 'long-context'], avgLatencyMs: 300, qualityTier: 3 },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', capabilities: ['text-generation', 'code-generation', 'function-calling', 'vision', 'json-mode', 'streaming', 'long-context'], avgLatencyMs: 600, qualityTier: 5 },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', capabilities: ['text-generation', 'code-generation', 'function-calling', 'json-mode', 'streaming', 'long-context'], avgLatencyMs: 250, qualityTier: 3 },
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'local', capabilities: ['text-generation', 'code-generation', 'function-calling', 'json-mode'], avgLatencyMs: 1200, qualityTier: 4 },
].map(model => {
  const protocol = model.provider === 'anthropic' ? 'anthropic-messages' : model.provider === 'google' ? 'gemini-generate-content' : 'openai-chat-completions';
  const modelMetadata = createModelMetadataSnapshot(model.provider, protocol, model.id);
  return { ...model, capabilities: model.capabilities as ModelCapability[], modelMetadata,
    inputCostPer1K: modelMetadata?.pricing?.inputPer1kTokens ?? null,
    outputCostPer1K: modelMetadata?.pricing?.outputPer1kTokens ?? null,
    maxContext: modelMetadata?.contextWindowTokens ?? null };
});

const DEFAULT_PROVIDERS: ModelProvider[] = [
  { id: 'openai', name: 'OpenAI', rateLimit: 500, priority: 1, isLocal: false },
  { id: 'anthropic', name: 'Anthropic', rateLimit: 500, priority: 1, isLocal: false },
  { id: 'google', name: 'Google', rateLimit: 500, priority: 1, isLocal: false },
  { id: 'local', name: 'Local', rateLimit: 10, priority: 2, isLocal: true },
].map(provider => ({ ...provider, baseUrl: lookupProviderCatalog(provider.id)!.defaultBaseUrl!,
  models: DEFAULT_MODELS.filter(model => model.provider === provider.id), status: 'healthy', currentLoad: 0 }));

function knownCost(model: ModelSpec): number | null {
  return model.inputCostPer1K === null || model.outputCostPer1K === null ? null : model.inputCostPer1K + model.outputCostPer1K;
}

/* ── Model Router ────────────────────────────────────────────────── */

export class ModelRouter {
  private providers = new Map<string, ModelProvider>();
  private allModels: ModelSpec[] = [];
  private routingHistory: RoutingDecision[] = [];
  private roundRobinIndex = 0;
  private stats: RoutingStats;

  constructor() {
    for (const p of DEFAULT_PROVIDERS) {
      this.providers.set(p.id, { ...p, models: p.models.map(model => ({ ...model, capabilities: [...model.capabilities] })) });
    }
    this.allModels = [...this.providers.values()].flatMap(provider => provider.models);
    this.stats = { totalRequests: 0, requestsByProvider: {}, requestsByModel: {}, requestsByStrategy: {}, avgCostPer1K: null, avgLatencyMs: 0, failoverCount: 0 };
  }

  /** Add a custom provider */
  addProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
    this.allModels.push(...provider.models);
  }

  /** Add a custom model to an existing provider */
  addModel(model: ModelSpec): void {
    const provider = this.providers.get(model.provider);
    if (provider) provider.models.push(model);
    this.allModels.push(model);
  }

  /** Update provider status */
  setProviderStatus(providerId: string, status: 'healthy' | 'degraded' | 'down'): void {
    const provider = this.providers.get(providerId);
    if (provider) provider.status = status;
  }

  /** List all models */
  listModels(): ModelSpec[] {
    return [...this.allModels];
  }

  /** Route a request to the best model */
  route(request: RoutingRequest): RoutingDecision | undefined {
    // Default requiredCapabilities to empty array if not provided
    const requiredCapabilities = request.requiredCapabilities ?? [];
    // Filter eligible models
    let candidates = this.allModels.filter(m => {
      // Check capabilities
      for (const cap of requiredCapabilities) {
        if (!m.capabilities.includes(cap)) return false;
      }
      // Check context window
      if (request.minContext !== undefined && (m.maxContext === null || m.maxContext < request.minContext)) return false;
      // Check cost
      const cost = knownCost(m);
      if (request.strategy === 'cheapest' && cost === null) return false;
      if (request.maxCostPer1K !== undefined && (cost === null || cost > request.maxCostPer1K)) return false;
      // Check latency
      if (request.maxLatencyMs && m.avgLatencyMs > request.maxLatencyMs) return false;
      // Check excluded providers
      if (request.excludeProviders?.includes(m.provider)) return false;
      // Check provider health
      const provider = this.providers.get(m.provider);
      if (!provider || provider.status === 'down') return false;
      // Check rate limit
      if (provider.currentLoad >= provider.rateLimit) return false;
      return true;
    });

    if (candidates.length === 0) return undefined;

    // Apply preferred model/provider
    if (request.preferredModel) {
      const preferred = candidates.find(m => m.id === request.preferredModel);
      if (preferred) candidates = [preferred, ...candidates.filter(m => m.id !== request.preferredModel)];
    }
    if (request.preferredProvider) {
      candidates.sort((a, b) => (a.provider === request.preferredProvider ? -1 : 0) - (b.provider === request.preferredProvider ? -1 : 0));
    }

    // Apply strategy
    let selected: ModelSpec;
    let reason: string;

    switch (request.strategy) {
      case 'cheapest':
        candidates.sort((a, b) => knownCost(a)! - knownCost(b)!);
        selected = candidates[0]!;
        reason = `Cheapest model: $${knownCost(selected)!.toFixed(5)}/1K tokens`;
        break;
      case 'fastest':
        candidates.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
        selected = candidates[0]!;
        reason = `Fastest model: ${selected.avgLatencyMs}ms avg latency`;
        break;
      case 'best-quality':
        candidates.sort((a, b) => b.qualityTier - a.qualityTier);
        selected = candidates[0]!;
        reason = `Best quality: tier ${selected.qualityTier}/5`;
        break;
      case 'round-robin':
        this.roundRobinIndex = (this.roundRobinIndex + 1) % candidates.length;
        selected = candidates[this.roundRobinIndex]!;
        reason = `Round-robin selection (index ${this.roundRobinIndex})`;
        break;
      case 'fallback':
      default:
        selected = candidates[0]!;
        reason = `Primary model (${candidates.length} alternatives available)`;
        break;
    }

    const provider = this.providers.get(selected.provider)!;
    provider.currentLoad++;

    const decision: RoutingDecision = {
      requestId: randomUUID(),
      selectedModel: selected,
      selectedProvider: provider,
      strategy: request.strategy,
      reason,
      alternativeModels: candidates.filter(m => m.id !== selected.id).slice(0, 3),
      estimatedCost: { inputPer1K: selected.inputCostPer1K, outputPer1K: selected.outputCostPer1K },
      estimatedLatencyMs: selected.avgLatencyMs,
      timestamp: Date.now(),
    };

    this.routingHistory.push(decision);
    this.updateStats(decision);
    return decision;
  }

  private updateStats(decision: RoutingDecision): void {
    this.stats.totalRequests++;
    const pId = decision.selectedProvider.id;
    const mId = decision.selectedModel.id;
    const sId = decision.strategy;
    this.stats.requestsByProvider[pId] = (this.stats.requestsByProvider[pId] ?? 0) + 1;
    this.stats.requestsByModel[mId] = (this.stats.requestsByModel[mId] ?? 0) + 1;
    this.stats.requestsByStrategy[sId] = (this.stats.requestsByStrategy[sId] ?? 0) + 1;

    const costs = this.routingHistory.map(({ estimatedCost: cost }) => cost.inputPer1K === null || cost.outputPer1K === null ? null : cost.inputPer1K + cost.outputPer1K);
    this.stats.avgCostPer1K = costs.some(cost => cost === null) ? null : costs.reduce<number>((sum, cost) => sum + cost!, 0) / this.stats.totalRequests;
    const totalLatency = this.routingHistory.reduce((s, d) => s + d.estimatedLatencyMs, 0);
    this.stats.avgLatencyMs = totalLatency / this.stats.totalRequests;
  }

  /** Get routing history */
  getHistory(): RoutingDecision[] { return [...this.routingHistory]; }

  /** Get all providers */
  getProviders(): ModelProvider[] { return [...this.providers.values()]; }

  /** Get all models */
  getAllModels(): ModelSpec[] { return [...this.allModels]; }

  /** Get stats */
  getStats(): RoutingStats { return { ...this.stats }; }

  /** Clear history and reset load */
  reset(): void {
    this.routingHistory = [];
    for (const p of this.providers.values()) p.currentLoad = 0;
    this.stats = { totalRequests: 0, requestsByProvider: {}, requestsByModel: {}, requestsByStrategy: {}, avgCostPer1K: null, avgLatencyMs: 0, failoverCount: 0 };
  }

  get providerCount(): number { return this.providers.size; }
  get modelCount(): number { return this.allModels.length; }
}
