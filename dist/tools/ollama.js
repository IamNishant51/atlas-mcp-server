/**
 * Atlas Server - Ollama API Wrapper
 *
 * Provides a typed, resilient interface to the Ollama API with:
 * - Automatic model detection and selection
 * - Automatic retries with exponential backoff
 * - Structured prompt building
 * - Response parsing and validation
 * - Timeout handling
 */
import { Ollama } from 'ollama';
import { logger, retry, extractJson, getErrorMessage } from '../utils.js';
// ============================================================================
// Default Configuration
// ============================================================================
const DEFAULT_CONFIG = {
    baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    model: process.env['OLLAMA_MODEL'] ?? '', // Empty = auto-detect
    timeoutMs: 120000,
    maxRetries: 3,
};
// ============================================================================
// Ollama Client Class
// ============================================================================
/**
 * Wrapper around the Ollama API providing structured generation
 * Automatically detects and uses available models from user's Ollama installation
 */
export class OllamaClient {
    client;
    config;
    initialized = false;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.client = new Ollama({ host: this.config.baseUrl });
    }
    /**
     * Initialize the client and auto-detect model if not specified
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            const models = await this.listModels();
            if (models.length === 0) {
                logger.error('No models available in Ollama. Please pull a model first: ollama pull <model-name>');
                throw new Error('No models available in Ollama');
            }
            // If no model specified, use the first available one
            if (!this.config.model) {
                this.config.model = models[0];
                logger.info({ model: this.config.model }, 'Auto-selected first available model');
            }
            // Check if the specified model is available
            else if (!models.some(m => m.startsWith(this.config.model.split(':')[0]))) {
                const originalModel = this.config.model;
                this.config.model = models[0];
                logger.warn({ requested: originalModel, using: this.config.model, available: models }, 'Requested model not found, falling back to first available model');
            }
            logger.info({ baseUrl: this.config.baseUrl, model: this.config.model, availableModels: models }, 'Ollama client initialized');
            this.initialized = true;
        }
        catch (error) {
            logger.error({ error: getErrorMessage(error) }, 'Failed to initialize Ollama client');
            throw error;
        }
    }
    /**
     * Check if Ollama service is available and initialize
     */
    async healthCheck() {
        try {
            const response = await this.client.list();
            const hasModels = response.models.length > 0;
            if (!hasModels) {
                logger.warn('Ollama is running but no models are available. Run: ollama pull <model-name>');
            }
            else {
                // Auto-initialize on health check
                await this.initialize();
            }
            return true;
        }
        catch (error) {
            logger.error({ error: getErrorMessage(error) }, 'Ollama health check failed');
            return false;
        }
    }
    /**
     * List available models
     */
    async listModels() {
        const response = await this.client.list();
        return response.models.map((m) => m.name);
    }
    /**
     * Ensure client is initialized before generating
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    /**
     * Generate text completion with retry logic
     */
    async generate(prompt, options = {}) {
        await this.ensureInitialized();
        const startTime = performance.now();
        const response = await retry(async () => {
            const result = await this.client.generate({
                model: this.config.model,
                prompt: this.buildPrompt(prompt, options.systemPrompt),
                options: {
                    temperature: options.temperature ?? 0.7,
                    num_predict: options.maxTokens ?? 2048,
                    stop: options.stop,
                },
                stream: false,
            });
            return result;
        }, { maxAttempts: this.config.maxRetries });
        const totalDurationMs = Math.round(performance.now() - startTime);
        logger.debug({
            model: this.config.model,
            promptLength: prompt.length,
            responseLength: response.response.length,
            durationMs: totalDurationMs
        }, 'Generation completed');
        return {
            text: response.response,
            model: response.model,
            stats: {
                promptTokens: response.prompt_eval_count ?? 0,
                completionTokens: response.eval_count ?? 0,
                totalDurationMs,
            },
        };
    }
    /**
     * Generate structured JSON output
     *
     * Instructs the model to output valid JSON and attempts to parse it.
     */
    async generateJson(prompt, options = {}) {
        const jsonPrompt = `${prompt}

IMPORTANT: Respond with valid JSON only. No markdown, no explanation, just the JSON object.`;
        const response = await this.generate(jsonPrompt, {
            ...options,
            temperature: options.temperature ?? 0.3, // Lower temp for structured output
        });
        const data = extractJson(response.text);
        if (!data) {
            logger.warn({ responsePreview: response.text.substring(0, 200) }, 'Failed to parse JSON from response');
        }
        return {
            data,
            raw: response.text,
            stats: response.stats,
        };
    }
    /**
     * Chat-style generation with message history
     */
    async chat(messages, options = {}) {
        await this.ensureInitialized();
        const startTime = performance.now();
        const response = await retry(async () => {
            const result = await this.client.chat({
                model: this.config.model,
                messages,
                options: {
                    temperature: options.temperature ?? 0.7,
                    num_predict: options.maxTokens ?? 2048,
                },
                stream: false,
            });
            return result;
        }, { maxAttempts: this.config.maxRetries });
        const totalDurationMs = Math.round(performance.now() - startTime);
        return {
            text: response.message.content,
            model: response.model,
            stats: {
                promptTokens: response.prompt_eval_count ?? 0,
                completionTokens: response.eval_count ?? 0,
                totalDurationMs,
            },
        };
    }
    /**
     * Build a prompt with optional system context
     */
    buildPrompt(userPrompt, systemPrompt) {
        if (!systemPrompt) {
            return userPrompt;
        }
        return `${systemPrompt}

${userPrompt}`;
    }
    /**
     * Get the current model name
     */
    get model() {
        return this.config.model;
    }
    /**
     * Update the model to use
     */
    setModel(model) {
        this.config.model = model;
        logger.info({ model }, 'Model updated');
    }
}
// ============================================================================
// Prompt Templates
// ============================================================================
/**
 * Collection of reusable prompt templates for different stages
 */
export const PromptTemplates = {
    /**
     * System prompt for intent analysis
     */
    intentAnalysis: `You are an expert at understanding developer intent.
Analyze the user's query and extract:
- The primary intent (what they want to accomplish)
- Key entities (languages, frameworks, files, functions, concepts)
- Whether clarification is needed

Be precise and concise.`,
    /**
     * System prompt for task decomposition
     */
    taskDecomposition: `You are a senior software architect.
Break down the given task into smaller, actionable subtasks.
For each subtask, identify:
- Dependencies on other subtasks
- Complexity (low/medium/high)
- Type (research/design/implementation/testing/documentation/review)

Output a structured plan.`,
    /**
     * System prompt for code generation variants
     */
    variantGeneration: `You are an expert programmer.
Generate multiple solution variants for the given problem.
For each variant:
- Use a different approach or trade-off
- Explain pros and cons
- Identify the best use case

Aim for 2-3 meaningfully different solutions.`,
    /**
     * System prompt for code critique
     */
    codeCritique: `You are a thorough code reviewer.
Analyze the provided code for:
- Correctness: Does it solve the problem?
- Performance: Are there efficiency issues?
- Maintainability: Is it readable and well-structured?
- Security: Are there vulnerabilities?
- Best Practices: Does it follow conventions?

Provide specific, actionable feedback.`,
    /**
     * System prompt for optimization
     */
    optimization: `You are an optimization specialist.
Given the code and critique, produce an optimized version that:
- Addresses all identified issues
- Maintains correctness
- Improves performance where possible
- Follows best practices

Explain what optimizations were applied.`,
};
// ============================================================================
// Singleton Instance
// ============================================================================
let clientInstance = null;
/**
 * Get or create the Ollama client singleton
 */
export function getOllamaClient(config) {
    if (!clientInstance) {
        clientInstance = new OllamaClient(config);
    }
    return clientInstance;
}
/**
 * Reset the client instance (useful for testing)
 */
export function resetOllamaClient() {
    clientInstance = null;
}
//# sourceMappingURL=ollama.js.map