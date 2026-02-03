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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger, createTimer, safeStringify } from './utils.js';
import { getActiveProvider, checkProviders, isNoLLMMode, setMcpServerInstance } from './providers/index.js';
// ============================================================================
// Provider Caching with LRU Cache Pattern
// ============================================================================
/** Provider cache TTL in milliseconds */
const PROVIDER_CACHE_TTL_MS = 60000;
/** Singleton provider cache */
let providerCache = null;
/**
 * Get cached provider with TTL-based invalidation
 * Reduces redundant provider checks during high-frequency tool calls
 */
async function getCachedProvider() {
    const now = Date.now();
    // Return cached if still valid
    if (providerCache && (now - providerCache.cachedAt) < PROVIDER_CACHE_TTL_MS) {
        return providerCache.provider;
    }
    // Refresh cache
    const provider = await getActiveProvider();
    providerCache = { provider, cachedAt: now };
    return provider;
}
/**
 * Invalidate provider cache (useful after configuration changes)
 */
export function invalidateProviderCache() {
    providerCache = null;
}
import { analyzeIntent } from './tools/intent.js';
import { buildContext, analyzeProject } from './tools/context.js';
import { getGitContext } from './tools/git.js';
import { decomposeTask } from './tools/decompose.js';
import { generateVariants } from './tools/variants.js';
import { critiqueVariants } from './tools/critique.js';
import { optimizeVariant } from './tools/optimize.js';
import { executePipeline } from './pipeline.js';
import { scanSecurity } from './tools/security.js';
import { generateTests } from './tools/testgen.js';
import { generateDocumentation } from './tools/docs.js';
import { explainCode } from './tools/explain.js';
import { analyzeError } from './tools/debug.js';
import { processThought, startSession } from './tools/think.js';
import { designUI } from './tools/ui-ux-designer.js';
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
        name: 'atlas_security',
        description: 'Scan code for security vulnerabilities. Detects SQL injection, XSS, hardcoded secrets, weak crypto, and more. Returns findings with severity, CWE IDs, and remediation suggestions.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to scan for vulnerabilities' },
                language: { type: 'string', description: 'Programming language (typescript, javascript, python, etc.)' },
                context: { type: 'string', description: 'Additional context about the code (e.g., "authentication handler")' },
            },
            required: ['code'],
        },
    },
    {
        name: 'atlas_test',
        description: 'Generate comprehensive test cases for code. Supports Jest, Vitest, Pytest, Mocha. Includes unit tests, integration tests, edge cases, and mocking suggestions.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to generate tests for' },
                language: { type: 'string', description: 'Programming language' },
                framework: {
                    type: 'string',
                    enum: ['jest', 'vitest', 'pytest', 'mocha', 'auto'],
                    description: 'Test framework to use (default: auto-detect)'
                },
                testType: {
                    type: 'string',
                    enum: ['unit', 'integration', 'e2e', 'snapshot', 'property'],
                    description: 'Type of test to generate (default: unit)'
                },
                functionName: { type: 'string', description: 'Specific function to test' },
                context: { type: 'string', description: 'Additional context about the code' },
            },
            required: ['code'],
        },
    },
    {
        name: 'atlas_docs',
        description: 'Generate documentation for code. Creates JSDoc/TSDoc/PyDoc comments, README files, API documentation, and usage examples.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to document' },
                language: { type: 'string', description: 'Programming language' },
                style: {
                    type: 'string',
                    enum: ['jsdoc', 'tsdoc', 'pydoc', 'godoc', 'rustdoc', 'auto'],
                    description: 'Documentation style (default: auto-detect)'
                },
                format: {
                    type: 'string',
                    enum: ['markdown', 'html', 'json', 'plain'],
                    description: 'Output format for documentation'
                },
                includeExamples: { type: 'boolean', description: 'Include usage examples' },
                includeTypes: { type: 'boolean', description: 'Include type information' },
                verbose: { type: 'boolean', description: 'Generate more detailed documentation' },
            },
            required: ['code'],
        },
    },
    {
        name: 'atlas_explain',
        description: 'Explain code in plain language. Provides line-by-line explanations, algorithm analysis, complexity analysis, design pattern detection, and beginner-friendly glossary.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to explain' },
                level: {
                    type: 'string',
                    enum: ['beginner', 'intermediate', 'expert'],
                    description: 'Explanation detail level'
                },
                type: {
                    type: 'string',
                    enum: ['overview', 'detailed', 'line-by-line', 'algorithm'],
                    description: 'Type of explanation'
                },
                language: { type: 'string', description: 'Programming language' },
                focusArea: { type: 'string', description: 'Specific aspect to focus on' },
                includeComplexity: { type: 'boolean', description: 'Include Big O complexity analysis' },
                includePatterns: { type: 'boolean', description: 'Include design pattern detection' },
            },
            required: ['code'],
        },
    },
    {
        name: 'atlas_debug',
        description: 'Analyze errors and provide debugging assistance. Parses stack traces, identifies root causes, suggests fixes with code examples, and explains common error patterns.',
        inputSchema: {
            type: 'object',
            properties: {
                error: { type: 'string', description: 'The error message' },
                stackTrace: { type: 'string', description: 'Full stack trace' },
                code: { type: 'string', description: 'Related code context' },
                context: { type: 'string', description: 'Additional context about when the error occurs' },
                language: { type: 'string', description: 'Programming language' },
                framework: { type: 'string', description: 'Framework in use (React, Express, etc.)' },
            },
            required: [],
        },
    },
    {
        name: 'atlas_think',
        description: `Advanced sequential thinking for complex problem-solving. Features dynamic branching, hypothesis testing, confidence tracking, and AI-enhanced reasoning.

Use this tool for:
- Breaking down complex problems step-by-step
- Multi-path reasoning with branch and merge
- Hypothesis generation and verification
- Problems requiring backtracking and revision
- Building confidence through iterative analysis

Each thought can: question previous steps, branch into alternatives, mark dead ends, propose/verify hypotheses, and merge conclusions.`,
        inputSchema: {
            type: 'object',
            properties: {
                thought: { type: 'string', description: 'Your current thinking step' },
                thoughtNumber: { type: 'number', description: 'Current thought number (1-indexed)' },
                totalThoughts: { type: 'number', description: 'Estimated total thoughts needed (can adjust)' },
                nextThoughtNeeded: { type: 'boolean', description: 'Whether another thought step is needed' },
                isRevision: { type: 'boolean', description: 'Whether this revises previous thinking' },
                revisesThought: { type: 'number', description: 'Which thought number is being reconsidered' },
                branchFromThought: { type: 'number', description: 'Thought number to branch from' },
                branchId: { type: 'string', description: 'Identifier for this branch (e.g., "approach-a")' },
                mergeBranches: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Branch IDs to merge conclusions from'
                },
                thoughtType: {
                    type: 'string',
                    enum: ['analysis', 'hypothesis', 'verification', 'revision', 'synthesis', 'conclusion', 'question', 'exploration', 'backtrack', 'insight'],
                    description: 'Type of thinking step'
                },
                confidence: { type: 'number', description: 'Confidence in current reasoning (0-1)' },
                hypothesis: { type: 'string', description: 'Hypothesis statement when thoughtType is "hypothesis"' },
                verificationResult: {
                    type: 'string',
                    enum: ['confirmed', 'refuted', 'partial', 'inconclusive'],
                    description: 'Result when verifying a hypothesis'
                },
                isDeadEnd: { type: 'boolean', description: 'Mark this path as a dead end' },
                keyInsight: { type: 'string', description: 'A key realization to remember' },
                needsMoreThoughts: { type: 'boolean', description: 'If more thoughts needed beyond estimate' },
                problemContext: { type: 'string', description: 'Description of the problem being solved' },
                constraints: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Constraints to consider'
                },
            },
            required: ['thought', 'thoughtNumber', 'totalThoughts', 'nextThoughtNeeded'],
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
    {
        name: 'atlas_refactor',
        description: 'AI-powered code refactoring with pattern detection, complexity reduction, SOLID principles enforcement, and automated optimizations. Detects code smells, applies design patterns, and modernizes code.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to refactor' },
                language: { type: 'string', description: 'Programming language' },
                filePath: { type: 'string', description: 'Optional file path for context' },
                targets: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['complexity', 'duplication', 'naming', 'structure', 'performance', 'solid', 'patterns', 'types', 'async', 'functional', 'deadcode'],
                    },
                    description: 'Specific refactoring targets'
                },
                maxComplexity: { type: 'number', description: 'Target cyclomatic complexity (default: 10)' },
                enforceSOLID: { type: 'boolean', description: 'Enforce SOLID principles (default: true)' },
                preserveBehavior: { type: 'boolean', description: 'Ensure no behavior changes (default: true)' },
                addTypes: { type: 'boolean', description: 'Add TypeScript types if missing' },
                modernize: { type: 'boolean', description: 'Update to latest language features' },
                projectContext: { type: 'string', description: 'Additional project context' },
                dependencies: { type: 'array', items: { type: 'string' }, description: 'Project dependencies' },
            },
            required: ['code', 'language'],
        },
    },
    {
        name: 'atlas_profiler',
        description: 'Performance profiling and Big-O analysis. Analyzes time/space complexity, identifies CPU/memory/IO hotspots, detects memory leaks, and generates optimization suggestions with benchmark code.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to profile' },
                language: { type: 'string', description: 'Programming language' },
                filePath: { type: 'string', description: 'Optional file path' },
                analyzeTime: { type: 'boolean', description: 'Analyze time complexity (default: true)' },
                analyzeSpace: { type: 'boolean', description: 'Analyze space complexity (default: true)' },
                detectLeaks: { type: 'boolean', description: 'Detect memory leaks (default: true)' },
                identifyHotspots: { type: 'boolean', description: 'Identify performance hotspots (default: true)' },
                generateBenchmark: { type: 'boolean', description: 'Generate benchmark code' },
                inputSizes: { type: 'array', items: { type: 'number' }, description: 'Input sizes for Big-O analysis' },
                expectedInputSize: { type: 'string', enum: ['small', 'medium', 'large', 'huge'], description: 'Expected input size' },
                constraints: { type: 'array', items: { type: 'string' }, description: 'Performance constraints' },
            },
            required: ['code', 'language'],
        },
    },
    {
        name: 'atlas_dependencies',
        description: 'Comprehensive dependency analysis: dependency graph, circular dependencies, unused packages, security vulnerabilities, license compliance, bundle size impact, and upgrade recommendations.',
        inputSchema: {
            type: 'object',
            properties: {
                projectPath: { type: 'string', description: 'Path to project root' },
                checkSecurity: { type: 'boolean', description: 'Check for vulnerabilities (default: true)' },
                checkLicenses: { type: 'boolean', description: 'Check license compliance (default: true)' },
                findUnused: { type: 'boolean', description: 'Find unused dependencies (default: true)' },
                analyzeBundleSize: { type: 'boolean', description: 'Analyze bundle size impact (default: true)' },
                suggestUpgrades: { type: 'boolean', description: 'Suggest package upgrades (default: true)' },
            },
            required: ['projectPath'],
        },
    },
    {
        name: 'atlas_review',
        description: 'AI code review assistant with multi-dimensional quality analysis: code quality, security, performance, architecture, testing, and documentation. Provides grades, detailed findings, and actionable suggestions.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'The code to review' },
                language: { type: 'string', description: 'Programming language' },
                filePath: { type: 'string', description: 'Optional file path' },
                checkQuality: { type: 'boolean', description: 'Check code quality (default: true)' },
                checkSecurity: { type: 'boolean', description: 'Check security (default: true)' },
                checkPerformance: { type: 'boolean', description: 'Check performance (default: true)' },
                checkArchitecture: { type: 'boolean', description: 'Check architecture (default: true)' },
                checkTests: { type: 'boolean', description: 'Check test coverage (default: false)' },
                checkDocumentation: { type: 'boolean', description: 'Check documentation (default: true)' },
                framework: { type: 'string', description: 'Framework being used' },
                teamStandards: { type: 'string', description: 'Team coding standards' },
                pullRequestContext: { type: 'string', description: 'PR context for review' },
                changedFiles: { type: 'array', items: { type: 'string' }, description: 'Files changed in PR' },
            },
            required: ['code', 'language'],
        },
    },
    {
        name: 'atlas_dashboard',
        description: 'Generate beautiful HTML dashboard with live code metrics: complexity trends, test coverage, dependency graphs, security audit, performance hotspots, and git stats. Creates interactive visualizations.',
        inputSchema: {
            type: 'object',
            properties: {
                projectPath: { type: 'string', description: 'Path to project root' },
                outputPath: { type: 'string', description: 'Output path for HTML file' },
                includeComplexity: { type: 'boolean', description: 'Include complexity metrics' },
                includeCoverage: { type: 'boolean', description: 'Include coverage metrics' },
                includeDependencies: { type: 'boolean', description: 'Include dependency analysis' },
                includeSecurity: { type: 'boolean', description: 'Include security metrics' },
                includePerformance: { type: 'boolean', description: 'Include performance metrics' },
                includeGitStats: { type: 'boolean', description: 'Include git statistics' },
                title: { type: 'string', description: 'Dashboard title' },
                theme: { type: 'string', enum: ['light', 'dark', 'auto'], description: 'Dashboard theme' },
                refreshInterval: { type: 'number', description: 'Auto-refresh interval in seconds' },
            },
            required: ['projectPath'],
        },
    },
    {
        name: 'atlas_ui_ux_designer',
        description: 'Advanced UI/UX designer that finds best design inspirations from the internet and generates production-ready code. Provides multiple design options with images, code generation, and accessibility guidance.',
        inputSchema: {
            type: 'object',
            properties: {
                requirements: { type: 'string', description: 'UI/UX requirements and design goals' },
                componentType: {
                    type: 'string',
                    enum: ['button', 'card', 'form', 'navbar', 'hero', 'dashboard', 'modal', 'sidebar', 'footer', 'custom'],
                    description: 'Type of component to design'
                },
                framework: {
                    type: 'string',
                    enum: ['react', 'vue', 'html', 'svelte', 'angular'],
                    description: 'Target framework for code generation'
                },
                colorScheme: {
                    type: 'string',
                    enum: ['light', 'dark', 'auto'],
                    description: 'Color scheme preference'
                },
                inspiration: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Design patterns to draw inspiration from (e.g., "glassmorphism", "minimalist")'
                },
                targetAudience: { type: 'string', description: 'Target audience for the design' },
                constraints: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Design constraints or limitations'
                },
            },
            required: ['requirements'],
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
            case 'atlas_security': {
                const code = z.string().parse(args['code']);
                const language = args['language'];
                const context = args['context'];
                const result = await scanSecurity(code, language, context);
                return result;
            }
            case 'atlas_test': {
                const code = z.string().parse(args['code']);
                const language = args['language'];
                const framework = args['framework'] ?? 'auto';
                const testType = args['testType'] ?? 'unit';
                const result = await generateTests(code, {
                    language,
                    framework,
                    testType,
                });
                return result;
            }
            case 'atlas_docs': {
                const code = z.string().parse(args['code']);
                const language = args['language'];
                const style = args['style'] ?? 'auto';
                const includeExamples = args['includeExamples'] ?? true;
                const result = await generateDocumentation(code, {
                    language,
                    style,
                    includeExamples,
                });
                return result;
            }
            case 'atlas_explain': {
                const code = z.string().parse(args['code']);
                const level = args['level'] ?? 'intermediate';
                const type = args['type'] ?? 'overview';
                const language = args['language'];
                const focusArea = args['focusArea'];
                const includeComplexity = args['includeComplexity'] ?? true;
                const includePatterns = args['includePatterns'] ?? true;
                const result = await explainCode(code, {
                    level,
                    type,
                    language,
                    focusArea,
                    includeComplexity,
                    includePatterns,
                });
                return result;
            }
            case 'atlas_debug': {
                const error = args['error'];
                const stackTrace = args['stackTrace'];
                const code = args['code'];
                const context = args['context'];
                const language = args['language'];
                const framework = args['framework'];
                if (!error && !stackTrace) {
                    throw new McpError(ErrorCode.InvalidParams, 'Either error or stackTrace is required');
                }
                const result = await analyzeError({
                    error,
                    stackTrace,
                    code,
                    context,
                    language,
                    framework,
                });
                return result;
            }
            case 'atlas_think': {
                const thought = z.string().parse(args['thought']);
                const thoughtNumber = z.number().parse(args['thoughtNumber']);
                const totalThoughts = z.number().parse(args['totalThoughts']);
                const nextThoughtNeeded = z.boolean().parse(args['nextThoughtNeeded']);
                // Start session if problemContext is provided
                const problemContext = args['problemContext'];
                if (problemContext && thoughtNumber === 1) {
                    startSession(problemContext);
                }
                const result = await processThought({
                    thought,
                    thoughtNumber,
                    totalThoughts,
                    nextThoughtNeeded,
                    isRevision: args['isRevision'],
                    revisesThought: args['revisesThought'],
                    branchFromThought: args['branchFromThought'],
                    branchId: args['branchId'],
                    mergeBranches: args['mergeBranches'],
                    thoughtType: args['thoughtType'],
                    confidence: args['confidence'],
                    hypothesis: args['hypothesis'],
                    verificationResult: args['verificationResult'],
                    isDeadEnd: args['isDeadEnd'],
                    keyInsight: args['keyInsight'],
                    needsMoreThoughts: args['needsMoreThoughts'],
                    problemContext,
                    constraints: args['constraints'],
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
            case 'atlas_refactor': {
                const { default: refactorCode } = await import('./tools/refactor.js');
                const result = await refactorCode({
                    code: z.string().parse(args['code']),
                    language: z.string().parse(args['language']),
                    filePath: args['filePath'],
                    targets: args['targets'],
                    maxComplexity: args['maxComplexity'],
                    enforceSOLID: args['enforceSOLID'],
                    preserveBehavior: args['preserveBehavior'],
                    addTypes: args['addTypes'],
                    modernize: args['modernize'],
                    projectContext: args['projectContext'],
                    dependencies: args['dependencies'],
                });
                return result;
            }
            case 'atlas_profiler': {
                const { default: profileCode } = await import('./tools/profiler.js');
                const result = await profileCode({
                    code: z.string().parse(args['code']),
                    language: z.string().parse(args['language']),
                    filePath: args['filePath'],
                    analyzeTime: args['analyzeTime'],
                    analyzeSpace: args['analyzeSpace'],
                    detectLeaks: args['detectLeaks'],
                    identifyHotspots: args['identifyHotspots'],
                    generateBenchmark: args['generateBenchmark'],
                    inputSizes: args['inputSizes'],
                    expectedInputSize: args['expectedInputSize'],
                    constraints: args['constraints'],
                });
                return result;
            }
            case 'atlas_dependencies': {
                const { default: analyzeDependencies } = await import('./tools/dependencies.js');
                const result = await analyzeDependencies({
                    projectPath: z.string().parse(args['projectPath']),
                    checkSecurity: args['checkSecurity'],
                    checkLicenses: args['checkLicenses'],
                    findUnused: args['findUnused'],
                    analyzeBundleSize: args['analyzeBundleSize'],
                    suggestUpgrades: args['suggestUpgrades'],
                });
                return result;
            }
            case 'atlas_review': {
                const { default: reviewCode } = await import('./tools/review.js');
                const result = await reviewCode({
                    code: z.string().parse(args['code']),
                    language: z.string().parse(args['language']),
                    filePath: args['filePath'],
                    checkQuality: args['checkQuality'],
                    checkSecurity: args['checkSecurity'],
                    checkPerformance: args['checkPerformance'],
                    checkArchitecture: args['checkArchitecture'],
                    checkTests: args['checkTests'],
                    checkDocumentation: args['checkDocumentation'],
                    framework: args['framework'],
                    teamStandards: args['teamStandards'],
                    pullRequestContext: args['pullRequestContext'],
                    changedFiles: args['changedFiles'],
                });
                return result;
            }
            case 'atlas_dashboard': {
                const { default: generateDashboard } = await import('./tools/dashboard.js');
                const result = await generateDashboard({
                    projectPath: z.string().parse(args['projectPath']),
                    outputPath: args['outputPath'],
                    includeComplexity: args['includeComplexity'],
                    includeCoverage: args['includeCoverage'],
                    includeDependencies: args['includeDependencies'],
                    includeSecurity: args['includeSecurity'],
                    includePerformance: args['includePerformance'],
                    includeGitStats: args['includeGitStats'],
                    title: args['title'],
                    theme: args['theme'],
                    refreshInterval: args['refreshInterval'],
                });
                return result;
            }
            case 'atlas_ui_ux_designer': {
                const result = await designUI({
                    requirements: z.string().parse(args['requirements']),
                    componentType: args['componentType'],
                    framework: args['framework'],
                    colorScheme: args['colorScheme'],
                    inspiration: args['inspiration'],
                    targetAudience: args['targetAudience'],
                    constraints: args['constraints'],
                });
                return result;
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