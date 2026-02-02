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
// Abstract Provider Interface
// ============================================================================
export class LLMProvider {
}
// ============================================================================
// Ollama Provider
// ============================================================================
class OllamaProvider extends LLMProvider {
    type = 'ollama';
    client;
    _model = '';
    initialized = false;
    baseUrl;
    maxRetries;
    constructor(config) {
        super();
        this.baseUrl = config.ollamaBaseUrl ?? 'http://localhost:11434';
        this.client = new Ollama({ host: this.baseUrl });
        this._model = config.ollamaModel ?? '';
        this.maxRetries = config.maxRetries ?? 3;
    }
    get model() {
        return this._model || 'auto-detect';
    }
    async isAvailable() {
        try {
            const models = await this.client.list();
            if (models.models.length === 0) {
                logger.debug('Ollama running but no models installed');
                return false;
            }
            // Auto-select model if not specified
            if (!this._model) {
                this._model = models.models[0].name;
                logger.info({ model: this._model }, 'Ollama: auto-selected model');
            }
            else {
                // Verify specified model exists
                const exists = models.models.some(m => m.name.includes(this._model.split(':')[0]));
                if (!exists) {
                    this._model = models.models[0].name;
                    logger.warn({ fallback: this._model }, 'Ollama: specified model not found, using fallback');
                }
            }
            this.initialized = true;
            return true;
        }
        catch {
            logger.debug('Ollama not available');
            return false;
        }
    }
    async complete(prompt, options = {}) {
        if (!this.initialized)
            await this.isAvailable();
        const startTime = performance.now();
        const response = await retry(async () => {
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
        }, { maxAttempts: this.maxRetries });
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
    async completeJson(prompt, options = {}) {
        const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.`;
        const response = await this.complete(jsonPrompt, { ...options, temperature: options.temperature ?? 0.3 });
        return { data: extractJson(response.text), raw: response.text };
    }
}
// ============================================================================
// OpenAI Provider
// ============================================================================
class OpenAIProvider extends LLMProvider {
    type = 'openai';
    client;
    _model;
    maxRetries;
    constructor(config) {
        super();
        this._model = config.openaiModel ?? 'gpt-4-turbo-preview';
        this.maxRetries = config.maxRetries ?? 3;
        this.client = new OpenAI({
            apiKey: config.openaiApiKey,
            baseURL: config.openaiBaseUrl,
            maxRetries: this.maxRetries,
        });
    }
    get model() {
        return this._model;
    }
    async isAvailable() {
        try {
            // Quick test with minimal tokens
            await this.client.chat.completions.create({
                model: this._model,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 5,
            });
            return true;
        }
        catch (error) {
            logger.debug({ error: getErrorMessage(error) }, 'OpenAI not available');
            return false;
        }
    }
    async complete(prompt, options = {}) {
        const startTime = performance.now();
        const messages = [];
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
    async completeJson(prompt, options = {}) {
        const response = await this.complete(prompt, { ...options, jsonMode: true });
        return { data: extractJson(response.text), raw: response.text };
    }
}
// ============================================================================
// Anthropic Provider
// ============================================================================
class AnthropicProvider extends LLMProvider {
    type = 'anthropic';
    client;
    _model;
    maxRetries;
    constructor(config) {
        super();
        this._model = config.anthropicModel ?? 'claude-3-5-sonnet-20241022';
        this.maxRetries = config.maxRetries ?? 3;
        this.client = new Anthropic({
            apiKey: config.anthropicApiKey,
            maxRetries: this.maxRetries,
        });
    }
    get model() {
        return this._model;
    }
    async isAvailable() {
        try {
            await this.client.messages.create({
                model: this._model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'hi' }],
            });
            return true;
        }
        catch (error) {
            logger.debug({ error: getErrorMessage(error) }, 'Anthropic not available');
            return false;
        }
    }
    async complete(prompt, options = {}) {
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
    async completeJson(prompt, options = {}) {
        const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.`;
        const response = await this.complete(jsonPrompt, { ...options, temperature: options.temperature ?? 0.3 });
        return { data: extractJson(response.text), raw: response.text };
    }
}
// ============================================================================
// Provider Factory
// ============================================================================
let activeProvider = null;
/**
 * Create a provider instance based on configuration
 */
export function createProvider(config) {
    switch (config.type) {
        case 'ollama':
            return new OllamaProvider(config);
        case 'openai':
            return new OpenAIProvider(config);
        case 'anthropic':
            return new AnthropicProvider(config);
        default:
            return new OllamaProvider(config);
    }
}
/**
 * Get or create the active provider with auto-detection
 */
export async function getActiveProvider(config) {
    if (activeProvider)
        return activeProvider;
    const effectiveConfig = config ?? {
        type: process.env['LLM_PROVIDER'] ?? 'auto',
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
    const providers = [
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
        if (!check())
            continue;
        const provider = create();
        const available = await provider.isAvailable();
        if (available) {
            activeProvider = provider;
            logger.info({ provider: name, model: provider.model }, 'Auto-detected provider');
            return provider;
        }
    }
    throw new Error('No LLM provider available. Please configure one of:\n' +
        '- OLLAMA_BASE_URL (with Ollama running)\n' +
        '- OPENAI_API_KEY\n' +
        '- ANTHROPIC_API_KEY');
}
/**
 * Reset the active provider (for testing or reconfiguration)
 */
export function resetProvider() {
    activeProvider = null;
}
/**
 * Check if any provider is available
 */
export async function checkProviders() {
    const config = {
        type: 'auto',
        ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
        openaiApiKey: process.env['OPENAI_API_KEY'],
        anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    };
    const available = [];
    // Check Ollama
    const ollama = new OllamaProvider(config);
    if (await ollama.isAvailable())
        available.push('ollama');
    // Check OpenAI
    if (config.openaiApiKey) {
        const openai = new OpenAIProvider(config);
        if (await openai.isAvailable())
            available.push('openai');
    }
    // Check Anthropic
    if (config.anthropicApiKey) {
        const anthropic = new AnthropicProvider(config);
        if (await anthropic.isAvailable())
            available.push('anthropic');
    }
    return {
        available,
        activeProvider: activeProvider?.type ?? null,
    };
}
//# sourceMappingURL=llm-provider.js.map