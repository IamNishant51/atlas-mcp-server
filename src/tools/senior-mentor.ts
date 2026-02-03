/**
 * Atlas Server - Senior Developer Mentor Tool
 * 
 * Helps junior/mid-level developers think like senior engineers
 * - Architectural decision analysis
 * - Code design patterns and trade-offs
 * - Performance optimization strategies
 * - Best practices and conventions
 * - Technical debt assessment
 * 
 * @module senior-mentor
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface SeniorMentorRequest {
  problem: string;
  context?: string;
  code?: string;
  language?: string;
  framework?: string;
  constraints?: string[];
  desiredOutcome?: string;
  currentApproach?: string;
}

export interface ArchitectureAnalysis {
  currentApproach: string;
  issues: ArchitectureIssue[];
  seniorPerspective: string;
  alternativeApproaches: AlternativeApproach[];
  recommendedPath: string;
  reasoning: string;
}

export interface ArchitectureIssue {
  severity: 'critical' | 'major' | 'minor';
  title: string;
  explanation: string;
  longTermImpact: string;
}

export interface AlternativeApproach {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  complexity: 'low' | 'medium' | 'high';
  scalability: 'poor' | 'good' | 'excellent';
  maintainability: 'poor' | 'fair' | 'good' | 'excellent';
  seniorRating: number; // 1-10
}

export interface MentorResult {
  analysis: ArchitectureAnalysis;
  seniorLessons: SeniorLesson[];
  actionItems: ActionItem[];
  readingRecommendations: Recommendation[];
  generatedAt: string;
}

export interface SeniorLesson {
  title: string;
  lesson: string;
  realWorldExample: string;
  whenToApply: string;
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  action: string;
  expectedBenefit: string;
  estimatedEffort: string;
  timeline: string;
}

export interface Recommendation {
  title: string;
  author?: string;
  type: 'article' | 'book' | 'course' | 'talk';
  relevance: number; // 1-10
  url?: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

const SeniorMentorRequestSchema = z.object({
  problem: z.string().min(20).max(2000),
  context: z.string().optional(),
  code: z.string().optional(),
  language: z.string().optional(),
  framework: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  desiredOutcome: z.string().optional(),
  currentApproach: z.string().optional(),
});

// ============================================================================
// Senior Mentor Analysis
// ============================================================================

/**
 * Analyze a problem from a senior developer's perspective
 */
export async function getMentorAnalysis(
  request: SeniorMentorRequest
): Promise<MentorResult> {
  const timer = createTimer();
  
  SeniorMentorRequestSchema.parse(request);
  
  logger.info(
    { problem: request.problem.substring(0, 100) },
    'Starting senior mentor analysis'
  );

  const analysis = await analyzeArchitecture(request);
  const lessons = generateSeniorLessons(analysis);
  const actionItems = createActionPlan(analysis);
  const recommendations = getReadingList(request);

  logger.info({ analysisTimeMs: timer.elapsed() }, 'Mentor analysis complete');

  return {
    analysis,
    seniorLessons: lessons,
    actionItems,
    readingRecommendations: recommendations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Analyze architectural decisions from senior perspective
 */
async function analyzeArchitecture(
  request: SeniorMentorRequest
): Promise<ArchitectureAnalysis> {
  if (!isNoLLMMode()) {
    try {
      return await analyzeWithAI(request);
    } catch (error) {
      logger.warn({ error }, 'AI analysis failed, using heuristic approach');
      return generateHeuristicAnalysis(request);
    }
  }

  return generateHeuristicAnalysis(request);
}

/**
 * AI-powered senior perspective analysis
 */
async function analyzeWithAI(request: SeniorMentorRequest): Promise<ArchitectureAnalysis> {
  const provider = await getActiveProvider();

  const prompt = `You are an extremely experienced senior frontend developer with 15+ years of experience.
Analyze this problem from a senior perspective:

Problem: ${request.problem}

${request.currentApproach ? `Current Approach: ${request.currentApproach}` : ''}
${request.code ? `Code:\n${request.code}` : ''}
${request.context ? `Context: ${request.context}` : ''}
${request.constraints?.length ? `Constraints:\n${request.constraints.join('\n')}` : ''}

Provide:
1. Assessment of current approach (if provided)
2. Key architectural issues
3. 3-5 alternative approaches with pros/cons
4. Recommended path forward
5. Senior reasoning for the recommendation

Focus on:
- Scalability and maintainability
- Team velocity and developer experience
- Long-term technical debt implications
- Industry best practices
- Real-world trade-offs`;

  const result = await provider.completeJson<ArchitectureAnalysis>(prompt);

  if (result.data) {
    return result.data;
  }

  return generateHeuristicAnalysis(request);
}

/**
 * Heuristic-based analysis (no LLM)
 */
function generateHeuristicAnalysis(
  request: SeniorMentorRequest
): ArchitectureAnalysis {
  const issues: ArchitectureIssue[] = [];

  // Detect common junior developer mistakes
  if (request.currentApproach?.toLowerCase().includes('callback')) {
    issues.push({
      severity: 'major',
      title: 'Callback Hell Pattern',
      explanation: 'Deeply nested callbacks make code hard to read and maintain.',
      longTermImpact: 'Will cause refactoring pain as codebase grows',
    });
  }

  if (request.currentApproach?.toLowerCase().includes('global') ||
      request.currentApproach?.toLowerCase().includes('window.')) {
    issues.push({
      severity: 'critical',
      title: 'Global State Management',
      explanation: 'Global variables create hidden dependencies and make testing difficult.',
      longTermImpact: 'Hard to test, debug, and scale. Creates tight coupling.',
    });
  }

  if (request.code?.includes('any')) {
    issues.push({
      severity: 'major',
      title: 'Type Looseness (any)',
      explanation: 'Using "any" defeats the purpose of TypeScript.',
      longTermImpact: 'Loses type safety benefits and makes refactoring risky.',
    });
  }

  const approaches: AlternativeApproach[] = [
    {
      name: 'Modern Async Patterns',
      description: 'Use async/await instead of callbacks or promises',
      pros: [
        'More readable and maintainable',
        'Better error handling with try-catch',
        'Similar to synchronous code structure',
        'Easier to debug',
      ],
      cons: [
        'Requires understanding of event loop',
        'Can lead to sequential execution when parallel is needed',
      ],
      complexity: 'low',
      scalability: 'excellent',
      maintainability: 'excellent',
      seniorRating: 9,
    },
    {
      name: 'State Management Library',
      description: 'Use Redux, Zustand, or Jotai for predictable state',
      pros: [
        'Single source of truth',
        'Time-travel debugging',
        'Testable state logic',
        'Developer tools available',
      ],
      cons: [
        'Initial boilerplate',
        'Learning curve',
        'Can be overkill for small apps',
      ],
      complexity: 'medium',
      scalability: 'excellent',
      maintainability: 'excellent',
      seniorRating: 8,
    },
  ];

  return {
    currentApproach: request.currentApproach || 'Not specified',
    issues,
    seniorPerspective: 'Think long-term: what will this look like when the codebase is 10x larger?',
    alternativeApproaches: approaches,
    recommendedPath: 'Modern async patterns with proper state management',
    reasoning: 'Balances readability, testability, and scalability',
  };
}

/**
 * Generate senior developer lessons
 */
function generateSeniorLessons(analysis: ArchitectureAnalysis): SeniorLesson[] {
  return [
    {
      title: 'Think in Systems, Not Features',
      lesson:
        'Senior developers design systems that can evolve. They ask: "How will this scale to 100 developers?" not "Does this work today?"',
      realWorldExample:
        'Instead of just building a component, design a component system with hooks, patterns, and conventions that others can follow.',
      whenToApply: 'Every architectural decision. Always think 3-5 years ahead.',
    },
    {
      title: 'Trade-offs Over Silver Bullets',
      lesson:
        'There is no perfect solution. Good architecture is about making informed trade-offs and documenting them.',
      realWorldExample:
        'Redux adds complexity but gives you time-travel debugging and predictability. The trade-off is worth it for large teams.',
      whenToApply: 'When evaluating solutions, list pros/cons and discuss with team.',
    },
    {
      title: 'DRY is Not Always Right',
      lesson:
        'Avoid premature abstraction. Three instances means you might need a helper. Two instances might just be coincidence.',
      realWorldExample:
        'Extracting too early creates abstractions that hide important differences and become hard to maintain.',
      whenToApply: 'When refactoring, wait for the third similar pattern before abstracting.',
    },
    {
      title: 'Testability is a Design Metric',
      lesson:
        'If code is hard to test, it is usually badly designed. Use testability as feedback for architecture.',
      realWorldExample:
        'Complex components that are hard to test usually have too many responsibilities. Break them into smaller pieces.',
      whenToApply: 'When writing code, write tests first. If tests are hard to write, redesign.',
    },
    {
      title: 'Communicate Constraints',
      lesson:
        'Senior developers explicitly state constraints and assumptions. This prevents misunderstandings later.',
      realWorldExample:
        'Document: "This component assumes items are immutable" or "Performance budget: < 100ms"',
      whenToApply: 'In code comments, PR descriptions, and architecture documents.',
    },
  ];
}

/**
 * Create actionable next steps
 */
function createActionPlan(analysis: ArchitectureAnalysis): ActionItem[] {
  return [
    {
      priority: 'high',
      action: 'Refactor critical paths first',
      expectedBenefit: 'Reduce bugs and improve maintainability in high-impact areas',
      estimatedEffort: '1-2 weeks',
      timeline: 'Next sprint',
    },
    {
      priority: 'high',
      action: 'Add comprehensive test coverage',
      expectedBenefit: 'Prevent regressions and enable safer refactoring',
      estimatedEffort: '2-3 weeks',
      timeline: 'Next 2 sprints',
    },
    {
      priority: 'medium',
      action: 'Document architecture decisions',
      expectedBenefit: 'New team members understand rationale, reduce repeated discussions',
      estimatedEffort: '3-5 days',
      timeline: 'This week',
    },
    {
      priority: 'medium',
      action: 'Establish code review process',
      expectedBenefit: 'Share knowledge across team, maintain consistency',
      estimatedEffort: '2 days setup',
      timeline: 'Start immediately',
    },
    {
      priority: 'low',
      action: 'Create internal knowledge base',
      expectedBenefit: 'Accelerate onboarding, reduce context switching',
      estimatedEffort: '4-6 weeks',
      timeline: 'Ongoing effort',
    },
  ];
}

/**
 * Recommend learning resources
 */
function getReadingList(request: SeniorMentorRequest): Recommendation[] {
  const recommendations: Recommendation[] = [
    {
      title: 'Software Architecture Patterns',
      author: 'Mark Richards',
      type: 'book',
      relevance: 10,
      url: 'https://www.oreilly.com/library/view/software-architecture-patterns/9781491971437/',
    },
    {
      title: 'Designing Data-Intensive Applications',
      author: 'Martin Kleppmann',
      type: 'book',
      relevance: 9,
      url: 'https://dataintensive.net/',
    },
    {
      title: 'The Pragmatic Programmer',
      author: 'David Thomas & Andrew Hunt',
      type: 'book',
      relevance: 9,
    },
    {
      title: 'Thinking in Systems',
      author: 'Donella Meadows',
      type: 'book',
      relevance: 8,
    },
  ];

  // Add framework-specific resources
  if (request.framework?.toLowerCase().includes('react')) {
    recommendations.push({
      title: 'Advanced React Patterns',
      type: 'course',
      relevance: 8,
      url: 'https://epicreact.dev/',
    });
  }

  return recommendations;
}

// ============================================================================
// Export
// ============================================================================

export default getMentorAnalysis;
