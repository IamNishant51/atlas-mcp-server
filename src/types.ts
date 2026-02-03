/**
 * Atlas Server - Shared Type Definitions
 * 
 * This module defines all shared interfaces and types used across the
 * multi-stage AI pipeline. Types are organized by domain concern.
 * 
 * Design Principles:
 * - Branded types for domain-specific values (IDs, scores)
 * - Strict readonly types where mutation is not expected
 * - Comprehensive Zod schemas for runtime validation
 * - Type guards for safe narrowing
 * 
 * @module types
 * @version 2.0.0
 */

import { z } from 'zod';

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/** Brand type for creating nominal types */
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** Branded type for variant IDs */
export type VariantId = Brand<string, 'VariantId'>;

/** Branded type for task IDs */
export type TaskId = Brand<string, 'TaskId'>;

/** Branded type for session IDs */
export type SessionId = Brand<string, 'SessionId'>;

/** Score between 0 and 100 */
export type Score = Brand<number, 'Score'>;

/** Confidence value between 0 and 1 */
export type Confidence = Brand<number, 'Confidence'>;

/** Helper to create a Score (clamped 0-100) */
export function createScore(value: number): Score {
  return Math.max(0, Math.min(100, Math.round(value))) as Score;
}

/** Helper to create a Confidence (clamped 0-1) */
export function createConfidence(value: number): Confidence {
  return Math.max(0, Math.min(1, value)) as Confidence;
}

/** Helper to create a SessionId */
export function createSessionId(value: string): SessionId {
  return value as SessionId;
}

// ============================================================================
// Core Pipeline Types
// ============================================================================

/**
 * Represents the user's original request to the pipeline
 * @immutable - Should not be mutated after creation
 */
export interface PipelineRequest {
  /** The raw user query or instruction */
  readonly query: string;
  /** Optional repository path for git operations */
  readonly repoPath?: string;
  /** Additional context provided by the user */
  readonly userContext?: Readonly<Record<string, unknown>>;
  /** Session identifier for tracking */
  readonly sessionId?: SessionId;
  /** Request timestamp for metrics */
  readonly timestamp?: string;
  /** Request priority (affects queue ordering) */
  readonly priority?: 'low' | 'normal' | 'high';
}

/**
 * The final output of the pipeline after all stages complete
 */
export interface PipelineResponse {
  /** Whether the pipeline completed successfully */
  success: boolean;
  /** The final optimized response */
  result: string;
  /** Metadata about the pipeline execution */
  metadata: PipelineMetadata;
  /** Error details if the pipeline failed */
  error?: PipelineError;
}

/**
 * Metadata collected during pipeline execution
 * @immutable - Frozen after pipeline completion
 */
export interface PipelineMetadata {
  /** Total execution time in milliseconds */
  readonly executionTimeMs: number;
  /** Results from each pipeline stage */
  readonly stages: readonly StageResult[];
  /** The model used for generation */
  readonly model: string;
  /** Provider used (ollama, openai, anthropic, auto) */
  readonly provider?: string;
  /** Timestamp when processing started */
  readonly startedAt: string;
  /** Timestamp when processing completed */
  readonly completedAt: string;
  /** Total tokens used (if available) */
  readonly tokensUsed?: {
    readonly prompt: number;
    readonly completion: number;
    readonly total: number;
  };
  /** Cache hit information */
  readonly cacheHits?: number;
}

/**
 * Result from a single pipeline stage
 */
export interface StageResult<T = unknown> {
  /** Name of the stage */
  readonly name: StageName;
  /** Whether this stage succeeded */
  readonly success: boolean;
  /** Execution time for this stage in milliseconds */
  readonly durationMs: number;
  /** Optional output data from the stage */
  readonly output?: T;
  /** Error message if stage failed */
  readonly error?: string;
  /** Whether result came from cache */
  readonly cached?: boolean;
  /** Retry count if retries were needed */
  readonly retries?: number;
}

/**
 * Names of all pipeline stages
 */
export type StageName = 
  | 'intent'
  | 'context'
  | 'git'
  | 'decompose'
  | 'variants'
  | 'critique'
  | 'optimize';

/**
 * Pipeline error with structured details
 */
export interface PipelineError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** The stage where the error occurred */
  stage?: StageName;
  /** Additional error details */
  details?: Record<string, unknown>;
}

// ============================================================================
// Intent Analysis Types
// ============================================================================

/**
 * Result of intent classification
 */
export interface IntentAnalysis {
  /** Primary intent category */
  readonly primaryIntent: IntentType;
  /** Secondary intent if detected */
  readonly secondaryIntent?: IntentType;
  /** Confidence score from 0 to 1 */
  readonly confidence: Confidence;
  /** Extracted entities from the query */
  readonly entities: readonly ExtractedEntity[];
  /** Keywords identified in the query */
  readonly keywords: readonly string[];
  /** Whether the query requires clarification */
  readonly requiresClarification: boolean;
  /** Suggested clarifying questions if needed */
  readonly clarifyingQuestions?: readonly string[];
  /** Raw query for reference */
  readonly rawQuery?: string;
}

/**
 * Types of intents the system can classify
 */
export type IntentType = 
  | 'code_generation'
  | 'code_review'
  | 'debugging'
  | 'refactoring'
  | 'explanation'
  | 'documentation'
  | 'testing'
  | 'architecture'
  | 'general_question'
  | 'unknown';

/**
 * An entity extracted from the user query
 */
export interface ExtractedEntity {
  /** Type of entity */
  type: 'language' | 'framework' | 'file' | 'function' | 'concept' | 'library';
  /** The extracted value */
  value: string;
  /** Position in the original query */
  position: { start: number; end: number };
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Aggregated context for the pipeline
 */
export interface PipelineContext {
  /** The analyzed intent */
  intent: IntentAnalysis;
  /** Relevant code snippets */
  codeSnippets: CodeSnippet[];
  /** Git history context if available */
  gitContext?: GitContext;
  /** Project structure information */
  projectInfo?: ProjectInfo;
}

/**
 * A code snippet with metadata
 */
export interface CodeSnippet {
  /** File path relative to repo root */
  filePath: string;
  /** The code content */
  content: string;
  /** Programming language */
  language: string;
  /** Line range in the original file */
  lineRange: { start: number; end: number };
  /** Relevance score from 0 to 1 */
  relevance: number;
}

/**
 * Project structure and configuration info
 */
export interface ProjectInfo {
  /** Root directory path */
  rootPath: string;
  /** Detected languages in the project */
  languages: string[];
  /** Detected frameworks */
  frameworks: string[];
  /** Package manager in use */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  /** Key configuration files found */
  configFiles: string[];
}

// ============================================================================
// Git Types
// ============================================================================

/**
 * Git repository context
 */
export interface GitContext {
  /** Current branch name */
  currentBranch: string;
  /** Recent commits */
  recentCommits: GitCommit[];
  /** Uncommitted changes */
  uncommittedChanges: GitChange[];
  /** Repository remote URL */
  remoteUrl?: string;
  /** Whether repo has uncommitted changes */
  isDirty: boolean;
}

/**
 * A git commit with metadata
 */
export interface GitCommit {
  /** Commit hash (short) */
  hash: string;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Commit date as ISO string */
  date: string;
  /** Files changed in this commit */
  filesChanged: number;
}

/**
 * A single git change (staged or unstaged)
 */
export interface GitChange {
  /** File path */
  path: string;
  /** Type of change */
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Whether the change is staged */
  staged: boolean;
}

// ============================================================================
// Decomposition Types
// ============================================================================

/**
 * A decomposed task from the original query
 */
export interface DecomposedTask {
  /** Unique identifier for the task */
  id: string;
  /** Task description */
  description: string;
  /** Task type category */
  type: TaskType;
  /** Priority from 1 (highest) to 5 (lowest) */
  priority: 1 | 2 | 3 | 4 | 5;
  /** IDs of tasks this depends on */
  dependencies: string[];
  /** Estimated complexity */
  complexity: 'low' | 'medium' | 'high';
  /** Suggested approach for this task */
  approach?: string;
}

/**
 * Types of decomposed tasks
 */
export type TaskType = 
  | 'research'
  | 'design'
  | 'implementation'
  | 'testing'
  | 'documentation'
  | 'review';

/**
 * Result of task decomposition
 */
export interface DecompositionResult {
  /** Original query summary */
  summary: string;
  /** List of decomposed tasks */
  tasks: DecomposedTask[];
  /** Suggested execution order */
  executionOrder: string[];
  /** Total estimated complexity */
  overallComplexity: 'low' | 'medium' | 'high';
}

// ============================================================================
// Variant Generation Types
// ============================================================================

/**
 * A solution variant generated by the system
 */
export interface SolutionVariant {
  /** Unique identifier */
  id: string;
  /** Variant label (A, B, C, etc.) */
  label: string;
  /** The generated solution code or text */
  content: string;
  /** Approach description */
  approach: string;
  /** Trade-offs of this approach */
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
  /** Target use case */
  useCase: string;
}

/**
 * Result of variant generation
 */
export interface VariantGenerationResult {
  /** Generated variants */
  variants: SolutionVariant[];
  /** Recommended variant ID */
  recommendedVariantId: string;
  /** Reasoning for the recommendation */
  recommendationReason: string;
}

// ============================================================================
// Critique Types
// ============================================================================

/**
 * Critique of a solution variant
 */
export interface Critique {
  /** ID of the variant being critiqued */
  variantId: string;
  /** Overall quality score from 0 to 100 */
  qualityScore: number;
  /** Detailed assessment categories */
  assessment: CritiqueAssessment;
  /** List of identified issues */
  issues: CritiqueIssue[];
  /** Suggestions for improvement */
  suggestions: string[];
  /** Whether this variant is viable */
  isViable: boolean;
}

/**
 * Detailed assessment across categories
 */
export interface CritiqueAssessment {
  /** Code correctness score (0-100) */
  correctness: number;
  /** Performance characteristics (0-100) */
  performance: number;
  /** Code maintainability (0-100) */
  maintainability: number;
  /** Security considerations (0-100) */
  security: number;
  /** Best practices adherence (0-100) */
  bestPractices: number;
}

/**
 * An issue identified during critique
 */
export interface CritiqueIssue {
  /** Severity of the issue */
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  /** Category of the issue */
  category: keyof CritiqueAssessment;
  /** Description of the issue */
  description: string;
  /** Location in the code if applicable */
  location?: string;
  /** Suggested fix */
  suggestedFix?: string;
}

/**
 * Result of critiquing all variants
 */
export interface CritiqueResult {
  /** Critiques for each variant */
  critiques: Critique[];
  /** ID of the best variant after critique */
  bestVariantId: string;
  /** Summary of the critique process */
  summary: string;
}

// ============================================================================
// Optimization Types
// ============================================================================

/**
 * Final optimized output
 */
export interface OptimizedOutput {
  /** The final optimized content */
  content: string;
  /** Optimizations applied */
  optimizationsApplied: Optimization[];
  /** Final quality metrics */
  finalMetrics: CritiqueAssessment;
  /** Explanation of the final solution */
  explanation: string;
}

/**
 * An optimization that was applied
 */
export interface Optimization {
  /** Type of optimization */
  type: 'performance' | 'readability' | 'security' | 'simplification' | 'best_practice';
  /** Description of what was optimized */
  description: string;
  /** Impact assessment */
  impact: 'low' | 'medium' | 'high';
}

// ============================================================================
// Ollama Types
// ============================================================================

/**
 * Configuration for Ollama API calls
 */
export interface OllamaConfig {
  /** Base URL for Ollama API */
  baseUrl: string;
  /** Model to use for generation */
  model: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Maximum retries on failure */
  maxRetries: number;
}

/**
 * Options for a generation request
 */
export interface GenerationOptions {
  /** System prompt to set context */
  systemPrompt?: string;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Whether to stream the response */
  stream?: boolean;
}

/**
 * Response from Ollama generation
 */
export interface GenerationResponse {
  /** Generated text */
  text: string;
  /** Model used */
  model: string;
  /** Generation statistics */
  stats: {
    promptTokens: number;
    completionTokens: number;
    totalDurationMs: number;
  };
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const PipelineRequestSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  repoPath: z.string().optional(),
  userContext: z.record(z.unknown()).optional(),
  sessionId: z.string().optional(),
});

export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  timestamp: z.string(),
  services: z.object({
    ollama: z.boolean(),
  }),
});

// ============================================================================
// Server Configuration
// ============================================================================

export interface ServerConfig {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Ollama configuration */
  ollama: OllamaConfig;
  /** Enable CORS */
  corsEnabled: boolean;
}
