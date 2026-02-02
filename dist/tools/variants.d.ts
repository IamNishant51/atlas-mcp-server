/**
 * Atlas Server - Variant Generation Tool
 *
 * Generates multiple solution variants for a given task:
 * - Different approaches with trade-offs
 * - Pros and cons analysis
 * - Use case recommendations
 * - Diversity in implementation strategies
 */
import type { PipelineContext, DecompositionResult, SolutionVariant, VariantGenerationResult } from '../types.js';
/**
 * Generate multiple solution variants for a task
 */
export declare function generateVariants(context: PipelineContext, decomposition: DecompositionResult, variantCount?: number): Promise<VariantGenerationResult>;
/**
 * Compare variants and rank them
 */
export declare function rankVariants(variants: SolutionVariant[], criteria: RankingCriteria): RankedVariant[];
export interface RankingCriteria {
    /** Weight for simplicity (0-1) */
    simplicityWeight: number;
    /** Weight for performance (0-1) */
    performanceWeight: number;
    /** Weight for maintainability (0-1) */
    maintainabilityWeight: number;
    /** Weight for feature completeness (0-1) */
    completenessWeight: number;
}
export interface RankedVariant extends SolutionVariant {
    rank: number;
    score: number;
}
/**
 * Ensure variants are sufficiently diverse
 */
export declare function checkVariantDiversity(variants: SolutionVariant[]): {
    isDiverse: boolean;
    similarityScore: number;
    suggestions: string[];
};
/**
 * Merge best aspects of multiple variants
 */
export declare function synthesizeBestAspects(variants: SolutionVariant[]): {
    combinedPros: string[];
    conflictingAspects: string[];
    synthesis: string;
};
//# sourceMappingURL=variants.d.ts.map