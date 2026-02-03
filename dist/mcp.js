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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger, createTimer, safeStringify } from './utils.js';
import { getActiveProvider, checkProviders, isNoLLMMode, setMcpServerInstance } from './providers/index.js';
// Provider cache to avoid repeated checks
let cachedProvider = null;
let providerCacheTime = 0;
const PROVIDER_CACHE_TTL_MS = 60000; // 1 minute cache
async function getCachedProvider() {
    const now = Date.now();
    if (!cachedProvider || now - providerCacheTime > PROVIDER_CACHE_TTL_MS) {
        cachedProvider = await getActiveProvider();
        providerCacheTime = now;
    }
    return cachedProvider;
}
import { analyzeIntent } from './tools/intent.js';
import { buildContext, analyzeProject } from './tools/context.js';
import { getGitContext } from './tools/git.js';
import { decomposeTask } from './tools/decompose.js';
import { generateVariants } from './tools/variants.js';
import { critiqueVariants } from './tools/critique.js';
import { optimizeVariant } from './tools/optimize.js';
import { executePipeline } from './pipeline.js';
// ============================================================================
// Tool Definitions
// ============================================================================
const TOOLS = [
    {
        name: 'atlas_intent',
        description: 'Analyze user intent from a natural language request. Extracts action type, target, context, and constraints.',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The user message to analyze' },
                conversationHistory: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant'] },
                            content: { type: 'string' },
                        },
                    },
                    description: 'Optional conversation history for context',
                },
            },
            required: ['message'],
        },
    },
    // ... (rest of tools list unchanged)
    {
        name: 'atlas_context',
        description: 'Gather context about a project or codebase. Analyzes files, dependencies, and project structure.',
        inputSchema: {
            type: 'object',
            properties: {
                projectPath: { type: 'string', description: 'Path to the project root' },
                filePaths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific files to analyze',
                },
                query: { type: 'string', description: 'What context to focus on' },
            },
            required: ['projectPath'],
        },
    },
    {
        name: 'atlas_git',
        description: 'Analyze Git history and repository state. Returns recent commits, active branches, and file change history.',
        inputSchema: {
            type: 'object',
            properties: {
                repoPath: { type: 'string', description: 'Path to the Git repository' },
                maxCommits: { type: 'number', description: 'Maximum commits to analyze (default: 50)' },
                filePath: { type: 'string', description: 'Specific file to get history for' },
            },
            required: ['repoPath'],
        },
    },
    {
        name: 'atlas_decompose',
        description: 'Break down a complex task into smaller subtasks with dependencies. Creates a DAG of work items.',
        inputSchema: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'The task description to decompose' },
                context: { type: 'string', description: 'Additional context about the codebase' },
                maxDepth: { type: 'number', description: 'Maximum decomposition depth (default: 3)' },
            },
            required: ['task'],
        },
    },
    {
        name: 'atlas_variants',
        description: 'Generate multiple solution variants for a coding task. Returns different approaches with pros/cons.',
        inputSchema: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'The coding task description' },
                context: { type: 'string', description: 'Code context and constraints' },
                numVariants: { type: 'number', description: 'Number of variants to generate (default: 3)' },
                language: { type: 'string', description: 'Programming language' },
            },
            required: ['task'],
        },
    },
    {
        name: 'atlas_critique',
        description: 'Review and critique code for quality, security, and best practices. Returns detailed feedback and scores.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to review' },
                language: { type: 'string', description: 'Programming language' },
                focus: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Areas to focus on: security, performance, readability, maintainability',
                },
            },
            required: ['code'],
        },
    },
    {
        name: 'atlas_optimize',
        description: 'Optimize code based on critique feedback. Applies improvements while maintaining functionality.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to optimize' },
                critique: { type: 'string', description: 'Critique feedback to address' },
                language: { type: 'string', description: 'Programming language' },
                preserveApi: { type: 'boolean', description: 'Whether to preserve the public API' },
            },
            required: ['code'],
        },
    },
    {
        name: 'atlas_pipeline',
        description: 'Run the full Atlas pipeline: Intent → Context → Git → Decompose → Variants → Critique → Optimize',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The user request' },
                projectPath: { type: 'string', description: 'Path to the project' },
                options: {
                    type: 'object',
                    properties: {
                        skipGit: { type: 'boolean' },
                        numVariants: { type: 'number' },
                        maxDecomposeDepth: { type: 'number' },
                    },
                },
            },
            required: ['message', 'projectPath'],
        },
    },
    {
        name: 'atlas_providers',
        description: 'Check available LLM providers and their status.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
];
// ============================================================================
// Helper Functions for MCP Tool Adapters
// ============================================================================
/**
 * Build a minimal PipelineContext from MCP tool inputs
 */
async function buildMinimalContext(query, repoPath, additionalContext) {
    // Analyze intent from the query
    const intent = await analyzeIntent(query);
    // Get project info if path provided
    let projectInfo = undefined;
    let codeSnippets = [];
    if (repoPath) {
        try {
            projectInfo = await analyzeProject(repoPath);
        }
        catch {
            // Project analysis failed, continue without it
        }
    }
    // Add additional context as a code snippet if provided
    if (additionalContext) {
        codeSnippets.push({
            content: additionalContext,
            filePath: 'context',
            language: 'text',
            lineRange: { start: 1, end: 1 },
            relevance: 1.0,
        });
    }
    return {
        intent,
        codeSnippets,
        projectInfo,
        gitContext: undefined,
    };
}
/**
 * Create a SolutionVariant from user-provided code
 */
function createVariantFromCode(code, language) {
    return {
        id: 'user-input',
        label: 'A',
        content: code,
        approach: 'User-provided code',
        tradeoffs: {
            pros: ['Direct user input'],
            cons: ['May need optimization'],
        },
        useCase: 'User-provided code for analysis',
    };
}
/**
 * Create a Critique structure from user feedback
 */
function createCritiqueFromFeedback(variantId, feedback) {
    return {
        variantId,
        qualityScore: 50,
        assessment: {
            correctness: 50,
            performance: 50,
            maintainability: 50,
            security: 50,
            bestPractices: 50,
        },
        issues: feedback
            ? [{
                    severity: 'major',
                    category: 'correctness',
                    description: feedback,
                }]
            : [],
        suggestions: feedback ? [feedback] : [],
        isViable: true,
    };
}
// ============================================================================
// Tool Handlers
// ============================================================================
async function handleTool(name, args) {
    const timer = createTimer();
    logger.info({ tool: name, args }, 'MCP tool invoked');
    try {
        switch (name) {
            case 'atlas_intent': {
                const message = z.string().parse(args['message']);
                // analyzeIntent takes just the query string
                const result = await analyzeIntent(message);
                return result;
            }
            case 'atlas_context': {
                const projectPath = z.string().parse(args['projectPath']);
                const query = args['query'];
                // First analyze intent, then build context
                const intent = await analyzeIntent(query ?? 'analyze project context');
                const gitContext = await getGitContext(projectPath);
                const result = await buildContext(intent, projectPath, gitContext ?? undefined);
                return result;
            }
            case 'atlas_git': {
                const repoPath = z.string().parse(args['repoPath']);
                const maxCommits = args['maxCommits'] ?? 50;
                // getGitContext takes repoPath and commitLimit number
                const result = await getGitContext(repoPath, maxCommits);
                return result;
            }
            case 'atlas_decompose': {
                const task = z.string().parse(args['task']);
                const contextStr = args['context'];
                // Build minimal context for decomposeTask
                const context = await buildMinimalContext(task, undefined, contextStr);
                const result = await decomposeTask(context);
                return result;
            }
            case 'atlas_variants': {
                const task = z.string().parse(args['task']);
                const contextStr = args['context'];
                const numVariants = args['numVariants'] ?? 3;
                // Build context and decomposition for generateVariants
                const context = await buildMinimalContext(task, undefined, contextStr);
                const decomposition = await decomposeTask(context);
                const result = await generateVariants(context, decomposition, numVariants);
                return result;
            }
            case 'atlas_critique': {
                const code = z.string().parse(args['code']);
                const language = args['language'];
                // Build a proper SolutionVariant structure for critiqueVariants
                const variants = [createVariantFromCode(code, language)];
                const result = await critiqueVariants(variants);
                return result;
            }
            case 'atlas_optimize': {
                const code = z.string().parse(args['code']);
                const critiqueStr = args['critique'];
                const language = args['language'];
                // Build proper structures for optimizeVariant
                const variant = createVariantFromCode(code, language);
                const critique = createCritiqueFromFeedback(variant.id, critiqueStr);
                const result = await optimizeVariant(variant, critique);
                return result;
            }
            case 'atlas_pipeline': {
                const message = z.string().parse(args['message']);
                const projectPath = z.string().parse(args['projectPath']);
                // executePipeline takes a PipelineRequest with repoPath (not projectPath)
                const result = await executePipeline({
                    query: message,
                    repoPath: projectPath,
                });
                return result;
            }
            case 'atlas_providers': {
                const status = await checkProviders();
                const provider = await getActiveProvider();
                const fallbackMode = isNoLLMMode();
                return {
                    ...status,
                    currentProvider: provider.type,
                    currentModel: provider.model,
                    fallbackMode,
                    message: fallbackMode
                        ? 'Running in fallback mode (heuristics only).'
                        : 'LLM provider active and ready.',
                };
            }
            default:
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
    }
    finally {
        logger.info({ tool: name, durationMs: timer.elapsed() }, 'MCP tool completed');
    }
}
// ============================================================================
// MCP Server Setup
// ============================================================================
async function main() {
    const server = new Server({
        name: 'atlas-mcp-server',
        version: '1.0.0',
    }, {
        capabilities: {
            tools: {},
        },
    });
    // Register the server instance for Sampling capabilities
    setMcpServerInstance(server);
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: TOOLS };
    });
    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await handleTool(name, (args ?? {}));
            return {
                content: [
                    {
                        type: 'text',
                        text: typeof result === 'string' ? result : safeStringify(result),
                    },
                ],
            };
        }
        catch (error) {
            if (error instanceof McpError)
                throw error;
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new McpError(ErrorCode.InternalError, message);
        }
    });
    // Initialize provider before starting
    try {
        const provider = await getActiveProvider();
        logger.info({ provider: provider.type, model: provider.model }, 'LLM provider initialized');
    }
    catch (error) {
        logger.warn({ error }, 'No LLM provider available - some tools may fail');
    }
    // Start the server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Atlas MCP Server started (stdio transport)');
}
main().catch((error) => {
    logger.error({ error }, 'Failed to start Atlas MCP Server');
    process.exit(1);
});
//# sourceMappingURL=mcp.js.map