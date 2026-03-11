/**
 * LLM API Integration for Judge Models
 * 
 * Handles actual API calls to judge models (GPT-4, Claude, etc.)
 * Includes retry logic, rate limiting, and cost optimization.
 * 
 * Issue: AMC-48 — BUILD: LLM-as-Judge Metrics (API Integration)
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// API Types
// ---------------------------------------------------------------------------

export interface LLMApiConfig {
  /** API provider */
  provider: 'openai' | 'anthropic';
  /** API key */
  apiKey: string;
  /** Base URL for API */
  baseUrl?: string;
  /** Request timeout in ms */
  timeout: number;
  /** Max retries on failure */
  maxRetries: number;
  /** Rate limit (requests per minute) */
  rateLimit: number;
}

export interface LLMRequest {
  /** Model name */
  model: string;
  /** System prompt */
  system?: string;
  /** User prompt */
  prompt: string;
  /** Temperature */
  temperature: number;
  /** Max tokens */
  maxTokens: number;
  /** Request ID for tracking */
  requestId?: string;
}

export interface LLMResponse {
  /** Generated text */
  text: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Cost in USD */
  cost: number;
  /** Response time in ms */
  responseTimeMs: number;
  /** Request ID */
  requestId: string;
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs = 60000; // 1 minute

  constructor(private readonly limit: number) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.limit) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForSlot();
      }
    }
    
    this.requests.push(now);
  }
}

// ---------------------------------------------------------------------------
// LLM API Client
// ---------------------------------------------------------------------------

export class LLMApiClient {
  private rateLimiter: RateLimiter;
  private config: LLMApiConfig;

  constructor(config: LLMApiConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  /**
   * Make API request with retry logic
   */
  async request(request: LLMRequest): Promise<LLMResponse> {
    const requestId = request.requestId || randomUUID();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.rateLimiter.waitForSlot();
        
        const startTime = Date.now();
        const response = await this.makeApiCall(request, requestId);
        const responseTimeMs = Date.now() - startTime;

        return {
          ...response,
          responseTimeMs,
          requestId
        };
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(`API request failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`API request failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`);
  }

  private async makeApiCall(request: LLMRequest, requestId: string): Promise<Omit<LLMResponse, 'responseTimeMs' | 'requestId'>> {
    if (this.config.provider === 'openai') {
      return this.callOpenAI(request);
    } else if (this.config.provider === 'anthropic') {
      return this.callAnthropic(request);
    } else {
      throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  private async callOpenAI(request: LLMRequest): Promise<Omit<LLMResponse, 'responseTimeMs' | 'requestId'>> {
    const url = `${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
    
    const messages = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push({ role: 'user', content: request.prompt });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens
      }),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      text: data.choices[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      cost: this.calculateOpenAICost(request.model, data.usage)
    };
  }

  private async callAnthropic(request: LLMRequest): Promise<Omit<LLMResponse, 'responseTimeMs' | 'requestId'>> {
    const url = `${this.config.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
    
    const messages = [{ role: 'user', content: request.prompt }];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: request.model,
        messages,
        system: request.system,
        temperature: request.temperature,
        max_tokens: request.maxTokens
      }),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      text: data.content[0]?.text || '',
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      cost: this.calculateAnthropicCost(request.model, data.usage)
    };
  }

  private calculateOpenAICost(model: string, usage: any): number {
    // Pricing as of 2024 (per 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
    };

    const modelPricing = pricing[model] || pricing['gpt-4'];
    const inputCost = (usage?.prompt_tokens || 0) / 1000 * modelPricing.input;
    const outputCost = (usage?.completion_tokens || 0) / 1000 * modelPricing.output;
    
    return inputCost + outputCost;
  }

  private calculateAnthropicCost(model: string, usage: any): number {
    // Pricing as of 2024 (per 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
    };

    const modelPricing = pricing[model] || pricing['claude-3-sonnet-20240229'];
    const inputCost = (usage?.input_tokens || 0) / 1000 * modelPricing.input;
    const outputCost = (usage?.output_tokens || 0) / 1000 * modelPricing.output;
    
    return inputCost + outputCost;
  }
}

// ---------------------------------------------------------------------------
// Judge Model Factory
// ---------------------------------------------------------------------------

export class JudgeModelFactory {
  private static clients: Map<string, LLMApiClient> = new Map();

  static createClient(provider: 'openai' | 'anthropic', apiKey: string, options: Partial<LLMApiConfig> = {}): LLMApiClient {
    const config: LLMApiConfig = {
      provider,
      apiKey,
      timeout: 30000,
      maxRetries: 3,
      rateLimit: 60, // 60 requests per minute
      ...options
    };

    const clientKey = `${provider}-${apiKey.slice(-8)}`;
    
    if (!this.clients.has(clientKey)) {
      this.clients.set(clientKey, new LLMApiClient(config));
    }

    return this.clients.get(clientKey)!;
  }

  static getModelMapping(): Record<string, { provider: 'openai' | 'anthropic'; model: string }> {
    return {
      'gpt-4': { provider: 'openai', model: 'gpt-4' },
      'gpt-4-turbo': { provider: 'openai', model: 'gpt-4-turbo-preview' },
      'claude-3-opus': { provider: 'anthropic', model: 'claude-3-opus-20240229' },
      'claude-3-sonnet': { provider: 'anthropic', model: 'claude-3-sonnet-20240229' },
      'claude-3-haiku': { provider: 'anthropic', model: 'claude-3-haiku-20240307' }
    };
  }
}

// ---------------------------------------------------------------------------
// Enhanced Judge Engine with Real API Integration
// ---------------------------------------------------------------------------

export class ProductionLLMJudgeEngine {
  private clients: Map<string, LLMApiClient> = new Map();
  private totalCost = 0;
  private totalRequests = 0;

  constructor(
    private openaiApiKey?: string,
    private anthropicApiKey?: string
  ) {}

  async callJudgeModel(prompt: string, model: string = 'claude-3-sonnet'): Promise<string> {
    const modelMapping = JudgeModelFactory.getModelMapping();
    const modelConfig = modelMapping[model];
    
    if (!modelConfig) {
      throw new Error(`Unsupported judge model: ${model}`);
    }

    const client = this.getClient(modelConfig.provider);
    
    const request: LLMRequest = {
      model: modelConfig.model,
      prompt,
      temperature: 0.1,
      maxTokens: 1000,
      requestId: randomUUID()
    };

    const response = await client.request(request);
    
    // Track usage
    this.totalCost += response.cost;
    this.totalRequests += 1;

    return response.text;
  }

  private getClient(provider: 'openai' | 'anthropic'): LLMApiClient {
    const clientKey = provider;
    
    if (!this.clients.has(clientKey)) {
      let apiKey: string;
      
      if (provider === 'openai') {
        apiKey = this.openaiApiKey || process.env.OPENAI_API_KEY || '';
      } else {
        apiKey = this.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
      }

      if (!apiKey) {
        throw new Error(`No API key provided for ${provider}`);
      }

      const client = JudgeModelFactory.createClient(provider, apiKey, {
        rateLimit: 30, // Conservative rate limit
        maxRetries: 2
      });
      
      this.clients.set(clientKey, client);
    }

    return this.clients.get(clientKey)!;
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): { totalCost: number; totalRequests: number; averageCostPerRequest: number } {
    return {
      totalCost: this.totalCost,
      totalRequests: this.totalRequests,
      averageCostPerRequest: this.totalRequests > 0 ? this.totalCost / this.totalRequests : 0
    };
  }

  /**
   * Reset usage tracking
   */
  resetUsageStats(): void {
    this.totalCost = 0;
    this.totalRequests = 0;
  }
}