/**
 * Atlas Server - Task Decomposition Tool
 *
 * Breaks down complex user requests into:
 * - Smaller, actionable subtasks
 * - Dependency relationships
 * - Priority and complexity estimates
 * - Suggested execution order
 */
import type { PipelineContext, DecomposedTask, DecompositionResult } from '../types.js';
/**
 * Decompose a complex request into actionable tasks
 */
export declare function decomposeTask(context: PipelineContext): Promise<DecompositionResult>;
/**
 * Estimate total effort from tasks
 */
export declare function estimateTotalEffort(tasks: DecomposedTask[]): {
    minHours: number;
    maxHours: number;
    averageHours: number;
};
/**
 * Get critical path (longest dependency chain)
 */
export declare function getCriticalPath(tasks: DecomposedTask[]): string[];
/**
 * Check if tasks form a valid DAG (no cycles)
 */
export declare function validateTaskGraph(tasks: DecomposedTask[]): {
    valid: boolean;
    cycleNodes?: string[];
};
//# sourceMappingURL=decompose.d.ts.map