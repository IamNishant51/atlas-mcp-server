/**
 * Atlas Server - Multi-Stage Pipeline
 *
 * Orchestrates the complete AI pipeline:
 * 1. Intent Analysis - Understand what the user wants
 * 2. Context Gathering - Collect relevant code and project info
 * 3. Git Context - Understand repository state
 * 4. Task Decomposition - Break down into subtasks
 * 5. Variant Generation - Create multiple solutions
 * 6. Critique - Review and score variants
 * 7. Optimization - Refine the best solution
 */
import type { PipelineRequest, PipelineResponse } from './types.js';
/**
 * Execute the complete multi-stage pipeline
 */
export declare function executePipeline(request: PipelineRequest): Promise<PipelineResponse>;
/**
 * Execute a lightweight pipeline (skip some stages for speed)
 */
export declare function executeLightPipeline(request: PipelineRequest): Promise<PipelineResponse>;
/**
 * Execute pipeline with streaming progress updates
 */
export declare function executePipelineWithProgress(request: PipelineRequest, onProgress: (stage: string, status: 'started' | 'completed' | 'failed', data?: unknown) => void): Promise<PipelineResponse>;
/**
 * Validate a pipeline request
 */
export declare function validateRequest(request: unknown): request is PipelineRequest;
/**
 * Get pipeline status summary
 */
export declare function getPipelineStatus(response: PipelineResponse): {
    status: 'success' | 'partial' | 'failed';
    completedStages: number;
    totalStages: number;
    failedStage?: string;
};
//# sourceMappingURL=pipeline.d.ts.map