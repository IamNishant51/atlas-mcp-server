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
import type { OllamaConfig, GenerationOptions, GenerationResponse } from '../types.js';
/**
 * Wrapper around the Ollama API providing structured generation
 * Automatically detects and uses available models from user's Ollama installation
 */
export declare class OllamaClient {
    private client;
    private config;
    private initialized;
    constructor(config?: Partial<OllamaConfig>);
    /**
     * Initialize the client and auto-detect model if not specified
     */
    initialize(): Promise<void>;
    /**
     * Check if Ollama service is available and initialize
     */
    healthCheck(): Promise<boolean>;
    /**
     * List available models
     */
    listModels(): Promise<string[]>;
    /**
     * Ensure client is initialized before generating
     */
    private ensureInitialized;
    /**
     * Generate text completion with retry logic
     */
    generate(prompt: string, options?: GenerationOptions): Promise<GenerationResponse>;
    /**
     * Generate structured JSON output
     *
     * Instructs the model to output valid JSON and attempts to parse it.
     */
    generateJson<T>(prompt: string, options?: GenerationOptions): Promise<{
        data: T | null;
        raw: string;
        stats: GenerationResponse['stats'];
    }>;
    /**
     * Chat-style generation with message history
     */
    chat(messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>, options?: GenerationOptions): Promise<GenerationResponse>;
    /**
     * Build a prompt with optional system context
     */
    private buildPrompt;
    /**
     * Get the current model name
     */
    get model(): string;
    /**
     * Update the model to use
     */
    setModel(model: string): void;
}
/**
 * Collection of reusable prompt templates for different stages
 */
export declare const PromptTemplates: {
    /**
     * System prompt for intent analysis
     */
    intentAnalysis: string;
    /**
     * System prompt for task decomposition
     */
    taskDecomposition: string;
    /**
     * System prompt for code generation variants
     */
    variantGeneration: string;
    /**
     * System prompt for code critique
     */
    codeCritique: string;
    /**
     * System prompt for optimization
     */
    optimization: string;
};
/**
 * Get or create the Ollama client singleton
 */
export declare function getOllamaClient(config?: Partial<OllamaConfig>): OllamaClient;
/**
 * Reset the client instance (useful for testing)
 */
export declare function resetOllamaClient(): void;
//# sourceMappingURL=ollama.d.ts.map