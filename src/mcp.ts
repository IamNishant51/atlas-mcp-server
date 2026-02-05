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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { logger, createTimer, safeStringify, LRUCache } from './utils.js';
import { getActiveProvider, checkProviders, isNoLLMMode, setMcpServerInstance } from './providers/index.js';

// ============================================================================
// Provider Caching with LRU Cache Pattern
// ============================================================================

/** Provider cache TTL in milliseconds */
const PROVIDER_CACHE_TTL_MS = 60000;

/** Cached provider with timestamp */
interface CachedProviderEntry {
  provider: Awaited<ReturnType<typeof getActiveProvider>>;
  cachedAt: number;
}

/** Singleton provider cache */
let providerCache: CachedProviderEntry | null = null;

/**
 * Get cached provider with TTL-based invalidation
 * Reduces redundant provider checks during high-frequency tool calls
 */
async function getCachedProvider(): Promise<Awaited<ReturnType<typeof getActiveProvider>>> {
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
export function invalidateProviderCache(): void {
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
import { designUI, generateComponentFromDesign } from './tools/ui-ux-designer.js';
import { analyzePerformance } from './tools/frontend-performance-doctor.js';
import { analyzeCSS } from './tools/css-architecture-wizard.js';
import { generateAnimation, getAnimationPresets } from './tools/animation-studio.js';
import { generateAPIIntegration } from './tools/api-integration-helper.js';
import type { PipelineContext, SolutionVariant, Critique, CodeSnippet } from './types.js';

// Next-gen revolutionary tools
import performSurgery from './tools/codebase-surgeon.js';
import predictBugs from './tools/bug-oracle.js';
import whisperCode from './tools/code-whisperer.js';
import quantifyTechDebt from './tools/tech-debt-quantifier.js';
import searchCode from './tools/semantic-search.js';
import resolveMergeConflicts from './tools/smart-merge-resolver.js';

// AI Enhancement tools (dream tools)
import { memoryBankTool, handleMemoryBank } from './tools/memory-bank.js';
import { selfValidatorTool, handleSelfValidator } from './tools/self-validator.js';
import { contextPrioritizerTool, handleContextPrioritizer } from './tools/context-prioritizer.js';
import { errorPredictorTool, handleErrorPredictor } from './tools/error-predictor.js';
import { patternLearnerTool, handlePatternLearner } from './tools/pattern-learner.js';
import { executionSandboxTool, handleExecutionSandbox } from './tools/execution-sandbox.js';
import { confidenceScorerTool, handleConfidenceScorer } from './tools/confidence-scorer.js';

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS = [
  {
    name: 'atlas_intent',
    description: 'Analyze user intent from a natural language request. Extracts action type, target, context, and constraints.',
    inputSchema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'atlas_refactor',
    description: 'AI-powered code refactoring with pattern detection, complexity reduction, SOLID principles enforcement, and automated optimizations. Detects code smells, applies design patterns, and modernizes code.',
    inputSchema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
  {
    name: 'atlas_performance_doctor',
    description: 'Frontend performance analyzer that detects React/Vue re-render issues, bundle bloat, memory leaks, and provides specific code fixes with estimated improvement percentages.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'The frontend code to analyze' },
        framework: { 
          type: 'string',
          enum: ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt'],
          description: 'Frontend framework used'
        },
        analysisType: { 
          type: 'string',
          enum: ['full', 'render', 'bundle', 'network', 'quick'],
          description: 'Type of performance analysis to run'
        },
        includeFixedCode: { type: 'boolean', description: 'Include auto-fixed code in the report' },
        targetMetrics: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Specific metrics to focus on'
        },
      },
      required: ['code', 'framework'],
    },
  },
  {
    name: 'atlas_css_wizard',
    description: 'CSS architecture analyzer that detects specificity conflicts, generates design tokens, converts between CSS methodologies (BEM, CSS Modules, Tailwind, styled-components), and provides refactored CSS.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        css: { type: 'string', description: 'The CSS code to analyze' },
        html: { type: 'string', description: 'Optional HTML to find unused classes' },
        targetMethodology: { 
          type: 'string',
          enum: ['bem', 'css-modules', 'tailwind', 'styled-components', 'emotion'],
          description: 'Target CSS methodology to migrate to'
        },
        generateTokens: { type: 'boolean', description: 'Generate design system tokens' },
        framework: { 
          type: 'string',
          enum: ['react', 'vue', 'angular', 'svelte'],
          description: 'Target framework for code output'
        },
      },
      required: ['css'],
    },
  },
  {
    name: 'atlas_animation_studio',
    description: 'Professional animation generator that creates CSS animations, Framer Motion code, GSAP timelines, and micro-interactions. Supports entrance, exit, hover, loading, scroll, and gesture animations with accessibility support.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { 
          type: 'string',
          enum: ['entrance', 'exit', 'hover', 'loading', 'scroll', 'gesture', 'transition', 'micro-interaction'],
          description: 'Type of animation to create'
        },
        element: { type: 'string', description: 'Description of the element to animate (button, card, modal, etc.)' },
        style: { 
          type: 'string',
          enum: ['smooth', 'bouncy', 'elastic', 'sharp', 'natural', 'playful'],
          description: 'Animation style/feel'
        },
        duration: { type: 'number', description: 'Animation duration in milliseconds' },
        library: { 
          type: 'string',
          enum: ['css', 'framer-motion', 'gsap', 'react-spring', 'anime-js'],
          description: 'Animation library to generate code for'
        },
        framework: { 
          type: 'string',
          enum: ['react', 'vue', 'svelte', 'vanilla'],
          description: 'Target framework'
        },
        includeReducedMotion: { type: 'boolean', description: 'Include prefers-reduced-motion support' },
      },
      required: ['type', 'element', 'library'],
    },
  },
  {
    name: 'atlas_api_helper',
    description: 'API integration helper that generates TypeScript types from API responses, creates React Query/SWR hooks, generates mock data for testing, builds API clients with interceptors, and creates Zod validation schemas.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        endpoints: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
              path: { type: 'string' },
              description: { type: 'string' },
              requestBody: { type: 'object' },
              responseBody: { type: 'object' },
            },
            required: ['method', 'path', 'responseBody']
          },
          description: 'API endpoints to generate code for'
        },
        baseUrl: { type: 'string', description: 'Base URL of the API' },
        library: { 
          type: 'string',
          enum: ['react-query', 'swr', 'axios', 'fetch', 'tanstack-query'],
          description: 'Data fetching library to use'
        },
        generateTypes: { type: 'boolean', description: 'Generate TypeScript types' },
        generateMocks: { type: 'boolean', description: 'Generate mock data and MSW handlers' },
        generateZodSchemas: { type: 'boolean', description: 'Generate Zod validation schemas' },
        authType: { 
          type: 'string',
          enum: ['bearer', 'api-key', 'basic', 'oauth2', 'none'],
          description: 'Authentication type'
        },
        framework: { 
          type: 'string',
          enum: ['react', 'vue', 'svelte', 'next'],
          description: 'Target framework'
        },
      },
      required: ['endpoints', 'baseUrl', 'library'],
    },
  },
  // ========================================================================
  // 🚀 NEXT-GENERATION REVOLUTIONARY TOOLS
  // ========================================================================
  {
    name: 'atlas_codebase_surgeon',
    description: `AUTONOMOUS MULTI-FILE SURGICAL REFACTORING ENGINE

Revolutionary capabilities far beyond basic refactoring:
- Autonomous multi-file refactoring with dependency graph tracking
- Semantic code transplant (move code between files maintaining all refs)
- Blast radius analysis before any change
- Auto-rollback generation for every change
- Cross-file rename with 100% accuracy
- Dead code autopsy and elimination across entire codebase
- Interface extraction across entire codebase
- Pattern propagation (apply pattern to all similar code)
- Dry-run mode for safe testing

Use this for surgical precision code modifications that affect multiple files.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: { type: 'string', description: 'Path to the project root' },
        operation: {
          type: 'object',
          properties: {
            type: { 
              type: 'string',
              enum: ['transplant', 'rename', 'extract-interface', 'inject-dependency', 
                     'eliminate-dead-code', 'propagate-pattern', 'split-file', 'merge-files',
                     'convert-to-typescript', 'apply-design-pattern'],
              description: 'Type of surgical operation'
            },
          },
          required: ['type'],
          description: 'Operation specification with type-specific parameters'
        },
        targetFiles: { type: 'array', items: { type: 'string' }, description: 'Optional target files to limit scope' },
        dryRun: { type: 'boolean', description: 'Test without actually modifying files (default: true)' },
        generateRollback: { type: 'boolean', description: 'Generate rollback script (default: true)' },
        validateBehavior: { type: 'boolean', description: 'Validate behavior is preserved' },
        maxChangedFiles: { type: 'number', description: 'Maximum files to change (safety limit)' },
      },
      required: ['projectPath', 'operation'],
    },
  },
  {
    name: 'atlas_bug_oracle',
    description: `PREDICTIVE BUG DETECTION & RISK ANALYSIS ENGINE

ML-inspired bug prediction capabilities:
- Predict where bugs are likely to occur BEFORE they happen
- Calculate bug probability scores for each file/function  
- Identify high-risk code changes before they cause issues
- Detect bug-prone patterns (complexity, coupling, churn)
- Generate pre-emptive test recommendations
- Track historical bug patterns
- Provide confidence intervals for predictions
- Integration with git history for churn analysis

This is NOT a static analyzer - it predicts FUTURE bugs using ML-like heuristics.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: { type: 'string', description: 'Path to the project root' },
        targetFiles: { type: 'array', items: { type: 'string' }, description: 'Specific files to analyze' },
        analysisDepth: { 
          type: 'string',
          enum: ['quick', 'standard', 'deep'],
          description: 'Analysis depth (affects confidence)' 
        },
        includeGitHistory: { type: 'boolean', description: 'Include git churn analysis (default: true)' },
        timeRange: { 
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
          description: 'Time range for historical analysis'
        },
        customPatterns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              regex: { type: 'string' },
              severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              description: { type: 'string' },
            },
          },
          description: 'Custom bug patterns to detect'
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'atlas_code_whisperer',
    description: `INTELLIGENT CODE COMPLETION & PREDICTION ENGINE

Next-generation code completion that goes far beyond basic autocomplete:
- Predict entire code blocks, not just single lines
- Learn from codebase patterns and conventions
- Context-aware suggestions based on project architecture
- Multi-file aware completions (knows about related files)
- Intent prediction (what are you trying to accomplish?)
- Smart imports/dependency suggestions
- API usage pattern completion
- Error-resistant suggestions (predicts and avoids bugs)
- Style-matched code generation
- Natural language to code translation

Use for intelligent code generation that understands your project's DNA.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: { type: 'string', description: 'Path to the project root' },
        currentFile: { type: 'string', description: 'Current file being edited' },
        cursorPosition: { 
          type: 'object',
          properties: {
            line: { type: 'number' },
            column: { type: 'number' },
          },
          required: ['line', 'column'],
          description: 'Cursor position for completion'
        },
        prefix: { type: 'string', description: 'Code before cursor' },
        suffix: { type: 'string', description: 'Code after cursor (optional)' },
        intent: { type: 'string', description: 'Natural language description of what you want' },
        mode: { 
          type: 'string',
          enum: ['complete', 'generate', 'transform', 'explain', 'fix'],
          description: 'Completion mode'
        },
        context: {
          type: 'object',
          properties: {
            openFiles: { type: 'array', items: { type: 'string' } },
            recentEdits: { type: 'array', items: { type: 'string' } },
            errorMessages: { type: 'array', items: { type: 'string' } },
            testContext: { type: 'string' },
          },
          description: 'Additional context for better suggestions'
        },
        options: {
          type: 'object',
          properties: {
            maxSuggestions: { type: 'number' },
            creativityLevel: { type: 'string', enum: ['conservative', 'balanced', 'creative'] },
            includeExplanation: { type: 'boolean' },
            respectExistingStyle: { type: 'boolean' },
          },
        },
      },
      required: ['projectPath', 'currentFile', 'cursorPosition', 'prefix', 'mode'],
    },
  },
  {
    name: 'atlas_tech_debt_quantifier',
    description: `FINANCIAL TECH DEBT ANALYSIS ENGINE

Calculate the ACTUAL COST of technical debt in dollars:
- Calculate actual monetary cost of technical debt
- Estimate time to fix each debt item
- Priority ranking with ROI calculations
- Track debt accumulation over time with compound interest model
- Predict future maintenance burden
- Cost-benefit analysis for refactoring decisions
- Team velocity impact estimation
- Breaking point prediction (when debt becomes critical)

Get executive-level financial reports on technical debt to justify refactoring budgets.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: { type: 'string', description: 'Path to the project root' },
        teamSize: { type: 'number', description: 'Number of developers on the team' },
        hourlyRate: { type: 'number', description: 'Developer hourly rate (for cost calculation)' },
        sprintLength: { type: 'number', description: 'Days per sprint' },
        targetFiles: { type: 'array', items: { type: 'string' }, description: 'Files to analyze' },
        includeProjections: { type: 'boolean', description: 'Include future debt projections (default: true)' },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'atlas_semantic_search',
    description: `INTELLIGENT SEMANTIC CODE SEARCH ENGINE

Search code by MEANING, not just keywords:
- Search by meaning, not just text matching
- Understand code intent and functionality
- Find similar code patterns across the codebase
- Discover code by behavior description
- Cross-language semantic matching
- Find usage examples of patterns
- Semantic code clone detection
- Intent-based API discovery
- Natural language queries like "find all authentication code"

Ask questions in plain English and find the code that matches the intent.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: { type: 'string', description: 'Path to the project root' },
        query: { type: 'string', description: 'Natural language query or code snippet to search for' },
        queryType: { 
          type: 'string',
          enum: ['natural-language', 'code-snippet', 'pattern', 'behavior'],
          description: 'Type of query (default: natural-language)'
        },
        filters: {
          type: 'object',
          properties: {
            fileTypes: { type: 'array', items: { type: 'string' }, description: 'File extensions to search (e.g., [".ts", ".js"])' },
            directories: { type: 'array', items: { type: 'string' }, description: 'Directories to search in' },
            excludeTests: { type: 'boolean', description: 'Exclude test files' },
            minSimilarity: { type: 'number', description: 'Minimum similarity score (0-1)' },
          },
        },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 20)' },
        includeContext: { type: 'boolean', description: 'Include code context around matches' },
      },
      required: ['projectPath', 'query'],
    },
  },
  {
    name: 'atlas_smart_merge',
    description: `AI-POWERED MERGE CONFLICT RESOLUTION

Automatically resolve merge conflicts using AI:
- Automatically resolve merge conflicts using AI
- Understand code intent from both branches
- Detect semantic conflicts (not just textual)
- Preserve functionality from both sides when possible
- Generate test cases for merged code
- Confidence scoring for auto-resolutions
- Interactive suggestions for manual review
- Integration with git workflow

Never waste hours on merge conflicts again - let AI handle them.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: { type: 'string', description: 'Path to the git repository root' },
        conflictedFiles: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Specific conflicted files (auto-detected if not provided)' 
        },
        autoResolve: { type: 'boolean', description: 'Automatically apply resolutions (default: false)' },
        confidenceThreshold: { 
          type: 'number',
          description: 'Minimum confidence for auto-resolution (0-1, default: 0.7)' 
        },
        preserveBothWhenUnsure: { type: 'boolean', description: 'Keep both versions when uncertain' },
        generateTests: { type: 'boolean', description: 'Generate test suggestions for resolved conflicts' },
      },
      required: ['projectPath'],
    },
  },
  // AI Enhancement Tools
  memoryBankTool,
  selfValidatorTool,
  contextPrioritizerTool,
  errorPredictorTool,
  patternLearnerTool,
  executionSandboxTool,
  confidenceScorerTool,
];

// ============================================================================
// Helper Functions for MCP Tool Adapters
// ============================================================================

/**
 * Build a minimal PipelineContext from MCP tool inputs
 */
async function buildMinimalContext(
  query: string,
  repoPath?: string,
  additionalContext?: string
): Promise<PipelineContext> {
  // Analyze intent from the query
  const intent = await analyzeIntent(query);
  
  // Get project info if path provided
  let projectInfo = undefined;
  let codeSnippets: CodeSnippet[] = [];
  
  if (repoPath) {
    try {
      projectInfo = await analyzeProject(repoPath);
    } catch {
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
function createVariantFromCode(code: string, language?: string): SolutionVariant {
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
function createCritiqueFromFeedback(variantId: string, feedback?: string): Critique {
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
        severity: 'major' as const, 
          category: 'correctness' as const, 
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

async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
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
        const query = args['query'] as string | undefined;
        // First analyze intent, then build context
        const intent = await analyzeIntent(query ?? 'analyze project context');
        const gitContext = await getGitContext(projectPath);
        const result = await buildContext(intent, projectPath, gitContext ?? undefined);
        return result;
      }

      case 'atlas_git': {
        const repoPath = z.string().parse(args['repoPath']);
        const maxCommits = (args['maxCommits'] as number) ?? 50;
        // getGitContext takes repoPath and commitLimit number
        const result = await getGitContext(repoPath, maxCommits);
        return result;
      }

      case 'atlas_decompose': {
        const task = z.string().parse(args['task']);
        const contextStr = args['context'] as string | undefined;
        // Build minimal context for decomposeTask
        const context = await buildMinimalContext(task, undefined, contextStr);
        const result = await decomposeTask(context);
        return result;
      }

      case 'atlas_variants': {
        const task = z.string().parse(args['task']);
        const contextStr = args['context'] as string | undefined;
        const numVariants = (args['numVariants'] as number) ?? 3;
        // Build context and decomposition for generateVariants
        const context = await buildMinimalContext(task, undefined, contextStr);
        const decomposition = await decomposeTask(context);
        const result = await generateVariants(context, decomposition, numVariants);
        return result;
      }

      case 'atlas_critique': {
        const code = z.string().parse(args['code']);
        const language = args['language'] as string | undefined;
        // Build a proper SolutionVariant structure for critiqueVariants
        const variants: SolutionVariant[] = [createVariantFromCode(code, language)];
        const result = await critiqueVariants(variants);
        return result;
      }

      case 'atlas_optimize': {
        const code = z.string().parse(args['code']);
        const critiqueStr = args['critique'] as string | undefined;
        const language = args['language'] as string | undefined;
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
        const language = args['language'] as string | undefined;
        const context = args['context'] as string | undefined;
        const result = await scanSecurity(code, language, context);
        return result;
      }

      case 'atlas_test': {
        const code = z.string().parse(args['code']);
        const language = args['language'] as string | undefined;
        const framework = (args['framework'] as 'jest' | 'vitest' | 'pytest' | 'mocha' | 'auto') ?? 'auto';
        const testType = (args['testType'] as 'unit' | 'integration' | 'e2e' | 'snapshot' | 'property') ?? 'unit';
        const result = await generateTests(code, {
          language,
          framework,
          testType,
        });
        return result;
      }

      case 'atlas_docs': {
        const code = z.string().parse(args['code']);
        const language = args['language'] as string | undefined;
        const style = (args['style'] as 'jsdoc' | 'tsdoc' | 'pydoc' | 'godoc' | 'rustdoc' | 'auto') ?? 'auto';
        const includeExamples = (args['includeExamples'] as boolean) ?? true;
        const result = await generateDocumentation(code, {
          language,
          style,
          includeExamples,
        });
        return result;
      }

      case 'atlas_explain': {
        const code = z.string().parse(args['code']);
        const level = (args['level'] as 'beginner' | 'intermediate' | 'expert') ?? 'intermediate';
        const type = (args['type'] as 'overview' | 'detailed' | 'line-by-line' | 'algorithm') ?? 'overview';
        const language = args['language'] as string | undefined;
        const focusArea = args['focusArea'] as string | undefined;
        const includeComplexity = (args['includeComplexity'] as boolean) ?? true;
        const includePatterns = (args['includePatterns'] as boolean) ?? true;
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
        const error = args['error'] as string | undefined;
        const stackTrace = args['stackTrace'] as string | undefined;
        const code = args['code'] as string | undefined;
        const context = args['context'] as string | undefined;
        const language = args['language'] as string | undefined;
        const framework = args['framework'] as string | undefined;
        
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
        const problemContext = args['problemContext'] as string | undefined;
        if (problemContext && thoughtNumber === 1) {
          startSession(problemContext);
        }
        
        const result = await processThought({
          thought,
          thoughtNumber,
          totalThoughts,
          nextThoughtNeeded,
          isRevision: args['isRevision'] as boolean | undefined,
          revisesThought: args['revisesThought'] as number | undefined,
          branchFromThought: args['branchFromThought'] as number | undefined,
          branchId: args['branchId'] as string | undefined,
          mergeBranches: args['mergeBranches'] as string[] | undefined,
          thoughtType: args['thoughtType'] as any,
          confidence: args['confidence'] as number | undefined,
          hypothesis: args['hypothesis'] as string | undefined,
          verificationResult: args['verificationResult'] as any,
          isDeadEnd: args['isDeadEnd'] as boolean | undefined,
          keyInsight: args['keyInsight'] as string | undefined,
          needsMoreThoughts: args['needsMoreThoughts'] as boolean | undefined,
          problemContext,
          constraints: args['constraints'] as string[] | undefined,
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
          filePath: args['filePath'] as string | undefined,
          targets: args['targets'] as any[] | undefined,
          maxComplexity: args['maxComplexity'] as number | undefined,
          enforceSOLID: args['enforceSOLID'] as boolean | undefined,
          preserveBehavior: args['preserveBehavior'] as boolean | undefined,
          addTypes: args['addTypes'] as boolean | undefined,
          modernize: args['modernize'] as boolean | undefined,
          projectContext: args['projectContext'] as string | undefined,
          dependencies: args['dependencies'] as string[] | undefined,
        });
        return result;
      }

      case 'atlas_profiler': {
        const { default: profileCode } = await import('./tools/profiler.js');
        const result = await profileCode({
          code: z.string().parse(args['code']),
          language: z.string().parse(args['language']),
          filePath: args['filePath'] as string | undefined,
          analyzeTime: args['analyzeTime'] as boolean | undefined,
          analyzeSpace: args['analyzeSpace'] as boolean | undefined,
          detectLeaks: args['detectLeaks'] as boolean | undefined,
          identifyHotspots: args['identifyHotspots'] as boolean | undefined,
          generateBenchmark: args['generateBenchmark'] as boolean | undefined,
          inputSizes: args['inputSizes'] as number[] | undefined,
          expectedInputSize: args['expectedInputSize'] as any,
          constraints: args['constraints'] as string[] | undefined,
        });
        return result;
      }

      case 'atlas_dependencies': {
        const { default: analyzeDependencies } = await import('./tools/dependencies.js');
        const result = await analyzeDependencies({
          projectPath: z.string().parse(args['projectPath']),
          checkSecurity: args['checkSecurity'] as boolean | undefined,
          checkLicenses: args['checkLicenses'] as boolean | undefined,
          findUnused: args['findUnused'] as boolean | undefined,
          analyzeBundleSize: args['analyzeBundleSize'] as boolean | undefined,
          suggestUpgrades: args['suggestUpgrades'] as boolean | undefined,
        });
        return result;
      }

      case 'atlas_review': {
        const { default: reviewCode } = await import('./tools/review.js');
        const result = await reviewCode({
          code: z.string().parse(args['code']),
          language: z.string().parse(args['language']),
          filePath: args['filePath'] as string | undefined,
          checkQuality: args['checkQuality'] as boolean | undefined,
          checkSecurity: args['checkSecurity'] as boolean | undefined,
          checkPerformance: args['checkPerformance'] as boolean | undefined,
          checkArchitecture: args['checkArchitecture'] as boolean | undefined,
          checkTests: args['checkTests'] as boolean | undefined,
          checkDocumentation: args['checkDocumentation'] as boolean | undefined,
          framework: args['framework'] as string | undefined,
          teamStandards: args['teamStandards'] as string | undefined,
          pullRequestContext: args['pullRequestContext'] as string | undefined,
          changedFiles: args['changedFiles'] as string[] | undefined,
        });
        return result;
      }

      case 'atlas_dashboard': {
        const { default: generateDashboard } = await import('./tools/dashboard.js');
        const result = await generateDashboard({
          projectPath: z.string().parse(args['projectPath']),
          outputPath: args['outputPath'] as string | undefined,
          includeComplexity: args['includeComplexity'] as boolean | undefined,
          includeCoverage: args['includeCoverage'] as boolean | undefined,
          includeDependencies: args['includeDependencies'] as boolean | undefined,
          includeSecurity: args['includeSecurity'] as boolean | undefined,
          includePerformance: args['includePerformance'] as boolean | undefined,
          includeGitStats: args['includeGitStats'] as boolean | undefined,
          title: args['title'] as string | undefined,
          theme: args['theme'] as any,
          refreshInterval: args['refreshInterval'] as number | undefined,
        });
        return result;
      }

      case 'atlas_ui_ux_designer': {
        const result = await designUI({
          requirements: z.string().parse(args['requirements']),
          componentType: args['componentType'] as any,
          framework: args['framework'] as any,
          colorScheme: args['colorScheme'] as any,
          inspiration: args['inspiration'] as string[] | undefined,
          targetAudience: args['targetAudience'] as string | undefined,
          constraints: args['constraints'] as string[] | undefined,
        });
        return result;
      }

      case 'atlas_performance_doctor': {
        const result = await analyzePerformance({
          code: z.string().parse(args['code']),
          framework: z.enum(['react', 'vue', 'angular', 'svelte', 'next', 'nuxt']).parse(args['framework']),
          analysisType: args['analysisType'] as any,
          includeFixedCode: args['includeFixedCode'] as boolean | undefined,
          targetMetrics: args['targetMetrics'] as string[] | undefined,
        });
        return result;
      }

      case 'atlas_css_wizard': {
        const result = await analyzeCSS({
          css: z.string().parse(args['css']),
          html: args['html'] as string | undefined,
          targetMethodology: args['targetMethodology'] as any,
          generateTokens: args['generateTokens'] as boolean | undefined,
          framework: args['framework'] as any,
        });
        return result;
      }

      case 'atlas_animation_studio': {
        const result = await generateAnimation({
          type: z.enum(['entrance', 'exit', 'hover', 'loading', 'scroll', 'gesture', 'transition', 'micro-interaction']).parse(args['type']),
          element: z.string().parse(args['element']),
          style: args['style'] as any,
          duration: args['duration'] as number | undefined,
          library: z.enum(['css', 'framer-motion', 'gsap', 'react-spring', 'anime-js']).parse(args['library']),
          framework: args['framework'] as any,
          includeReducedMotion: args['includeReducedMotion'] as boolean | undefined,
        });
        return result;
      }

      case 'atlas_api_helper': {
        const result = await generateAPIIntegration({
          endpoints: z.array(z.object({
            method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
            path: z.string(),
            description: z.string().optional(),
            requestBody: z.record(z.any()).optional(),
            responseBody: z.record(z.any()),
          })).parse(args['endpoints']),
          baseUrl: z.string().parse(args['baseUrl']),
          library: z.enum(['react-query', 'swr', 'axios', 'fetch', 'tanstack-query']).parse(args['library']),
          generateTypes: args['generateTypes'] as boolean | undefined,
          generateMocks: args['generateMocks'] as boolean | undefined,
          generateZodSchemas: args['generateZodSchemas'] as boolean | undefined,
          authType: args['authType'] as any,
          framework: args['framework'] as any,
        });
        return result;
      }

      // ========================================================================
      // 🚀 NEXT-GENERATION REVOLUTIONARY TOOL HANDLERS
      // ========================================================================

      case 'atlas_codebase_surgeon': {
        const result = await performSurgery({
          projectPath: z.string().parse(args['projectPath']),
          operation: args['operation'] as any,
          targetFiles: args['targetFiles'] as string[] | undefined,
          dryRun: args['dryRun'] as boolean | undefined,
          generateRollback: args['generateRollback'] as boolean | undefined,
          validateBehavior: args['validateBehavior'] as boolean | undefined,
          maxChangedFiles: args['maxChangedFiles'] as number | undefined,
        });
        return result;
      }

      case 'atlas_bug_oracle': {
        const result = await predictBugs({
          projectPath: z.string().parse(args['projectPath']),
          targetFiles: args['targetFiles'] as string[] | undefined,
          analysisDepth: args['analysisDepth'] as any,
          includeGitHistory: args['includeGitHistory'] as boolean | undefined,
          timeRange: args['timeRange'] as any,
          customPatterns: args['customPatterns'] as any,
        });
        return result;
      }

      case 'atlas_code_whisperer': {
        const result = await whisperCode({
          projectPath: z.string().parse(args['projectPath']),
          currentFile: z.string().parse(args['currentFile']),
          cursorPosition: args['cursorPosition'] as any,
          prefix: z.string().parse(args['prefix']),
          suffix: args['suffix'] as string | undefined,
          intent: args['intent'] as string | undefined,
          mode: z.enum(['complete', 'generate', 'transform', 'explain', 'fix']).parse(args['mode']),
          context: args['context'] as any,
          options: args['options'] as any,
        });
        return result;
      }

      case 'atlas_tech_debt_quantifier': {
        const result = await quantifyTechDebt({
          projectPath: z.string().parse(args['projectPath']),
          teamSize: args['teamSize'] as number | undefined,
          hourlyRate: args['hourlyRate'] as number | undefined,
          sprintLength: args['sprintLength'] as number | undefined,
          targetFiles: args['targetFiles'] as string[] | undefined,
          includeProjections: args['includeProjections'] as boolean | undefined,
        });
        return result;
      }

      case 'atlas_semantic_search': {
        const result = await searchCode({
          projectPath: z.string().parse(args['projectPath']),
          query: z.string().parse(args['query']),
          queryType: args['queryType'] as any,
          filters: args['filters'] as any,
          maxResults: args['maxResults'] as number | undefined,
          includeContext: args['includeContext'] as boolean | undefined,
        });
        return result;
      }

      case 'atlas_smart_merge': {
        const result = await resolveMergeConflicts({
          projectPath: z.string().parse(args['projectPath']),
          conflictedFiles: args['conflictedFiles'] as string[] | undefined,
          autoResolve: args['autoResolve'] as boolean | undefined,
          confidenceThreshold: args['confidenceThreshold'] as number | undefined,
          preserveBothWhenUnsure: args['preserveBothWhenUnsure'] as boolean | undefined,
          generateTests: args['generateTests'] as boolean | undefined,
        });
        return result;
      }

      // AI Enhancement Tools
      case 'atlas_memory_bank': {
        const result = await handleMemoryBank(args);
        return result;
      }

      case 'atlas_self_validator': {
        const result = await handleSelfValidator(args);
        return result;
      }

      case 'atlas_context_prioritizer': {
        const result = await handleContextPrioritizer(args);
        return result;
      }

      case 'atlas_error_predictor': {
        const result = await handleErrorPredictor(args);
        return result;
      }

      case 'atlas_pattern_learner': {
        const result = await handlePatternLearner(args);
        return result;
      }

      case 'atlas_execution_sandbox': {
        const result = await handleExecutionSandbox(args);
        return result;
      }

      case 'atlas_confidence_scorer': {
        const result = await handleConfidenceScorer(args);
        return result;
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } finally {
    logger.info({ tool: name, durationMs: timer.elapsed() }, 'MCP tool completed');
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

async function main(): Promise<void> {
  const server = new Server(
    {
      name: 'atlas-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

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
      const result = await handleTool(name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result === 'string' ? result : safeStringify(result),
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new McpError(ErrorCode.InternalError, message);
    }
  });

  // Initialize provider before starting
  try {
    const provider = await getActiveProvider();
    logger.info({ provider: provider.type, model: provider.model }, 'LLM provider initialized');
  } catch (error) {
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