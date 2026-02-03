/**
 * Atlas MCP Server - Unified LLM Provider
 * 
 * Supports multiple LLM backends with a unified interface:
 * - Ollama (local, free)
 * - OpenAI (GPT-4, GPT-4-turbo, GPT-3.5-turbo)
 * - Anthropic (Claude 3.5, Claude 3)
 * 
 * Auto-detects available providers and falls back gracefully.
 */

import { Ollama } from 'ollama';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger, retry, getErrorMessage, extractJson } from '../utils.js';

// ============================================================================
// Types
// ============================================================================

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'auto';

export interface ProviderConfig {
  type: ProviderType;
  
  // Ollama config
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  
  // OpenAI config
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string; // For Azure or compatible APIs
  
  // Anthropic config
  anthropicApiKey?: string;
  anthropicModel?: string;
  
  // Common settings
  maxRetries?: number;
  timeoutMs?: number;
}

export interface CompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  jsonMode?: boolean;
}

export interface CompletionResponse {
  text: string;
  provider: ProviderType;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
}

// ============================================================================
// Abstract Provider Interface
// ============================================================================

export abstract class LLMProvider {
  abstract readonly type: ProviderType;
  abstract readonly model: string;
  
  abstract isAvailable(): Promise<boolean>;
  abstract complete(prompt: string, options?: CompletionOptions): Promise<CompletionResponse>;
  abstract completeJson<T>(prompt: string, options?: CompletionOptions): Promise<{ data: T | null; raw: string }>;
}

// ============================================================================
// Ollama Provider
// ============================================================================

class OllamaProvider extends LLMProvider {
  readonly type: ProviderType = 'ollama';
  private client: Ollama;
  private _model: string = '';
  private initialized = false;
  private baseUrl: string;
  private maxRetries: number;

  constructor(config: ProviderConfig) {
    super();
    this.baseUrl = config.ollamaBaseUrl ?? 'http://localhost:11434';
    this.client = new Ollama({ host: this.baseUrl });
    this._model = config.ollamaModel ?? '';
    this.maxRetries = config.maxRetries ?? 3;
  }

  get model(): string {
    return this._model || 'auto-detect';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const models = await this.client.list();
      if (models.models.length === 0) {
        logger.debug('Ollama running but no models installed');
        return false;
      }
      
      // Auto-select model if not specified
      if (!this._model) {
        this._model = models.models[0]!.name;
        logger.info({ model: this._model }, 'Ollama: auto-selected model');
      } else {
        // Verify specified model exists
        const exists = models.models.some(m => m.name.includes(this._model.split(':')[0]!));
        if (!exists) {
          this._model = models.models[0]!.name;
          logger.warn({ fallback: this._model }, 'Ollama: specified model not found, using fallback');
        }
      }
      
      this.initialized = true;
      return true;
    } catch {
      logger.debug('Ollama not available');
      return false;
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    if (!this.initialized) await this.isAvailable();
    
    const startTime = performance.now();
    
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
            stop: options.stop,
          },
          stream: false,
        });
      },
      { maxAttempts: this.maxRetries }
    );

    return {
      text: response.response,
      provider: 'ollama',
      model: this._model,
      usage: {
        promptTokens: response.prompt_eval_count ?? 0,
        completionTokens: response.eval_count ?? 0,
        totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      durationMs: Math.round(performance.now() - startTime),
    };
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
  private _model: string;
  private maxRetries: number;

  constructor(config: ProviderConfig) {
    super();
    this._model = config.openaiModel ?? 'gpt-4-turbo-preview';
    this.maxRetries = config.maxRetries ?? 3;
    
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
      maxRetries: this.maxRetries,
    });
  }

  get model(): string {
    return this._model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Quick test with minimal tokens
      await this.client.chat.completions.create({
        model: this._model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      return true;
    } catch (error) {
      logger.debug({ error: getErrorMessage(error) }, 'OpenAI not available');
      return false;
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    const startTime = performance.now();
    
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
      stop: options.stop,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    });

    const choice = response.choices[0];
    
    return {
      text: choice?.message?.content ?? '',
      provider: 'openai',
      model: this._model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
      durationMs: Math.round(performance.now() - startTime),
    };
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
  private _model: string;
  private maxRetries: number;

  constructor(config: ProviderConfig) {
    super();
    this._model = config.anthropicModel ?? 'claude-3-5-sonnet-20241022';
    this.maxRetries = config.maxRetries ?? 3;
    
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
      maxRetries: this.maxRetries,
    });
  }

  get model(): string {
    return this._model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this._model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch (error) {
      logger.debug({ error: getErrorMessage(error) }, 'Anthropic not available');
      return false;
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
    const startTime = performance.now();

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
      provider: 'anthropic',
      model: this._model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      durationMs: Math.round(performance.now() - startTime),
    };
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
    openaiModel: process.env['OPENAI_MODEL'] ?? 'gpt-4-turbo-preview',
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