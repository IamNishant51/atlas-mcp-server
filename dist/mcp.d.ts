#!/usr/bin/env node
/**
 * Atlas MCP Server - Model Context Protocol Implementation
 *
 * This server exposes Atlas tools via the MCP protocol for IDE integration.
 * Compatible with: Cursor, GitHub Copilot, Claude Desktop, Windsurf, etc.
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
 */
import 'dotenv/config';
//# sourceMappingURL=mcp.d.ts.map