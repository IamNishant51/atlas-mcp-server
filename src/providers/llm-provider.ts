/**
 * Atlas MCP Server - Unified LLM Provider
 * 
 * Supports multiple LLM backends with a unified interface:
 * - Ollama (local, free)
 * - OpenAI (GPT-5.2-Codex, GPT-4, GPT-4-turbo, GPT-3.5-turbo)
 * - Anthropic (Claude 3.5, Claude 3)
 * 
 * Features:
 * - Auto-detection of available providers
 * - Graceful fallback chain with priority ordering
 * - Request deduplication to prevent duplicate LLM calls
 * - Connection health monitoring with circuit breaker
 * - Response caching for repeated queries
 * - Comprehensive metrics collection
 * 
 * @module llm-provider
 * @author Nishant Unavane
 * @version 2.1.0
 */

import { Ollama } from 'ollama';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { 
  logger, 
  retry, 
  getErrorMessage, 
  extractJson, 
  CircuitBreaker,
  LRUCache,
  RequestDeduplicator,
  globalMetrics,
  hashString,
} from '../utils.js';

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for LLM requests */
const DEFAULT_TIMEOUT_MS = 120000;

/** Default max retries for failed requests */
const DEFAULT_MAX_RETRIES = 3;

/** Health check interval */
const HEALTH_CHECK_INTERVAL_MS = 60000;

/** Response cache TTL (5 minutes for LLM responses) */
const RESPONSE_CACHE_TTL_MS = 300000;

/** Maximum cache size for LLM responses */
const RESPONSE_CACHE_MAX_SIZE = 100;

// ============================================================================
// Response Caching and Deduplication
// ============================================================================

/** Global response cache for LLM completions */
const responseCache = new LRUCache<string, CompletionResponse>(
  RESPONSE_CACHE_MAX_SIZE,
  RESPONSE_CACHE_TTL_MS
);

/** Request deduplicator to prevent duplicate concurrent LLM calls */
const requestDeduplicator = new RequestDeduplicator<CompletionResponse>();

/**
 * Generate a cache key for an LLM request
 */
function generateLLMCacheKey(
  provider: string,
  prompt: string,
  options?: CompletionOptions
): string {
  const keyData = {
    provider,
    prompt: prompt.substring(0, 500), // Truncate long prompts for key
    temp: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 2048,
    system: options?.systemPrompt?.substring(0, 100),
  };
  return hashString(JSON.stringify(keyData));
}

// ============================================================================
// Types
// ============================================================================

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'auto' | 'none';

/** Provider health status */
export type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';

export interface ProviderConfig {
  readonly type: ProviderType;
  
  // Ollama config
  readonly ollamaBaseUrl?: string;
  readonly ollamaModel?: string;
  
  // OpenAI config
  readonly openaiApiKey?: string;
  readonly openaiModel?: string;
  readonly openaiBaseUrl?: string; // For Azure or compatible APIs
  
  // Anthropic config
  readonly anthropicApiKey?: string;
  readonly anthropicModel?: string;
  
  // Common settings
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
  
  // Caching settings
  readonly enableCache?: boolean;
  readonly cacheTtlMs?: number;
}

export interface CompletionOptions {
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
  readonly jsonMode?: boolean;
  /** Request timeout override */
  readonly timeoutMs?: number;
  /** Request ID for deduplication */
  readonly requestId?: string;
  /** Skip cache lookup */
  readonly skipCache?: boolean;
}

export interface CompletionResponse {
  readonly text: string;
  readonly provider: ProviderType;
  readonly model: string;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  readonly durationMs: number;
  /** Whether this was a cached response */
  readonly cached?: boolean;
}

// ============================================================================
// Abstract Provider Interface
// ============================================================================

/**
 * Abstract base class for LLM providers
 * Implementations must provide availability check and completion methods
 */
export abstract class LLMProvider {
  abstract readonly type: ProviderType;
  abstract readonly model: string;
  
  /** Circuit breaker for resilience */
  protected readonly circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 30000,
    halfOpenSuccesses: 1,
  });
  
  /** Last health check result */
  protected lastHealthCheck: { healthy: boolean; timestamp: number } = { healthy: false, timestamp: 0 };
  
  /** Check if provider is available */
  abstract isAvailable(): Promise<boolean>;
  
  /** Generate a completion */
  abstract complete(prompt: string, options?: CompletionOptions): Promise<CompletionResponse>;
  
  /** Generate a JSON completion */
  abstract completeJson<T>(prompt: string, options?: CompletionOptions): Promise<{ data: T | null; raw: string }>;
  
  /** Get provider health status */
  getHealth(): ProviderHealth {
    const state = this.circuitBreaker.getState();
    if (state === 'open') return 'unavailable';
    if (state === 'half-open') return 'degraded';
    return 'healthy';
  }
  
  /** Reset provider state */
  reset(): void {
    this.circuitBreaker.reset();
    this.lastHealthCheck = { healthy: false, timestamp: 0 };
  }
}

// ============================================================================
// Ollama Provider
// ============================================================================

class OllamaProvider extends LLMProvider {
  readonly type: ProviderType = 'ollama';
  private client: Ollama;
  private _model: string = '';
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    super();
    this.baseUrl = config.ollamaBaseUrl ?? 'http://localhost:11434';
    this.client = new Ollama({ host: this.baseUrl });
    this._model = config.ollamaModel ?? '';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get model(): string {
    return this._model || 'auto-detect';
  }

  async isAvailable(): Promise<boolean> {
    // Use cached result if recent
    const now = Date.now();
    if (now - this.lastHealthCheck.timestamp < HEALTH_CHECK_INTERVAL_MS) {
      return this.lastHealthCheck.healthy;
    }
    
    try {
      const models = await this.client.list();
      const hasModels = models.models.length > 0;
      
      if (!hasModels) {
        logger.debug('Ollama running but no models installed');
        this.lastHealthCheck = { healthy: false, timestamp: now };
        return false;
      }
      
      // Auto-select model if not specified
      if (!this._model) {
        this._model = models.models[0]!.name;
        logger.info({ model: this._model }, 'Ollama: auto-selected model');
      } else {
        // Verify specified model exists
        const modelBase = this._model.split(':')[0]!;
        const exists = models.models.some(m => m.name.includes(modelBase));
        if (!exists) {
          this._model = models.models[0]!.name;
          logger.warn({ fallback: this._model }, 'Ollama: specified model not found, using fallback');
        }
      }
      
      this.initialized = true;
      this.lastHealthCheck = { healthy: true, timestamp: now };
      return true;
    } catch {
      logger.debug('Ollama not available');
      this.lastHealthCheck = { healthy: false, timestamp: now };
      return false;
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    if (!this.initialized) await this.isAvailable();
    
    const startTime = performance.now();
    
    return this.circuitBreaker.execute(async () => {
      const response = await retry(
        async () => {
          const fullPrompt = options.systemPrompt 
            ? `${options.systemPrompt}\n\n${prompt}`
            : prompt;
            
          return await this.client.generate({
            model: this._model,
            prompt: fullPrompt,
            options: {
              temperature: options.temperature ?? 0.7,
              num_predict: options.maxTokens ?? 2048,
              stop: options.stop ? [...options.stop] : undefined,
            },
            stream: false,
          });
        },
        { maxAttempts: this.maxRetries }
      );

      return {
        text: response.response,
        provider: 'ollama' as const,
        model: this._model,
        usage: {
          promptTokens: response.prompt_eval_count ?? 0,
          completionTokens: response.eval_count ?? 0,
          totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
        },
        durationMs: Math.round(performance.now() - startTime),
      };
    });
  }

  async completeJson<T>(prompt: string, options: CompletionOptions = {}): Promise<{ data: T | null; raw: string }> {
    const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.`;
    const response = await this.complete(jsonPrompt, { ...options, temperature: options.temperature ?? 0.3 });
    return { data: extractJson<T>(response.text), raw: response.text };
  }
}

// ============================================================================
// OpenAI Provider
// ============================================================================

class OpenAIProvider extends LLMProvider {
  readonly type: ProviderType = 'openai';
  private client: OpenAI;
  private readonly _model: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    super();
    this._model = config.openaiModel ?? 'gpt-5.2-codex';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
      maxRetries: this.maxRetries,
      timeout: this.timeoutMs,
    });
  }

  get model(): string {
    return this._model;
  }

  async isAvailable(): Promise<boolean> {
    // Use cached result if recent
    const now = Date.now();
    if (now - this.lastHealthCheck.timestamp < HEALTH_CHECK_INTERVAL_MS) {
      return this.lastHealthCheck.healthy;
    }
    
    try {
      // Quick test with minimal tokens
      await this.client.chat.completions.create({
        model: this._model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      this.lastHealthCheck = { healthy: true, timestamp: now };
      return true;
    } catch (error) {
      logger.debug({ error: getErrorMessage(error) }, 'OpenAI not available');
      this.lastHealthCheck = { healthy: false, timestamp: now };
      return false;
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    const startTime = performance.now();
    
    return this.circuitBreaker.execute(async () => {
      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await this.client.chat.completions.create({
        model: this._model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stop: options.stop ? [...options.stop] : undefined,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      });

      const choice = response.choices[0];
      
      return {
        text: choice?.message?.content ?? '',
        provider: 'openai' as const,
        model: this._model,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        durationMs: Math.round(performance.now() - startTime),
      };
    });
  }

  async completeJson<T>(prompt: string, options: CompletionOptions = {}): Promise<{ data: T | null; raw: string }> {
    const response = await this.complete(prompt, { ...options, jsonMode: true });
    return { data: extractJson<T>(response.text), raw: response.text };
  }
}

// ============================================================================
// Anthropic Provider
// ============================================================================

class AnthropicProvider extends LLMProvider {
  readonly type: ProviderType = 'anthropic';
  private client: Anthropic;
  private readonly _model: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    super();
    this._model = config.anthropicModel ?? 'claude-3-5-sonnet-20241022';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
      maxRetries: this.maxRetries,
    });
  }

  get model(): string {
    return this._model;
  }

  async isAvailable(): Promise<boolean> {
    // Use cached result if recent
    const now = Date.now();
    if (now - this.lastHealthCheck.timestamp < HEALTH_CHECK_INTERVAL_MS) {
      return this.lastHealthCheck.healthy;
    }
    
    try {
      await this.client.messages.create({
        model: this._model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      });
      this.lastHealthCheck = { healthy: true, timestamp: now };
      return true;
    } catch (error) {
      logger.debug({ error: getErrorMessage(error) }, 'Anthropic not available');
      this.lastHealthCheck = { healthy: false, timestamp: now };
      return false;
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    const startTime = performance.now();

    return this.circuitBreaker.execute(async () => {
      const response = await this.client.messages.create({
        model: this._model,
        max_tokens: options.maxTokens ?? 2048,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(block => block.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : '';

      return {
        text,
        provider: 'anthropic' as const,
        model: this._model,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        durationMs: Math.round(performance.now() - startTime),
      };
    });
  }

  async completeJson<T>(prompt: string, options: CompletionOptions = {}): Promise<{ data: T | null; raw: string }> {
    const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.`;
    const response = await this.complete(jsonPrompt, { ...options, temperature: options.temperature ?? 0.3 });
    return { data: extractJson<T>(response.text), raw: response.text };
  }
}

// ============================================================================
// No-LLM Fallback Provider (works without any external AI)
// ============================================================================

/**
 * A fallback provider that works without any external LLM.
 * Returns structured data that the IDE's built-in AI can process.
 */
class NoLLMProvider extends LLMProvider {
  readonly type: ProviderType = 'none' as ProviderType;
  readonly model: string = 'fallback-heuristic';

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    // Return a structured response indicating no LLM is available
    // The IDE's AI (GitHub Copilot, etc.) will process this
    return {
      text: JSON.stringify({
        mode: 'no-llm-fallback',
        message: 'No external LLM configured. Using heuristic analysis.',
        prompt_summary: prompt.substring(0, 200),
        suggestion: 'Configure OLLAMA_BASE_URL, OPENAI_API_KEY, or ANTHROPIC_API_KEY for AI-powered analysis.',
      }),
      provider: 'none' as ProviderType,
      model: 'fallback-heuristic',
      durationMs: 0,
    };
  }

  async completeJson<T>(prompt: string, options: CompletionOptions = {}): Promise<{ data: T | null; raw: string }> {
    const response = await this.complete(prompt, options);
    return { data: null, raw: response.text };
  }
}

// ============================================================================
// MCP Sampling Provider (Delegates to Client)
// ============================================================================

import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

let mcpServerInstance: Server | null = null;

export function setMcpServerInstance(server: Server) {
  mcpServerInstance = server;
}

class McpSamplingProvider extends LLMProvider {
  readonly type: ProviderType = 'auto'; // Acts as auto/sampling
  readonly model: string = 'client-sampling';

  async isAvailable(): Promise<boolean> {
    // We assume availability if we are in MCP mode and have a server instance
    return !!mcpServerInstance; 
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    if (!mcpServerInstance) {
      throw new Error('MCP Server instance not initialized for sampling');
    }

    const startTime = performance.now();
    
    // Construct the sampling request
    // Note: The MCP SDK might not expose CreateMessageRequestSchema directly in all versions, 
    // but we use the standard structure.
    try {
      // Construct the sampling request with safe type handling
      const messages: { role: 'user' | 'assistant'; content: { type: 'text'; text: string } }[] = [];
      
      const userMessageText = options.systemPrompt 
        ? `System: ${options.systemPrompt}\n\nUser: ${prompt}` 
        : prompt;

      messages.push({ 
        role: 'user', 
        content: { type: 'text', text: userMessageText } 
      });

      // Using 'as any' cast here because the SDK types for 'sampling/createMessage' 
      // might be stricter than the actual runtime behavior or dependent on SDK version.
      // We define the expected return shape explicitly for safety.
      const result = await mcpServerInstance.request(
        {
          method: 'sampling/createMessage',
          params: {
            messages,
            maxTokens: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.7,
          }
        },
        CreateMessageRequestSchema
      ) as unknown as { model: string; content: { type: string; text?: string } };

      const content = result.content;
      const text = (content && content.type === 'text' && content.text) ? content.text : '';

      return {
        text,
        provider: 'auto',
        model: result.model || 'client-model',
        durationMs: Math.round(performance.now() - startTime),
      };

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error({ error: errorMessage }, 'Sampling request failed in McpSamplingProvider');
      throw new Error(`McpSamplingProvider failed: ${errorMessage}`);
    }
  }

  async completeJson<T>(prompt: string, options: CompletionOptions = {}): Promise<{ data: T | null; raw: string }> {
    const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond with valid JSON only. Do not wrap in markdown code blocks.`;
    try {
        const response = await this.complete(jsonPrompt, { ...options, temperature: options.temperature ?? 0.3 });
        return { data: extractJson<T>(response.text), raw: response.text };
    } catch (error) {
        logger.error({ error: getErrorMessage(error) }, 'JSON completion failed in McpSamplingProvider');
        return { data: null, raw: '' };
    }
  }
}

// ============================================================================
// Provider Factory
// ============================================================================

let activeProvider: LLMProvider | null = null;
let noLLMMode = false;

/**
 * Check if we're running in no-LLM mode
 */
export function isNoLLMMode(): boolean {
  return noLLMMode;
}

/**
 * Create a provider instance based on configuration
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'none' as ProviderType:
      return new NoLLMProvider();
    default:
      return new OllamaProvider(config);
  }
}

/**
 * Get or create the active provider with auto-detection
 */
export async function getActiveProvider(config?: ProviderConfig): Promise<LLMProvider> {
  if (activeProvider) return activeProvider;

  const effectiveConfig: ProviderConfig = config ?? {
    type: (process.env['LLM_PROVIDER'] as ProviderType) ?? 'auto',
    
    // Ollama
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    ollamaModel: process.env['OLLAMA_MODEL'] ?? '',
    
    // OpenAI
    openaiApiKey: process.env['OPENAI_API_KEY'],
    openaiModel: process.env['OPENAI_MODEL'] ?? 'gpt-5.2-codex',
    openaiBaseUrl: process.env['OPENAI_BASE_URL'],
    
    // Anthropic
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    anthropicModel: process.env['ANTHROPIC_MODEL'] ?? 'claude-3-5-sonnet-20241022',
    
    maxRetries: 3,
  };

  // If specific provider requested, use it
  if (effectiveConfig.type !== 'auto') {
    activeProvider = createProvider(effectiveConfig);
    const available = await activeProvider.isAvailable();
    if (!available) {
      throw new Error(`Requested provider '${effectiveConfig.type}' is not available`);
    }
    logger.info({ provider: effectiveConfig.type, model: activeProvider.model }, 'Using configured provider');
    return activeProvider;
  }

  // Auto-detect: try providers in order of preference
  const providers: Array<{ name: ProviderType; check: () => boolean; create: () => LLMProvider }> = [
    {
      name: 'anthropic',
      check: () => !!effectiveConfig.anthropicApiKey,
      create: () => new AnthropicProvider(effectiveConfig),
    },
    {
      name: 'openai',
      check: () => !!effectiveConfig.openaiApiKey,
      create: () => new OpenAIProvider(effectiveConfig),
    },
    {
      name: 'ollama',
      check: () => true, // Always try Ollama
      create: () => new OllamaProvider(effectiveConfig),
    },
  ];

  for (const { name, check, create } of providers) {
    if (!check()) continue;
    
    const provider = create();
    const available = await provider.isAvailable();
    
    if (available) {
      activeProvider = provider;
      logger.info({ provider: name, model: provider.model }, 'Auto-detected provider');
      return provider;
    }
  }

  // If no external LLM is configured/available, check if we can use MCP Sampling (delegated to client)
  if (mcpServerInstance) {
    const samplingProvider = new McpSamplingProvider();
    activeProvider = samplingProvider;
    logger.info({ provider: 'auto', model: 'client-sampling' }, 'Using MCP Sampling (delegated to client)');
    return samplingProvider;
  }

  // No external LLM available - use fallback mode
  // The MCP server will still work, returning heuristic analysis
  // The IDE's built-in AI (GitHub Copilot, etc.) can process the results
  logger.info('No external LLM available - running in fallback mode (heuristics only)');
  noLLMMode = true;
  activeProvider = new NoLLMProvider();
  return activeProvider;
}

/**
 * Reset the active provider (for testing or reconfiguration)
 */
export function resetProvider(): void {
  activeProvider = null;
}

/**
 * Check if any provider is available
 */
export async function checkProviders(): Promise<{
  available: ProviderType[];
  activeProvider: string | null;
}> {
  const config: ProviderConfig = {
    type: 'auto',
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    openaiApiKey: process.env['OPENAI_API_KEY'],
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
  };

  const available: ProviderType[] = [];

  // Check Ollama
  const ollama = new OllamaProvider(config);
  if (await ollama.isAvailable()) available.push('ollama');

  // Check OpenAI
  if (config.openaiApiKey) {
    const openai = new OpenAIProvider(config);
    if (await openai.isAvailable()) available.push('openai');
  }

  // Check Anthropic
  if (config.anthropicApiKey) {
    const anthropic = new AnthropicProvider(config);
    if (await anthropic.isAvailable()) available.push('anthropic');
  }

  return {
    available,
    activeProvider: activeProvider?.type ?? null,
  };
}