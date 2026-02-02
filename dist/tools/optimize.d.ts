/**
 * Atlas Server - Optimization Tool
 *
 * Takes the best variant and critique, then produces an optimized final output:
 * - Addresses identified issues
 * - Applies performance improvements
 * - Enhances readability and maintainability
 * - Follows best practices
 */
import type { SolutionVariant, Critique, OptimizedOutput, Optimization } from '../types.js';
/**
 * Optimize the best variant based on critique feedback
 */
export declare function optimizeVariant(variant: SolutionVariant, critique: Critique): Promise<OptimizedOutput>;
/**
 * Apply multiple optimization passes
 */
export declare function multiPassOptimization(variant: SolutionVariant, critique: Critique, maxPasses?: number): Promise<OptimizedOutput>;
/**
 * Optimization presets for common scenarios
 */
export declare const OptimizationPresets: {
    /**
     * Focus on performance optimizations
     */
    performance: {
        focus: Optimization["type"][];
        minScoreThreshold: number;
        maxIterations: number;
    };
    /**
     * Focus on code quality and maintainability
     */
    quality: {
        focus: Optimization["type"][];
        minScoreThreshold: number;
        maxIterations: number;
    };
    /**
     * Focus on security hardening
     */
    security: {
        focus: Optimization["type"][];
        minScoreThreshold: number;
        maxIterations: number;
    };
    /**
     * Balanced optimization
     */
    balanced: {
        focus: Optimization["type"][];
        minScoreThreshold: number;
        maxIterations: number;
    };
};
/**
 * Get optimization recommendations based on critique
 */
export declare function getOptimizationRecommendations(critique: Critique): {
    preset: keyof typeof OptimizationPresets;
    reason: string;
    focusAreas: string[];
};
//# sourceMappingURL=optimize.d.ts.map