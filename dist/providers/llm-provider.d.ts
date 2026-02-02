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
export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'auto';
export interface ProviderConfig {
    type: ProviderType;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    openaiBaseUrl?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
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
export declare abstract class LLMProvider {
    abstract readonly type: ProviderType;
    abstract readonly model: string;
    abstract isAvailable(): Promise<boolean>;
    abstract complete(prompt: string, options?: CompletionOptions): Promise<CompletionResponse>;
    abstract completeJson<T>(prompt: string, options?: CompletionOptions): Promise<{
        data: T | null;
        raw: string;
    }>;
}
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