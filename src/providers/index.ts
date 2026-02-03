/**
 * Atlas MCP Server - LLM Provider System
 * 
 * Unified interface for multiple LLM providers:
 * - Ollama (local)
 * - OpenAI (GPT-5.2-Codex, GPT-4, GPT-3.5)
 * - Anthropic (Claude)
 * - Fallback (no-LLM heuristic mode)
 * 
 * The server auto-detects available providers and uses the best one.
 * If no provider is available, it falls back to heuristic mode.
 */

export {
  LLMProvider,
  createProvider,
  getActiveProvider,
  resetProvider,
  checkProviders,
  isNoLLMMode,
  setMcpServerInstance,
} from './llm-provider.js';

export type {
  ProviderConfig,
  ProviderType,
  CompletionOptions,
  CompletionResponse,
} from './llm-provider.js';
