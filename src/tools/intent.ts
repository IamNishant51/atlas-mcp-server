/**
 * Atlas Server - Intent Analysis Tool
 * 
 * Analyzes user queries to determine:
 * - Primary intent (what the user wants to accomplish)
 * - Entities (languages, frameworks, concepts mentioned)
 * - Whether clarification is needed
 * - Confidence level of the analysis
 */

import type { 
  IntentAnalysis, 
  IntentType, 
  ExtractedEntity 
} from '../types.js';
import { getOllamaClient, PromptTemplates } from './ollama.js';
import { logger, generateId } from '../utils.js';

// ============================================================================
// Constants (Module-level for performance)
// ============================================================================

/** Stop words for keyword extraction - defined once at module level */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'as', 'until',
  'while', 'although', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'please',
]);

// ============================================================================
// Intent Classification
// ============================================================================

/**
 * Keywords that indicate specific intent types (as Sets for O(1) lookup)
 */
const INTENT_KEYWORDS: Record<IntentType, Set<string>> = {
  code_generation: new Set(['create', 'write', 'generate', 'implement', 'build', 'make', 'add']),
  code_review: new Set(['review', 'check', 'analyze', 'audit', 'inspect', 'evaluate']),
  debugging: new Set(['fix', 'debug', 'error', 'bug', 'issue', 'problem', 'broken', 'not working']),
  refactoring: new Set(['refactor', 'improve', 'clean', 'restructure', 'reorganize', 'optimize']),
  explanation: new Set(['explain', 'what is', 'how does', 'why', 'understand', 'describe']),
  documentation: new Set(['document', 'docs', 'readme', 'comment', 'jsdoc', 'docstring']),
  testing: new Set(['test', 'spec', 'unit test', 'integration test', 'coverage', 'mock']),
  architecture: new Set(['architecture', 'design', 'structure', 'pattern', 'organize', 'system']),
  general_question: new Set(['?', 'can you', 'is it', 'should i', 'what if']),
  unknown: new Set(),
};

/**
 * Common programming entities for extraction
 */
const ENTITY_PATTERNS: Record<ExtractedEntity['type'], RegExp[]> = {
  language: [
    /\b(typescript|javascript|python|rust|go|java|c\+\+|ruby|php|swift|kotlin)\b/gi,
  ],
  framework: [
    /\b(react|vue|angular|next\.?js|express|fastify|django|flask|spring|rails)\b/gi,
  ],
  library: [
    /\b(axios|lodash|moment|dayjs|zod|prisma|mongoose|sequelize|redux|mobx)\b/gi,
  ],
  file: [
    /\b[\w-]+\.(ts|js|tsx|jsx|py|rs|go|java|rb|php|swift|kt|json|yaml|yml|md)\b/gi,
  ],
  function: [
    /\b(function|method|handler|callback|hook)\s+(\w+)/gi,
    /\b(\w+)\s*\(/g,
  ],
  concept: [
    /\b(api|rest|graphql|authentication|authorization|middleware|routing|state management)\b/gi,
  ],
};

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze a user query to determine intent
 */
export async function analyzeIntent(query: string): Promise<IntentAnalysis> {
  logger.debug({ queryLength: query.length }, 'Starting intent analysis');

  // First, do quick heuristic analysis
  const heuristicResult = heuristicAnalysis(query);
  
  // If confidence is high enough, skip LLM call
  if (heuristicResult.confidence >= 0.85) {
    logger.debug(
      { intent: heuristicResult.primaryIntent, confidence: heuristicResult.confidence },
      'Using heuristic analysis result'
    );
    return heuristicResult;
  }

  // Use LLM for deeper analysis
  try {
    const llmResult = await llmIntentAnalysis(query, heuristicResult);
    return llmResult;
  } catch (error) {
    logger.warn({ error }, 'LLM analysis failed, using heuristic result');
    return heuristicResult;
  }
}

/**
 * Fast heuristic-based intent analysis
 */
function heuristicAnalysis(query: string): IntentAnalysis {
  const normalizedQuery = query.toLowerCase();
  
  // Early return for empty/very short queries
  if (normalizedQuery.length < 3) {
    return createUnknownIntent(query);
  }
  
  // Determine primary intent from keywords
  let primaryIntent: IntentType = 'unknown';
  let maxScore = 0;

  for (const [intent, keywordSet] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywordSet) {
      if (normalizedQuery.includes(kw)) score++;
    }
    if (score > maxScore) {
      maxScore = score;
      primaryIntent = intent as IntentType;
    }
  }

  // Extract entities
  const entities = extractEntities(query);

  // Calculate confidence based on matches
  const hasEntities = entities.length > 0;
  const hasKeywordMatch = maxScore > 0;
  const confidence = calculateConfidence(hasKeywordMatch, hasEntities, maxScore);

  // Extract keywords from query
  const keywords = extractKeywords(query);

  // Determine if clarification is needed
  const requiresClarification = 
    primaryIntent === 'unknown' || 
    confidence < 0.5 ||
    query.length < 10;

  const clarifyingQuestions = requiresClarification
    ? generateClarifyingQuestions(primaryIntent, entities)
    : undefined;

  return {
    primaryIntent,
    confidence,
    entities,
    keywords,
    requiresClarification,
    clarifyingQuestions,
  };
}

/**
 * Create an unknown intent result for edge cases
 */
function createUnknownIntent(query: string): IntentAnalysis {
  return {
    primaryIntent: 'unknown',
    confidence: 0.1,
    entities: [],
    keywords: extractKeywords(query),
    requiresClarification: true,
    clarifyingQuestions: ['What would you like me to help you with?'],
  };
}

/**
 * LLM-enhanced intent analysis for complex queries
 */
async function llmIntentAnalysis(
  query: string,
  heuristicResult: IntentAnalysis
): Promise<IntentAnalysis> {
  const client = getOllamaClient();

  const prompt = `Analyze this developer query and extract intent information.

Query: "${query}"

Heuristic analysis suggests:
- Primary intent: ${heuristicResult.primaryIntent}
- Confidence: ${heuristicResult.confidence}
- Entities found: ${heuristicResult.entities.map((e) => e.value).join(', ') || 'none'}

Provide a JSON response with:
{
  "primaryIntent": "one of: code_generation, code_review, debugging, refactoring, explanation, documentation, testing, architecture, general_question",
  "confidence": 0.0 to 1.0,
  "keywords": ["key", "words", "from", "query"],
  "requiresClarification": true/false,
  "clarifyingQuestions": ["question 1", "question 2"] // only if requiresClarification is true
}`;

  const response = await client.generateJson<{
    primaryIntent: IntentType;
    confidence: number;
    keywords: string[];
    requiresClarification: boolean;
    clarifyingQuestions?: string[];
  }>(prompt, {
    systemPrompt: PromptTemplates.intentAnalysis,
    temperature: 0.3,
  });

  if (response.data) {
    return {
      primaryIntent: response.data.primaryIntent,
      confidence: Math.min(1, Math.max(0, response.data.confidence)),
      entities: heuristicResult.entities, // Keep heuristic entities
      keywords: response.data.keywords || heuristicResult.keywords,
      requiresClarification: response.data.requiresClarification,
      clarifyingQuestions: response.data.clarifyingQuestions,
    };
  }

  // Fallback to heuristic if parsing failed
  return heuristicResult;
}

/**
 * Extract entities from query text
 */
function extractEntities(query: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  for (const [type, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of patterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const value = match[1] ?? match[0];
        
        // Avoid duplicates
        if (!entities.some((e) => e.value.toLowerCase() === value.toLowerCase())) {
          entities.push({
            type: type as ExtractedEntity['type'],
            value,
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
          });
        }
      }
    }
  }

  return entities;
}

/**
 * Extract significant keywords from query
 */
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 10);
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  hasKeywordMatch: boolean,
  hasEntities: boolean,
  keywordScore: number
): number {
  let confidence = 0.3; // Base confidence

  if (hasKeywordMatch) {
    confidence += 0.3 + Math.min(0.2, keywordScore * 0.1);
  }

  if (hasEntities) {
    confidence += 0.2;
  }

  return Math.min(1, confidence);
}

/**
 * Generate clarifying questions based on intent
 */
function generateClarifyingQuestions(
  intent: IntentType,
  entities: ExtractedEntity[]
): string[] {
  const questions: string[] = [];

  if (intent === 'unknown') {
    questions.push('What would you like me to help you with?');
  }

  if (!entities.some((e) => e.type === 'language')) {
    questions.push('Which programming language are you working with?');
  }

  if (intent === 'code_generation' && !entities.some((e) => e.type === 'framework')) {
    questions.push('Are you using any specific framework or library?');
  }

  if (intent === 'debugging') {
    questions.push('Can you share the error message or unexpected behavior?');
  }

  return questions.slice(0, 3);
}

// ============================================================================
// Exports
// ============================================================================

export { INTENT_KEYWORDS, ENTITY_PATTERNS };
