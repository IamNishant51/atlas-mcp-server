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
import { CircuitBreaker } from '../utils.js';
export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'auto' | 'none';
/** Provider health status */
export type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';
export interface ProviderConfig {
    readonly type: ProviderType;
    readonly ollamaBaseUrl?: string;
    readonly ollamaModel?: string;
    readonly openaiApiKey?: string;
    readonly openaiModel?: string;
    readonly openaiBaseUrl?: string;
    readonly anthropicApiKey?: string;
    readonly anthropicModel?: string;
    readonly maxRetries?: number;
    readonly timeoutMs?: number;
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
/**
 * Abstract base class for LLM providers
 * Implementations must provide availability check and completion methods
 */
export declare abstract class LLMProvider {
    abstract readonly type: ProviderType;
    abstract readonly model: string;
    /** Circuit breaker for resilience */
    protected readonly circuitBreaker: CircuitBreaker;
    /** Last health check result */
    protected lastHealthCheck: {
        healthy: boolean;
        timestamp: number;
    };
    /** Check if provider is available */
    abstract isAvailable(): Promise<boolean>;
    /** Generate a completion */
    abstract complete(prompt: string, options?: CompletionOptions): Promise<CompletionResponse>;
    /** Generate a JSON completion */
    abstract completeJson<T>(prompt: string, options?: CompletionOptions): Promise<{
        data: T | null;
        raw: string;
    }>;
    /** Get provider health status */
    getHealth(): ProviderHealth;
    /** Reset provider state */
    reset(): void;
}
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
export declare function setMcpServerInstance(server: Server): void;
/**
 * Check if we're running in no-LLM mode
 */
export declare function isNoLLMMode(): boolean;
/**
 * Create a provider instance based on configuration
 */
export declare function createProvider(config: ProviderConfig): LLMProvider;
/**
 * Get or create the active provider with auto-detection
 */
export declare function getActiveProvider(config?: ProviderConfig): Promise<LLMProvider>;
/**
 * Reset the active provider (for testing or reconfiguration)
 */
export declare function resetProvider(): void;
/**
 * Check if any provider is available
 */
export declare function checkProviders(): Promise<{
    available: ProviderType[];
    activeProvider: string | null;
}>;
//# sourceMappingURL=llm-provider.d.ts.map