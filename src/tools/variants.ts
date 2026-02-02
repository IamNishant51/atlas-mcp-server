/**
 * Atlas Server - Variant Generation Tool
 * 
 * Generates multiple solution variants for a given task:
 * - Different approaches with trade-offs
 * - Pros and cons analysis
 * - Use case recommendations
 * - Diversity in implementation strategies
 */

import type {
  PipelineContext,
  DecompositionResult,
  SolutionVariant,
  VariantGenerationResult,
} from '../types.js';
import { getOllamaClient, PromptTemplates } from './ollama.js';
import { logger, generateId } from '../utils.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_VARIANT_COUNT = 3;
const VARIANT_LABELS = ['A', 'B', 'C', 'D', 'E'];

// ============================================================================
// Variant Generation
// ============================================================================

/**
 * Generate multiple solution variants for a task
 */
export async function generateVariants(
  context: PipelineContext,
  decomposition: DecompositionResult,
  variantCount: number = DEFAULT_VARIANT_COUNT
): Promise<VariantGenerationResult> {
  logger.debug(
    { taskCount: decomposition.tasks.length, variantCount },
    'Starting variant generation'
  );

  const client = getOllamaClient();
  const prompt = buildVariantPrompt(context, decomposition, variantCount);

  const response = await client.generateJson<{
    variants: Array<{
      approach: string;
      content: string;
      pros: string[];
      cons: string[];
      useCase: string;
    }>;
    recommendedIndex: number;
    recommendationReason: string;
  }>(prompt, {
    systemPrompt: PromptTemplates.variantGeneration,
    temperature: 0.7, // Higher temp for creative diversity
    maxTokens: 4096,
  });

  if (response.data) {
    const variants = response.data.variants.map((v, index) => ({
      id: generateId(),
      label: VARIANT_LABELS[index] ?? `V${index + 1}`,
      content: v.content,
      approach: v.approach,
      tradeoffs: {
        pros: v.pros,
        cons: v.cons,
      },
      useCase: v.useCase,
    }));

    const recommendedIndex = Math.min(
      Math.max(0, response.data.recommendedIndex),
      variants.length - 1
    );

    return {
      variants,
      recommendedVariantId: variants[recommendedIndex]?.id ?? variants[0]?.id ?? '',
      recommendationReason: response.data.recommendationReason,
    };
  }

  // Fallback: generate single variant
  logger.warn('Variant generation failed, using fallback');
  return fallbackVariant(context, decomposition);
}

/**
 * Build the variant generation prompt
 */
function buildVariantPrompt(
  context: PipelineContext,
  decomposition: DecompositionResult,
  variantCount: number
): string {
  const { intent, projectInfo, codeSnippets } = context;

  let prompt = `Generate ${variantCount} different solution variants for this task.

## Task Summary
${decomposition.summary}

## Subtasks
${decomposition.tasks.map((t) => `- [${t.type}] ${t.description} (${t.complexity} complexity)`).join('\n')}

## Intent
- Type: ${intent.primaryIntent}
- Keywords: ${intent.keywords.join(', ')}
`;

  if (projectInfo) {
    prompt += `
## Project Context
- Languages: ${projectInfo.languages.join(', ')}
- Frameworks: ${projectInfo.frameworks.join(', ')}
`;
  }

  if (codeSnippets.length > 0) {
    prompt += `
## Existing Code Context
${codeSnippets[0] ? `\`\`\`${codeSnippets[0].language}\n${codeSnippets[0].content.substring(0, 800)}\n\`\`\`` : ''}
`;
  }

  prompt += `
## Requirements
Generate ${variantCount} meaningfully different solutions. Each should:
1. Take a different approach or make different trade-offs
2. Be complete and production-ready
3. Include clear pros and cons
4. Specify the best use case

## Output Format
{
  "variants": [
    {
      "approach": "Brief description of the approach",
      "content": "The complete solution code or text",
      "pros": ["advantage 1", "advantage 2"],
      "cons": ["disadvantage 1", "disadvantage 2"],
      "useCase": "When to use this approach"
    }
  ],
  "recommendedIndex": 0,
  "recommendationReason": "Why this variant is recommended for most cases"
}`;

  return prompt;
}

/**
 * Fallback variant when LLM fails
 */
function fallbackVariant(
  context: PipelineContext,
  decomposition: DecompositionResult
): VariantGenerationResult {
  const variant: SolutionVariant = {
    id: generateId(),
    label: 'A',
    content: `// Solution for: ${decomposition.summary}
// 
// Tasks:
${decomposition.tasks.map((t) => `// - ${t.description}`).join('\n')}
//
// Implementation needed based on the specific requirements.
// This is a placeholder for the actual solution.

function solution() {
  // TODO: Implement based on task breakdown
  throw new Error('Not implemented');
}

export { solution };`,
    approach: 'Standard implementation approach',
    tradeoffs: {
      pros: ['Straightforward implementation', 'Easy to understand'],
      cons: ['May need refinement', 'Generic approach'],
    },
    useCase: 'General purpose implementation',
  };

  return {
    variants: [variant],
    recommendedVariantId: variant.id,
    recommendationReason: 'Single fallback variant generated',
  };
}

// ============================================================================
// Variant Analysis
// ============================================================================

/**
 * Compare variants and rank them
 */
export function rankVariants(
  variants: SolutionVariant[],
  criteria: RankingCriteria
): RankedVariant[] {
  return variants
    .map((variant) => ({
      variant,
      score: calculateVariantScore(variant, criteria),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({
      ...item.variant,
      rank: index + 1,
      score: item.score,
    }));
}

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
 * Calculate score for a variant based on criteria
 */
function calculateVariantScore(
  variant: SolutionVariant,
  criteria: RankingCriteria
): number {
  let score = 50; // Base score

  // Adjust based on pros/cons ratio
  const prosConsRatio = 
    variant.tradeoffs.pros.length / 
    Math.max(1, variant.tradeoffs.cons.length);
  score += Math.min(20, prosConsRatio * 10);

  // Adjust based on code length (simple heuristic)
  const codeLength = variant.content.length;
  if (codeLength < 500) {
    score += criteria.simplicityWeight * 15;
  } else if (codeLength > 2000) {
    score -= criteria.simplicityWeight * 10;
  }

  // Check for performance keywords
  const performanceKeywords = ['efficient', 'optimized', 'fast', 'cached', 'lazy'];
  const hasPerformanceFeatures = performanceKeywords.some((kw) =>
    variant.content.toLowerCase().includes(kw) ||
    variant.approach.toLowerCase().includes(kw)
  );
  if (hasPerformanceFeatures) {
    score += criteria.performanceWeight * 15;
  }

  // Check for maintainability indicators
  const maintainabilityKeywords = ['modular', 'clean', 'documented', 'typed', 'tested'];
  const hasMaintainabilityFeatures = maintainabilityKeywords.some((kw) =>
    variant.approach.toLowerCase().includes(kw)
  );
  if (hasMaintainabilityFeatures) {
    score += criteria.maintainabilityWeight * 15;
  }

  return Math.min(100, Math.max(0, score));
}

// ============================================================================
// Variant Diversity
// ============================================================================

/**
 * Ensure variants are sufficiently diverse
 */
export function checkVariantDiversity(variants: SolutionVariant[]): {
  isDiverse: boolean;
  similarityScore: number;
  suggestions: string[];
} {
  if (variants.length < 2) {
    return {
      isDiverse: true,
      similarityScore: 0,
      suggestions: [],
    };
  }

  // Simple diversity check based on approach descriptions
  const approaches = variants.map((v) => v.approach.toLowerCase());
  const uniqueWords = new Set<string>();
  const allWords: string[] = [];

  for (const approach of approaches) {
    const words = approach.split(/\s+/).filter((w) => w.length > 3);
    words.forEach((w) => uniqueWords.add(w));
    allWords.push(...words);
  }

  const diversityRatio = uniqueWords.size / Math.max(1, allWords.length);
  const isDiverse = diversityRatio > 0.5;

  const suggestions: string[] = [];
  if (!isDiverse) {
    suggestions.push('Consider approaches with different paradigms (functional vs OOP)');
    suggestions.push('Explore trade-offs between simplicity and features');
    suggestions.push('Consider different libraries or built-in alternatives');
  }

  return {
    isDiverse,
    similarityScore: 1 - diversityRatio,
    suggestions,
  };
}

/**
 * Merge best aspects of multiple variants
 */
export function synthesizeBestAspects(
  variants: SolutionVariant[]
): {
  combinedPros: string[];
  conflictingAspects: string[];
  synthesis: string;
} {
  const allPros = variants.flatMap((v) => v.tradeoffs.pros);
  const allCons = variants.flatMap((v) => v.tradeoffs.cons);

  // Find unique pros
  const uniquePros = [...new Set(allPros)];

  // Find conflicts (aspects that are pros in some variants but cons in others)
  const conflictingAspects = uniquePros.filter((pro) =>
    allCons.some((con) => 
      con.toLowerCase().includes(pro.toLowerCase().split(' ')[0] ?? '')
    )
  );

  const synthesis = `A synthesized solution could combine:
${uniquePros.slice(0, 5).map((p) => `- ${p}`).join('\n')}

While being mindful of:
${conflictingAspects.slice(0, 3).map((c) => `- ${c}`).join('\n') || '- No major conflicts identified'}`;

  return {
    combinedPros: uniquePros,
    conflictingAspects,
    synthesis,
  };
}
