/**
 * Atlas MCP Server - LLM Provider System
 *
 * Unified interface for multiple LLM providers:
 * - Ollama (local)
 * - OpenAI (GPT-4, GPT-3.5)
 * - Anthropic (Claude)
 * - Custom/Other providers
 *
 * The server auto-detects available providers and uses the best one.
 */
export { LLMProvider, createProvider, getActiveProvider, resetProvider, checkProviders, } from './llm-provider.js';
export type { ProviderConfig, ProviderType, CompletionOptions, CompletionResponse, } from './llm-provider.js';
//# sourceMappingURL=index.d.ts.map