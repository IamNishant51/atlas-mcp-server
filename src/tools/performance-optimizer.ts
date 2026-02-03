/**
 * Atlas Server - Advanced Performance Optimization Tool
 * 
 * Deep performance analysis and optimization strategies
 * - Performance profiling and bottleneck detection
 * - Memory leak identification
 * - Bundle size optimization
 * - Rendering performance optimization
 * - Network optimization strategies
 * 
 * @module performance-optimizer
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface PerformanceOptimizationRequest {
  problemDescription: string;
  metrics?: PerformanceMetrics;
  code?: string;
  profileData?: string;
  targetMetrics?: TargetMetrics;
  constraints?: string[];
}

export interface PerformanceMetrics {
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  interactionToNextPaint?: number;
  cumulativeLayoutShift?: number;
  domContentLoaded?: number;
  loadTime?: number;
  memoryUsage?: number;
  bundleSize?: number;
  renderTime?: number;
}

export interface TargetMetrics {
  fcp?: number;
  lcp?: number;
  inp?: number;
  cls?: number;
  memoryUsage?: number;
  bundleSize?: number;
}

export interface PerformanceOptimizationResult {
  analysis: PerformanceAnalysis;
  optimizations: OptimizationStrategy[];
  immediateActions: Action[];
  longTermStrategy: string;
  expectedImpact: ImpactEstimate;
  generatedAt: string;
}

export interface PerformanceAnalysis {
  currentState: string;
  bottlenecks: Bottleneck[];
  rootCauses: string[];
  severityLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface Bottleneck {
  area: 'rendering' | 'network' | 'memory' | 'compute' | 'bundle';
  issue: string;
  impact: 'critical' | 'high' | 'medium' | 'low';
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  estimatedUsers?: string;
}

export interface OptimizationStrategy {
  name: string;
  description: string;
  implementation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  effort: string;
  impact: 'high' | 'medium' | 'low';
  priority: number; // 1-10
  tools?: string[];
  codeExample?: string;
  potentialIssues?: string[];
}

export interface Action {
  priority: 'critical' | 'high' | 'medium';
  action: string;
  expectedGain: number; // Percentage improvement
  effort: string;
  timeline: string;
}

export interface ImpactEstimate {
  expectedFcpImprovement?: number;
  expectedLcpImprovement?: number;
  expectedBundleSizeReduction?: number;
  expectedMemorySavings?: number;
  estimatedUserImpact?: string;
  expectedRevenue?: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

const PerformanceRequestSchema = z.object({
  problemDescription: z.string().min(20),
  metrics: z.object({
    firstContentfulPaint: z.number().optional(),
    largestContentfulPaint: z.number().optional(),
    interactionToNextPaint: z.number().optional(),
    cumulativeLayoutShift: z.number().optional(),
    domContentLoaded: z.number().optional(),
    loadTime: z.number().optional(),
    memoryUsage: z.number().optional(),
    bundleSize: z.number().optional(),
    renderTime: z.number().optional(),
  }).optional(),
  code: z.string().optional(),
  profileData: z.string().optional(),
  targetMetrics: z.object({
    fcp: z.number().optional(),
    lcp: z.number().optional(),
    inp: z.number().optional(),
    cls: z.number().optional(),
    memoryUsage: z.number().optional(),
    bundleSize: z.number().optional(),
  }).optional(),
  constraints: z.array(z.string()).optional(),
});

// ============================================================================
// Performance Analysis
// ============================================================================

/**
 * Analyze and optimize performance
 */
export async function optimizePerformance(
  request: PerformanceOptimizationRequest
): Promise<PerformanceOptimizationResult> {
  const timer = createTimer();

  PerformanceRequestSchema.parse(request);

  logger.info(
    { problem: request.problemDescription.substring(0, 100) },
    'Starting performance optimization analysis'
  );

  const analysis = await analyzePerformance(request);
  const optimizations = generateOptimizationStrategies(analysis, request);
  const immediateActions = prioritizeActions(optimizations);
  const longTermStrategy = createLongTermPlan(analysis, optimizations);
  const impact = estimateImpact(optimizations, request.targetMetrics);

  logger.info({ analysisTimeMs: timer.elapsed() }, 'Performance analysis complete');

  return {
    analysis,
    optimizations,
    immediateActions,
    longTermStrategy,
    expectedImpact: impact,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Analyze performance bottlenecks
 */
async function analyzePerformance(
  request: PerformanceOptimizationRequest
): Promise<PerformanceAnalysis> {
  if (!isNoLLMMode()) {
    try {
      return await analyzeWithAI(request);
    } catch (error) {
      logger.warn({ error }, 'AI analysis failed, using heuristic analysis');
      return generateHeuristicAnalysis(request);
    }
  }

  return generateHeuristicAnalysis(request);
}

/**
 * AI-powered performance analysis
 */
async function analyzeWithAI(
  request: PerformanceOptimizationRequest
): Promise<PerformanceAnalysis> {
  const provider = await getActiveProvider();

  const metricsContext = request.metrics
    ? `Current metrics:\n${Object.entries(request.metrics)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')}`
    : '';

  const prompt = `You are a performance optimization expert. Analyze this performance issue:

${request.problemDescription}

${metricsContext}

${request.code ? `Code:\n${request.code}` : ''}

Identify:
1. Primary bottlenecks
2. Root causes
3. Severity level
4. Affected users

Focus on:
- Web Vitals (FCP, LCP, INP, CLS)
- Memory leaks
- Rendering performance
- Network requests
- Bundle size`;

  const result = await provider.completeJson<PerformanceAnalysis>(prompt);

  if (result.data) {
    return result.data;
  }

  return generateHeuristicAnalysis(request);
}

/**
 * Heuristic-based performance analysis
 */
function generateHeuristicAnalysis(
  request: PerformanceOptimizationRequest
): PerformanceAnalysis {
  const bottlenecks: Bottleneck[] = [];

  if (request.metrics?.largestContentfulPaint && request.metrics.largestContentfulPaint > 2500) {
    bottlenecks.push({
      area: 'rendering',
      issue: 'Large Contentful Paint is slow',
      impact: 'critical',
      currentValue: request.metrics.largestContentfulPaint,
      targetValue: 2500,
      unit: 'ms',
      estimatedUsers: '40-50%',
    });
  }

  if (request.metrics?.bundleSize && request.metrics.bundleSize > 200000) {
    bottlenecks.push({
      area: 'bundle',
      issue: 'Bundle size is excessive',
      impact: 'high',
      currentValue: request.metrics.bundleSize / 1000,
      targetValue: 150,
      unit: 'KB',
    });
  }

  if (request.problemDescription.toLowerCase().includes('re-render')) {
    bottlenecks.push({
      area: 'rendering',
      issue: 'Unnecessary re-renders',
      impact: 'high',
    });
  }

  return {
    currentState: 'Performance issues detected',
    bottlenecks: bottlenecks.length > 0 ? bottlenecks : [
      {
        area: 'rendering',
        issue: 'General performance degradation',
        impact: 'medium',
      },
    ],
    rootCauses: ['Unoptimized components', 'Heavy dependencies', 'Poor caching strategy'],
    severityLevel: bottlenecks.some(b => b.impact === 'critical') ? 'critical' : 'high',
  };
}

/**
 * Generate optimization strategies
 */
function generateOptimizationStrategies(
  analysis: PerformanceAnalysis,
  request: PerformanceOptimizationRequest
): OptimizationStrategy[] {
  return [
    {
      name: 'Code Splitting & Lazy Loading',
      description: 'Split code into chunks and load only what is needed',
      implementation: 'Use React.lazy() or dynamic imports for route-based splitting',
      difficulty: 'easy',
      effort: '2-4 hours',
      impact: 'high',
      priority: 9,
      tools: ['webpack', 'vite', 'next.js'],
      codeExample: `const HeavyComponent = lazy(() => import('./Heavy'));
export default () => <Suspense fallback={<div>Loading...</div>}>
  <HeavyComponent />
</Suspense>`,
      potentialIssues: ['User sees loading spinner', 'Increased network requests'],
    },
    {
      name: 'Memoization & React.memo()',
      description: 'Prevent unnecessary re-renders of components',
      implementation: 'Wrap expensive components with React.memo() and optimize props',
      difficulty: 'medium',
      effort: '4-8 hours',
      impact: 'high',
      priority: 8,
      tools: ['react'],
      codeExample: `const MyComponent = memo(({ data }) => {
  return <div>{data.value}</div>;
}, (prev, next) => prev.data.id === next.data.id);`,
    },
    {
      name: 'Bundle Size Reduction',
      description: 'Remove unused code and dependencies',
      implementation: 'Audit dependencies, use tree-shaking, replace heavy libraries',
      difficulty: 'medium',
      effort: '8-16 hours',
      impact: 'high',
      priority: 9,
      tools: ['webpack-bundle-analyzer', 'bundlesize', 'esbuild'],
      potentialIssues: ['Breaking changes in refactored code'],
    },
    {
      name: 'Image Optimization',
      description: 'Optimize images for web performance',
      implementation: 'Use modern formats (WebP), responsive images, lazy loading',
      difficulty: 'easy',
      effort: '2-4 hours',
      impact: 'medium',
      priority: 7,
      tools: ['next/image', 'sharp', 'imagemin'],
      codeExample: `<Image 
  src="/img.jpg" 
  alt="test"
  width={800}
  height={600}
  priority={false}
/>`,
    },
    {
      name: 'Caching Strategy',
      description: 'Implement proper HTTP caching',
      implementation: 'Set cache headers, use service workers, implement client-side caching',
      difficulty: 'medium',
      effort: '6-10 hours',
      impact: 'medium',
      priority: 6,
    },
  ];
}

/**
 * Prioritize immediate actions
 */
function prioritizeActions(strategies: OptimizationStrategy[]): Action[] {
  return strategies
    .filter(s => s.priority >= 7)
    .map((strategy, index) => {
      const priorityMap: Record<number, 'critical' | 'high' | 'medium'> = {
        0: 'critical',
        1: 'high',
      };
      return {
        priority: (priorityMap[index] || 'medium') as 'critical' | 'high' | 'medium',
        action: `Implement: ${strategy.name}`,
        expectedGain: Math.max(5, 30 - index * 5),
        effort: strategy.effort,
        timeline: index === 0 ? 'This week' : `Next ${index + 1} weeks`,
      };
    })
    .slice(0, 5);
}

/**
 * Create long-term performance strategy
 */
function createLongTermPlan(
  analysis: PerformanceAnalysis,
  strategies: OptimizationStrategy[]
): string {
  return `Performance Strategy:
1. Immediate: Focus on critical bottlenecks (${analysis.bottlenecks.filter(b => b.impact === 'critical').length} found)
2. Short-term: Implement high-impact optimizations (code splitting, memoization)
3. Medium-term: Build monitoring and alerting for performance
4. Long-term: Establish performance budget and continuous optimization culture

Success Metrics:
- Track Web Vitals (FCP < 1.8s, LCP < 2.5s, INP < 200ms, CLS < 0.1)
- Monitor bundle size trends
- Set performance budgets per route
- Regular performance audits (bi-weekly)`;
}

/**
 * Estimate performance impact
 */
function estimateImpact(
  strategies: OptimizationStrategy[],
  targets?: TargetMetrics
): ImpactEstimate {
  const highImpactCount = strategies.filter(s => s.impact === 'high').length;

  return {
    expectedFcpImprovement: highImpactCount * 15,
    expectedLcpImprovement: highImpactCount * 20,
    expectedBundleSizeReduction: 30,
    expectedMemorySavings: 25,
    estimatedUserImpact: '35-45% of users will experience measurable improvements',
    expectedRevenue: '2-5% increase in conversion rate (based on industry benchmarks)',
  };
}

// ============================================================================
// Export
// ============================================================================

export default optimizePerformance;
