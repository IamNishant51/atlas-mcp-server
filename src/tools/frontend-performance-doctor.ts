/**
 * Frontend Performance Doctor
 * 
 * Analyzes frontend code and provides specific fixes for performance issues:
 * - React/Vue re-render detection and fixes
 * - Bundle size optimization recommendations
 * - Lazy loading opportunities
 * - Image optimization strategies
 * - Memory leak detection
 * - Core Web Vitals improvement suggestions
 */

import { z } from 'zod';
import { getActiveProvider } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PerformanceIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'render' | 'bundle' | 'network' | 'memory' | 'animation' | 'images' | 'fonts';
  title: string;
  description: string;
  impact: string;
  location?: string;
  currentCode?: string;
  fixedCode?: string;
  estimatedImprovement: string;
}

export interface BundleAnalysis {
  totalSize: string;
  largestModules: Array<{
    name: string;
    size: string;
    suggestion: string;
  }>;
  unusedExports: string[];
  duplicateDependencies: string[];
  treeshakingOpportunities: string[];
}

export interface CoreWebVitals {
  lcp: { score: string; issues: string[]; fixes: string[] };
  fid: { score: string; issues: string[]; fixes: string[] };
  cls: { score: string; issues: string[]; fixes: string[] };
  ttfb: { score: string; issues: string[]; fixes: string[] };
}

export interface PerformanceReport {
  summary: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    criticalIssues: number;
    totalIssues: number;
  };
  issues: PerformanceIssue[];
  bundleAnalysis: BundleAnalysis;
  coreWebVitals: CoreWebVitals;
  quickWins: string[];
  longTermOptimizations: string[];
  generatedOptimizations: {
    lazyLoadingCode?: string;
    memoizationCode?: string;
    imageOptimizationConfig?: string;
    webpackConfig?: string;
  };
}

export interface PerformanceRequest {
  code: string;
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'next' | 'nuxt';
  analysisType?: 'full' | 'render' | 'bundle' | 'network' | 'quick';
  includeFixedCode?: boolean;
  targetMetrics?: string[];
}

// ============================================================================
// Validation Schema
// ============================================================================

export const PerformanceRequestSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  framework: z.enum(['react', 'vue', 'angular', 'svelte', 'next', 'nuxt']),
  analysisType: z.enum(['full', 'render', 'bundle', 'network', 'quick']).optional().default('full'),
  includeFixedCode: z.boolean().optional().default(true),
  targetMetrics: z.array(z.string()).optional()
});

// ============================================================================
// Performance Patterns Database
// ============================================================================

const PERFORMANCE_PATTERNS = {
  react: {
    unnecessaryRerenders: {
      patterns: [
        /onClick=\{[^}]*\(\)\s*=>/g,  // Inline arrow functions
        /style=\{\{[^}]+\}\}/g,        // Inline style objects
        /\[\s*\.\.\.\w+\s*\]/g,        // Spread in render
      ],
      fix: 'Use useCallback, useMemo, or extract to component level'
    },
    missingMemoization: {
      patterns: [
        /const\s+\w+\s*=\s*\w+\.filter\(/g,
        /const\s+\w+\s*=\s*\w+\.map\(/g,
        /const\s+\w+\s*=\s*\w+\.reduce\(/g,
      ],
      fix: 'Wrap expensive computations in useMemo'
    },
    missingLazyLoading: {
      patterns: [
        /import\s+\w+\s+from\s+['"][^'"]+['"];?\s*\/\/\s*large/gi,
        /import\s+{\s*\w+\s*}\s+from\s+['"]@mui/g,
        /import\s+\w+\s+from\s+['"]lodash['"];?/g,
      ],
      fix: 'Use React.lazy() and dynamic imports'
    }
  },
  vue: {
    unnecessaryReactivity: {
      patterns: [
        /ref\([^)]*\)/g,
        /reactive\([^)]*\)/g,
      ],
      fix: 'Use shallowRef or shallowReactive for large objects'
    },
    missingComputed: {
      patterns: [
        /\.value\.filter\(/g,
        /\.value\.map\(/g,
      ],
      fix: 'Use computed() for derived state'
    }
  }
};

const BUNDLE_OPTIMIZATIONS = {
  'lodash': {
    issue: 'Full lodash import adds ~70KB',
    fix: "import debounce from 'lodash/debounce'",
    savings: '~65KB'
  },
  'moment': {
    issue: 'Moment.js is heavy (~300KB with locales)',
    fix: "Replace with dayjs or date-fns",
    savings: '~280KB'
  },
  '@mui/material': {
    issue: 'Full MUI import prevents tree-shaking',
    fix: "import Button from '@mui/material/Button'",
    savings: '~100KB+'
  },
  'antd': {
    issue: 'Full Ant Design import is heavy',
    fix: "Use babel-plugin-import for on-demand loading",
    savings: '~200KB+'
  }
};

// ============================================================================
// Main Functions
// ============================================================================

export async function analyzePerformance(request: PerformanceRequest): Promise<PerformanceReport> {
  const validated = PerformanceRequestSchema.parse(request);
  logger.info(`Analyzing performance for ${validated.framework} code`);

  const issues: PerformanceIssue[] = [];
  let issueId = 1;

  // Analyze re-render issues
  const renderIssues = analyzeRenderPerformance(validated.code, validated.framework, issueId);
  issues.push(...renderIssues);
  issueId += renderIssues.length;

  // Analyze bundle size
  const bundleIssues = analyzeBundleSize(validated.code, issueId);
  issues.push(...bundleIssues);
  issueId += bundleIssues.length;

  // Analyze network patterns
  const networkIssues = analyzeNetworkPatterns(validated.code, issueId);
  issues.push(...networkIssues);
  issueId += networkIssues.length;

  // Analyze memory patterns
  const memoryIssues = analyzeMemoryPatterns(validated.code, validated.framework, issueId);
  issues.push(...memoryIssues);
  issueId += memoryIssues.length;

  // Analyze images
  const imageIssues = analyzeImageUsage(validated.code, issueId);
  issues.push(...imageIssues);

  // Try to get AI-powered deep analysis
  const provider = await getActiveProvider();
  if (provider) {
    const aiAnalysis = await getAIPerformanceAnalysis(provider, validated);
    if (aiAnalysis.additionalIssues) {
      issues.push(...aiAnalysis.additionalIssues);
    }
  }

  // Generate bundle analysis
  const bundleAnalysis = generateBundleAnalysis(validated.code);

  // Generate Core Web Vitals analysis
  const coreWebVitals = analyzeCoreWebVitals(validated.code, validated.framework);

  // Calculate score
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const highCount = issues.filter(i => i.severity === 'high').length;
  const mediumCount = issues.filter(i => i.severity === 'medium').length;
  
  let score = 100;
  score -= criticalCount * 20;
  score -= highCount * 10;
  score -= mediumCount * 5;
  score = Math.max(0, score);

  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  // Generate optimized code snippets
  const generatedOptimizations = validated.includeFixedCode 
    ? generateOptimizedCode(validated.code, validated.framework, issues)
    : {};

  // Generate quick wins and long-term recommendations
  const quickWins = generateQuickWins(issues);
  const longTermOptimizations = generateLongTermOptimizations(issues, validated.framework);

  return {
    summary: {
      score,
      grade,
      criticalIssues: criticalCount,
      totalIssues: issues.length
    },
    issues,
    bundleAnalysis,
    coreWebVitals,
    quickWins,
    longTermOptimizations,
    generatedOptimizations
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeRenderPerformance(code: string, framework: string, startId: number): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  let id = startId;

  if (framework === 'react' || framework === 'next') {
    // Check for inline arrow functions in JSX
    const inlineArrowRegex = /onClick=\{(?:\([^)]*\))?\s*=>\s*[^}]+\}/g;
    const inlineMatches = code.match(inlineArrowRegex);
    if (inlineMatches && inlineMatches.length > 2) {
      issues.push({
        id: `PERF-${id++}`,
        severity: 'high',
        category: 'render',
        title: 'Inline Arrow Functions in JSX',
        description: `Found ${inlineMatches.length} inline arrow functions in event handlers. These create new function references on every render.`,
        impact: 'Causes unnecessary re-renders of child components, especially with React.memo',
        currentCode: inlineMatches[0],
        fixedCode: `// Before: onClick={() => handleClick(id)}
// After:
const handleClickMemo = useCallback((id) => {
  // handler logic
}, [/* dependencies */]);

// In JSX:
onClick={handleClickMemo}`,
        estimatedImprovement: '10-30% fewer re-renders'
      });
    }

    // Check for inline style objects
    const inlineStyleRegex = /style=\{\{[^}]+\}\}/g;
    const styleMatches = code.match(inlineStyleRegex);
    if (styleMatches && styleMatches.length > 3) {
      issues.push({
        id: `PERF-${id++}`,
        severity: 'medium',
        category: 'render',
        title: 'Inline Style Objects',
        description: `Found ${styleMatches.length} inline style objects. Each creates a new object on every render.`,
        impact: 'Breaks memoization and causes unnecessary re-renders',
        currentCode: styleMatches[0],
        fixedCode: `// Before: style={{ marginTop: 10, color: 'red' }}
// After:
const styles = useMemo(() => ({
  marginTop: 10,
  color: 'red'
}), []);
// Or use CSS classes/CSS-in-JS`,
        estimatedImprovement: '5-15% fewer re-renders'
      });
    }

    // Check for missing React.memo on components
    if (!code.includes('React.memo') && !code.includes('memo(') && code.includes('export')) {
      const hasProps = /function\s+\w+\s*\(\s*\{\s*\w+/g.test(code) || /const\s+\w+\s*=\s*\(\s*\{\s*\w+/g.test(code);
      if (hasProps) {
        issues.push({
          id: `PERF-${id++}`,
          severity: 'medium',
          category: 'render',
          title: 'Component Not Memoized',
          description: 'Component receives props but is not wrapped in React.memo',
          impact: 'Component re-renders whenever parent re-renders, even if props unchanged',
          fixedCode: `// Wrap component export:
export default React.memo(YourComponent);

// Or with comparison function:
export default React.memo(YourComponent, (prevProps, nextProps) => {
  return prevProps.id === nextProps.id;
});`,
          estimatedImprovement: '20-50% fewer re-renders'
        });
      }
    }

    // Check for expensive computations in render
    const expensiveOps = code.match(/(?:\.filter\(|\.map\(|\.reduce\(|\.sort\(|\.find\()[^)]+\)/g);
    if (expensiveOps && expensiveOps.length > 0) {
      const notMemoized = !code.includes('useMemo');
      if (notMemoized) {
        issues.push({
          id: `PERF-${id++}`,
          severity: 'high',
          category: 'render',
          title: 'Expensive Computation in Render',
          description: `Found ${expensiveOps.length} array operations that run on every render`,
          impact: 'Blocks main thread and slows down UI responsiveness',
          currentCode: expensiveOps[0],
          fixedCode: `// Wrap in useMemo:
const filteredItems = useMemo(() => {
  return items.filter(item => item.active);
}, [items]);

const sortedItems = useMemo(() => {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}, [items]);`,
          estimatedImprovement: '30-70% faster renders'
        });
      }
    }
  }

  if (framework === 'vue' || framework === 'nuxt') {
    // Check for missing computed properties
    if (code.includes('.value.filter(') || code.includes('.value.map(')) {
      if (!code.includes('computed(')) {
        issues.push({
          id: `PERF-${id++}`,
          severity: 'high',
          category: 'render',
          title: 'Missing Computed Properties',
          description: 'Derived state calculated directly from reactive refs',
          impact: 'Recalculates on every access instead of caching',
          fixedCode: `// Before: items.value.filter(i => i.active)
// After:
const activeItems = computed(() => {
  return items.value.filter(i => i.active);
});`,
          estimatedImprovement: '40-60% fewer calculations'
        });
      }
    }

    // Check for v-if with v-for
    if (code.includes('v-for') && code.includes('v-if')) {
      issues.push({
        id: `PERF-${id++}`,
        severity: 'medium',
        category: 'render',
        title: 'v-if with v-for Anti-pattern',
        description: 'Using v-if and v-for on the same element',
        impact: 'v-for has higher priority, causing unnecessary iterations',
        fixedCode: `<!-- Before: <li v-for="item in items" v-if="item.active"> -->
<!-- After: Use computed or wrap in template -->
<template v-for="item in items" :key="item.id">
  <li v-if="item.active">{{ item.name }}</li>
</template>

<!-- Or better, use computed: -->
const activeItems = computed(() => items.filter(i => i.active));`,
        estimatedImprovement: '20-40% faster list renders'
      });
    }
  }

  return issues;
}

function analyzeBundleSize(code: string, startId: number): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  let id = startId;

  for (const [pkg, info] of Object.entries(BUNDLE_OPTIMIZATIONS)) {
    if (code.includes(`from '${pkg}'`) || code.includes(`from "${pkg}"`)) {
      // Check if it's a barrel import
      const barrelImport = new RegExp(`import\\s+{[^}]+}\\s+from\\s+['"]${pkg}['"]`);
      const defaultImport = new RegExp(`import\\s+\\w+\\s+from\\s+['"]${pkg}['"]`);
      
      if (barrelImport.test(code) || defaultImport.test(code)) {
        issues.push({
          id: `PERF-${id++}`,
          severity: 'high',
          category: 'bundle',
          title: `Heavy Import: ${pkg}`,
          description: info.issue,
          impact: `Adding unnecessary ${info.savings} to your bundle`,
          fixedCode: info.fix,
          estimatedImprovement: `Save ${info.savings}`
        });
      }
    }
  }

  // Check for missing dynamic imports
  const heavyImports = code.match(/import\s+\w+\s+from\s+['"][^'"]+['"]/g) || [];
  if (heavyImports.length > 10) {
    issues.push({
      id: `PERF-${id++}`,
      severity: 'medium',
      category: 'bundle',
      title: 'Many Static Imports',
      description: `${heavyImports.length} static imports found. Consider code-splitting.`,
      impact: 'Large initial bundle size, slower page load',
      fixedCode: `// Convert static imports to dynamic:
// Before: import HeavyComponent from './HeavyComponent';

// After (React):
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

// After (Vue):
const HeavyComponent = defineAsyncComponent(() => 
  import('./HeavyComponent.vue')
);

// After (Next.js):
import dynamic from 'next/dynamic';
const HeavyComponent = dynamic(() => import('./HeavyComponent'));`,
      estimatedImprovement: '30-50% smaller initial bundle'
    });
  }

  return issues;
}

function analyzeNetworkPatterns(code: string, startId: number): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  let id = startId;

  // Check for fetch without caching
  if (code.includes('fetch(') && !code.includes('cache')) {
    issues.push({
      id: `PERF-${id++}`,
      severity: 'medium',
      category: 'network',
      title: 'Fetch Without Caching Strategy',
      description: 'API calls made without caching configuration',
      impact: 'Redundant network requests, slower perceived performance',
      fixedCode: `// Add caching with React Query or SWR:
import { useQuery } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['users'],
  queryFn: () => fetch('/api/users').then(r => r.json()),
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
});

// Or with SWR:
import useSWR from 'swr';
const { data } = useSWR('/api/users', fetcher, {
  revalidateOnFocus: false,
  dedupingInterval: 60000,
});`,
      estimatedImprovement: '50-80% fewer API calls'
    });
  }

  // Check for waterfall requests
  const fetchCalls = (code.match(/await\s+fetch\(/g) || []).length;
  if (fetchCalls > 2) {
    issues.push({
      id: `PERF-${id++}`,
      severity: 'high',
      category: 'network',
      title: 'Sequential API Calls (Waterfall)',
      description: `Found ${fetchCalls} sequential fetch calls`,
      impact: 'Each request waits for previous to complete, multiplying latency',
      fixedCode: `// Before (waterfall):
const users = await fetch('/api/users');
const posts = await fetch('/api/posts');
const comments = await fetch('/api/comments');

// After (parallel):
const [users, posts, comments] = await Promise.all([
  fetch('/api/users'),
  fetch('/api/posts'),
  fetch('/api/comments'),
]);`,
      estimatedImprovement: '60-80% faster data loading'
    });
  }

  return issues;
}

function analyzeMemoryPatterns(code: string, framework: string, startId: number): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  let id = startId;

  // Check for event listener cleanup
  if (code.includes('addEventListener') && !code.includes('removeEventListener')) {
    issues.push({
      id: `PERF-${id++}`,
      severity: 'critical',
      category: 'memory',
      title: 'Memory Leak: Event Listener Not Cleaned Up',
      description: 'addEventListener used without corresponding removeEventListener',
      impact: 'Memory grows over time, eventually causing crashes',
      fixedCode: `// React:
useEffect(() => {
  const handler = (e) => { /* ... */ };
  window.addEventListener('resize', handler);
  
  return () => {
    window.removeEventListener('resize', handler);
  };
}, []);

// Vue:
onMounted(() => {
  window.addEventListener('resize', handler);
});
onUnmounted(() => {
  window.removeEventListener('resize', handler);
});`,
      estimatedImprovement: 'Prevents memory leaks'
    });
  }

  // Check for setInterval cleanup
  if (code.includes('setInterval') && !code.includes('clearInterval')) {
    issues.push({
      id: `PERF-${id++}`,
      severity: 'critical',
      category: 'memory',
      title: 'Memory Leak: Interval Not Cleared',
      description: 'setInterval used without clearInterval cleanup',
      impact: 'Interval continues running after component unmount',
      fixedCode: `// React:
useEffect(() => {
  const intervalId = setInterval(() => {
    // your logic
  }, 1000);
  
  return () => clearInterval(intervalId);
}, []);`,
      estimatedImprovement: 'Prevents memory leaks'
    });
  }

  // Check for subscription cleanup
  if ((code.includes('.subscribe(') || code.includes('on(')) && 
      !code.includes('unsubscribe') && !code.includes('.off(')) {
    issues.push({
      id: `PERF-${id++}`,
      severity: 'high',
      category: 'memory',
      title: 'Subscription Not Cleaned Up',
      description: 'Observable/event subscription without cleanup',
      impact: 'Memory accumulates with each mount/unmount cycle',
      fixedCode: `// React:
useEffect(() => {
  const subscription = observable.subscribe(handler);
  return () => subscription.unsubscribe();
}, []);`,
      estimatedImprovement: 'Prevents memory leaks'
    });
  }

  return issues;
}

function analyzeImageUsage(code: string, startId: number): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  let id = startId;

  // Check for images without optimization
  const imgTags = code.match(/<img[^>]+>/g) || [];
  for (const img of imgTags) {
    if (!img.includes('loading=') && !img.includes('loading="lazy"')) {
      issues.push({
        id: `PERF-${id++}`,
        severity: 'medium',
        category: 'images',
        title: 'Image Without Lazy Loading',
        description: 'Images should use lazy loading for better initial load',
        impact: 'All images load immediately, blocking page render',
        currentCode: img,
        fixedCode: `<!-- Add lazy loading -->
<img src="image.jpg" loading="lazy" alt="description" />

<!-- For Next.js, use Image component -->
import Image from 'next/image';
<Image src="/image.jpg" width={500} height={300} alt="description" />`,
        estimatedImprovement: '20-40% faster initial load'
      });
      break; // Only report once
    }

    if (!img.includes('width=') || !img.includes('height=')) {
      issues.push({
        id: `PERF-${id++}`,
        severity: 'high',
        category: 'images',
        title: 'Image Without Dimensions',
        description: 'Images without width/height cause layout shifts',
        impact: 'High CLS score, poor user experience',
        fixedCode: `<!-- Always specify dimensions -->
<img src="image.jpg" width="500" height="300" alt="description" />`,
        estimatedImprovement: 'Eliminates CLS from images'
      });
      break;
    }
  }

  return issues;
}

function generateBundleAnalysis(code: string): BundleAnalysis {
  const imports = code.match(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g) || [];
  
  const largestModules: BundleAnalysis['largestModules'] = [];
  
  // Detect heavy imports
  const heavyPackages: Record<string, { size: string; suggestion: string }> = {
    'lodash': { size: '~70KB', suggestion: 'Use lodash-es or individual imports' },
    'moment': { size: '~300KB', suggestion: 'Replace with dayjs (2KB)' },
    '@mui/material': { size: '~200KB', suggestion: 'Use path imports' },
    'antd': { size: '~500KB', suggestion: 'Use babel-plugin-import' },
    'recharts': { size: '~150KB', suggestion: 'Lazy load chart components' },
    'three': { size: '~600KB', suggestion: 'Use dynamic import' },
    'd3': { size: '~250KB', suggestion: 'Import only needed modules' },
  };

  for (const [pkg, info] of Object.entries(heavyPackages)) {
    if (code.includes(`'${pkg}'`) || code.includes(`"${pkg}"`)) {
      largestModules.push({
        name: pkg,
        size: info.size,
        suggestion: info.suggestion
      });
    }
  }

  return {
    totalSize: 'Analysis requires build tools',
    largestModules,
    unusedExports: [],
    duplicateDependencies: [],
    treeshakingOpportunities: largestModules.map(m => m.name)
  };
}

function analyzeCoreWebVitals(code: string, framework: string): CoreWebVitals {
  const vitals: CoreWebVitals = {
    lcp: { score: 'Good', issues: [], fixes: [] },
    fid: { score: 'Good', issues: [], fixes: [] },
    cls: { score: 'Good', issues: [], fixes: [] },
    ttfb: { score: 'Good', issues: [], fixes: [] }
  };

  // LCP Analysis
  if (code.includes('<img') && !code.includes('priority') && !code.includes('fetchpriority')) {
    vitals.lcp.score = 'Needs Improvement';
    vitals.lcp.issues.push('Hero images not prioritized');
    vitals.lcp.fixes.push('Add fetchpriority="high" to LCP image');
  }

  // CLS Analysis
  if (code.includes('<img') && (!code.includes('width=') || !code.includes('height='))) {
    vitals.cls.score = 'Poor';
    vitals.cls.issues.push('Images without dimensions cause layout shifts');
    vitals.cls.fixes.push('Add explicit width and height to all images');
  }

  // FID Analysis
  const heavyOperations = (code.match(/\.map\(|\.filter\(|\.reduce\(|\.sort\(/g) || []).length;
  if (heavyOperations > 5) {
    vitals.fid.score = 'Needs Improvement';
    vitals.fid.issues.push('Heavy JavaScript operations may block main thread');
    vitals.fid.fixes.push('Use Web Workers for heavy computations');
  }

  return vitals;
}

function generateQuickWins(issues: PerformanceIssue[]): string[] {
  const quickWins: string[] = [];

  if (issues.some(i => i.category === 'images')) {
    quickWins.push('Add loading="lazy" to all below-fold images');
  }
  if (issues.some(i => i.category === 'render' && i.title.includes('Inline'))) {
    quickWins.push('Move inline functions to useCallback hooks');
  }
  if (issues.some(i => i.category === 'bundle')) {
    quickWins.push('Replace heavy libraries with lightweight alternatives');
  }
  if (issues.some(i => i.category === 'network')) {
    quickWins.push('Add caching layer with React Query or SWR');
  }

  if (quickWins.length === 0) {
    quickWins.push('Code looks well optimized! Consider profiling with React DevTools');
  }

  return quickWins;
}

function generateLongTermOptimizations(issues: PerformanceIssue[], framework: string): string[] {
  const optimizations: string[] = [];

  optimizations.push('Implement code-splitting with dynamic imports');
  optimizations.push('Set up bundle analyzer to track size over time');
  optimizations.push('Configure proper caching headers on your CDN');
  
  if (framework === 'react' || framework === 'next') {
    optimizations.push('Consider using React Server Components for static content');
    optimizations.push('Implement streaming SSR for faster TTFB');
  }

  if (framework === 'vue' || framework === 'nuxt') {
    optimizations.push('Use async components for route-level code splitting');
  }

  return optimizations;
}

function generateOptimizedCode(
  code: string, 
  framework: string, 
  issues: PerformanceIssue[]
): PerformanceReport['generatedOptimizations'] {
  const optimizations: PerformanceReport['generatedOptimizations'] = {};

  // Generate lazy loading code
  if (issues.some(i => i.category === 'bundle')) {
    if (framework === 'react' || framework === 'next') {
      optimizations.lazyLoadingCode = `// Lazy loading setup for React
import React, { Suspense, lazy } from 'react';

// Lazy load heavy components
const Dashboard = lazy(() => import('./Dashboard'));
const Charts = lazy(() => import('./Charts'));
const Settings = lazy(() => import('./Settings'));

// Loading fallback
const Loading = () => <div className="loading-spinner">Loading...</div>;

// Usage in your app
function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}`;
    }
  }

  // Generate memoization code
  if (issues.some(i => i.category === 'render')) {
    optimizations.memoizationCode = `// Memoization patterns
import { memo, useMemo, useCallback } from 'react';

// Memoize expensive computations
const ExpensiveComponent = memo(function ExpensiveComponent({ items, filter }) {
  // Memoize filtered results
  const filteredItems = useMemo(() => {
    return items.filter(item => item.category === filter);
  }, [items, filter]);

  // Memoize callbacks
  const handleClick = useCallback((id) => {
    console.log('Clicked:', id);
  }, []);

  // Memoize style objects
  const containerStyle = useMemo(() => ({
    padding: 20,
    backgroundColor: '#f5f5f5'
  }), []);

  return (
    <div style={containerStyle}>
      {filteredItems.map(item => (
        <Item key={item.id} item={item} onClick={handleClick} />
      ))}
    </div>
  );
});`;
  }

  // Generate image optimization config
  if (issues.some(i => i.category === 'images')) {
    optimizations.imageOptimizationConfig = `// Next.js image optimization config (next.config.js)
module.exports = {
  images: {
    domains: ['your-cdn.com'],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

// Optimized Image component usage:
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero image"
  width={1200}
  height={600}
  priority // For LCP images
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>`;
  }

  return optimizations;
}

async function getAIPerformanceAnalysis(
  provider: any,
  request: PerformanceRequest
): Promise<{ additionalIssues: PerformanceIssue[] }> {
  try {
    const prompt = `Analyze this ${request.framework} code for performance issues. Return JSON with additional issues not covered by static analysis:

\`\`\`
${request.code.substring(0, 3000)}
\`\`\`

Return: { "additionalIssues": [{ "id": "AI-1", "severity": "high", "category": "render", "title": "...", "description": "...", "impact": "...", "fixedCode": "...", "estimatedImprovement": "..." }] }`;

    const response = await provider.complete(prompt, { max_tokens: 1000 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.debug('AI analysis failed, using heuristic results');
  }
  return { additionalIssues: [] };
}

export default { analyzePerformance };
