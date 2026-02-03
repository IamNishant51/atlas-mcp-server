#!/usr/bin/env node
/**
 * Atlas MCP Server - Model Context Protocol Implementation
 *
 * This server exposes Atlas tools via the MCP protocol for IDE integration.
 * Compatible with: Cursor, GitHub Copilot, Claude Desktop, Windsurf, etc.
 *
 * Architecture:
 * - Tool definitions are separated from handlers for maintainability
 * - Lazy loading of tool handlers to improve startup time
 * - Provider caching with TTL to reduce redundant API calls
 * - Unified error handling with detailed error codes
 *
 * Usage:
 *   npx atlas-mcp-server
 *   # or
 *   npm run start:mcp
 *
 * Environment Variables:
 *   LLM_PROVIDER=auto|ollama|openai|anthropic
 *   OLLAMA_BASE_URL=http://localhost:11434
 *   OLLAMA_MODEL=auto (or specific model name)
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * @module mcp
 * @author Nishant Unavane
 * @version 1.0.18
 */
import 'dotenv/config';
/**
 * Invalidate provider cache (useful after configuration changes)
 */
export declare function invalidateProviderCache(): void;
//# sourceMappingURL=mcp.d.ts.map