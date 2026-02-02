/**
 * Atlas Server - Intent Analysis Tool
 *
 * Analyzes user queries to determine:
 * - Primary intent (what the user wants to accomplish)
 * - Entities (languages, frameworks, concepts mentioned)
 * - Whether clarification is needed
 * - Confidence level of the analysis
 */
import type { IntentAnalysis, IntentType, ExtractedEntity } from '../types.js';
/**
 * Keywords that indicate specific intent types
 */
declare const INTENT_KEYWORDS: Record<IntentType, string[]>;
/**
 * Common programming entities for extraction
 */
declare const ENTITY_PATTERNS: Record<ExtractedEntity['type'], RegExp[]>;
/**
 * Analyze a user query to determine intent
 */
export declare function analyzeIntent(query: string): Promise<IntentAnalysis>;
export { INTENT_KEYWORDS, ENTITY_PATTERNS };
//# sourceMappingURL=intent.d.ts.map