/**
 * Atlas Server - Context Aggregation Tool
 *
 * Gathers and aggregates context from multiple sources:
 * - Project structure analysis with caching
 * - Relevant code snippets with relevance scoring
 * - Configuration files with validation
 * - Dependencies information with security checking
 *
 * Performance Features:
 * - Parallel file scanning for faster analysis
 * - Result caching to avoid redundant operations
 * - Smart snippet ranking by relevance
 * - Memory-efficient streaming for large files
 *
 * @module context
 * @version 2.0.0
 */
import type { PipelineContext, IntentAnalysis, ProjectInfo, GitContext } from '../types.js';
/** Supported code file extensions with language mapping */
declare const CODE_EXTENSIONS: Map<string, string>;
declare const CONFIG_FILES: string[];
/** Directories to ignore during scanning (performance and security) */
declare const IGNORE_DIRS: Set<string>;
/**
 * Build comprehensive context for the pipeline with caching and parallel processing
 *
 * @param intent - Analyzed user intent
 * @param repoPath - Optional repository path
 * @param gitContext - Optional git context
 * @returns Pipeline context with code snippets and project info
 *
 * @example
 * ```typescript
 * const context = await buildContext(intent, '/path/to/repo', gitContext);
 * console.log(`Found ${context.codeSnippets.length} relevant snippets`);
 * ```
 */
export declare function buildContext(intent: IntentAnalysis, repoPath?: string, gitContext?: GitContext): Promise<PipelineContext>;
/**
 * Analyze project structure and configuration with caching
 *
 * @param rootPath - Project root directory
 * @returns Comprehensive project information
 * @throws {Error} If rootPath is invalid or inaccessible
 */
export declare function analyzeProject(rootPath: string): Promise<ProjectInfo>;
export { CODE_EXTENSIONS, CONFIG_FILES, IGNORE_DIRS };
//# sourceMappingURL=context.d.ts.map