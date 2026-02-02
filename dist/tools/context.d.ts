/**
 * Atlas Server - Context Aggregation Tool
 *
 * Gathers and aggregates context from multiple sources:
 * - Project structure analysis
 * - Relevant code snippets
 * - Configuration files
 * - Dependencies information
 */
import type { PipelineContext, IntentAnalysis, ProjectInfo, GitContext } from '../types.js';
declare const CODE_EXTENSIONS: Set<string>;
declare const CONFIG_FILES: string[];
declare const IGNORE_DIRS: Set<string>;
/**
 * Build comprehensive context for the pipeline
 */
export declare function buildContext(intent: IntentAnalysis, repoPath?: string, gitContext?: GitContext): Promise<PipelineContext>;
/**
 * Analyze project structure and configuration
 */
export declare function analyzeProject(rootPath: string): Promise<ProjectInfo>;
export { CODE_EXTENSIONS, CONFIG_FILES, IGNORE_DIRS };
//# sourceMappingURL=context.d.ts.map