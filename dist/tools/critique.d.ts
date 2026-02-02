/**
 * Atlas Server - Critique Tool
 *
 * Provides thorough code review and critique:
 * - Correctness analysis
 * - Performance evaluation
 * - Maintainability assessment
 * - Security review
 * - Best practices check
 */
import type { SolutionVariant, Critique, CritiqueResult, CritiqueAssessment } from '../types.js';
/**
 * Critique all solution variants
 */
export declare function critiqueVariants(variants: SolutionVariant[]): Promise<CritiqueResult>;
/**
 * Get the most common issues across variants
 */
export declare function getCommonIssues(critiques: Critique[]): {
    category: keyof CritiqueAssessment;
    count: number;
    examples: string[];
}[];
/**
 * Get improvement priorities based on critiques
 */
export declare function getImprovementPriorities(critiques: Critique[]): {
    area: keyof CritiqueAssessment;
    averageScore: number;
    priority: 'high' | 'medium' | 'low';
}[];
/**
 * Compare two critiques
 */
export declare function compareCritiques(a: Critique, b: Critique): {
    winner: string;
    margin: number;
    comparison: Record<keyof CritiqueAssessment, 'a' | 'b' | 'tie'>;
};
//# sourceMappingURL=critique.d.ts.map