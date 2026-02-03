/**
 * Atlas Server - Performance Profiling and Analysis Tool
 * 
 * Advanced performance profiling for code optimization:
 * - Time complexity analysis
 * - Space complexity analysis
 * - Benchmark generation
 * - Memory leak detection
 * - CPU hotspot identification
 * - I/O bottleneck detection
 * - Algorithm efficiency suggestions
 * - Big-O notation analysis
 * 
 * @module profiler
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer, safeStringify } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface ProfileOptions {
  code: string;
  language: string;
  filePath?: string;
  
  // Profiling targets
  analyzeTime?: boolean;
  analyzeSpace?: boolean;
  detectLeaks?: boolean;
  identifyHotspots?: boolean;
  
  // Benchmarking
  generateBenchmark?: boolean;
  inputSizes?: number[]; // For Big-O analysis
  
  // Context
  expectedInputSize?: 'small' | 'medium' | 'large' | 'huge';
  constraints?: string[];
}

export interface ProfileResult {
  code: string;
  analysis: PerformanceAnalysis;
  hotspots: PerformanceHotspot[];
  suggestions: OptimizationSuggestion[];
  benchmarkCode?: string;
  executionTimeMs: number;
  warnings: string[];
}

export interface PerformanceAnalysis {
  timeComplexity: ComplexityInfo;
  spaceComplexity: ComplexityInfo;
  algorithmType?: AlgorithmType;
  potentialBottlenecks: string[];
  memoryLeakRisk: 'none' | 'low' | 'medium' | 'high';
  ioOperations: IOOperation[];
}

export interface ComplexityInfo {
  bigO: string; // e.g., "O(n log n)"
  bestCase: string;
  averageCase: string;
  worstCase: string;
  explanation: string;
  confidence: number; // 0-1
}

export interface PerformanceHotspot {
  location: string; // Line number or function name
  type: 'cpu' | 'memory' | 'io' | 'network';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  estimatedImpact: string; // e.g., "70% of execution time"
}

export interface OptimizationSuggestion {
  priority: number; // 1-10
  category: OptimizationCategory;
  description: string;
  codeExample?: string;
  estimatedGain: string; // e.g., "2-3x faster"
}

export type AlgorithmType =
  | 'linear-search'
  | 'binary-search'
  | 'sorting'
  | 'dynamic-programming'
  | 'greedy'
  | 'divide-conquer'
  | 'backtracking'
  | 'graph-traversal'
  | 'tree-traversal'
  | 'other';

export type OptimizationCategory =
  | 'algorithm'       // Better algorithm choice
  | 'data-structure'  // Better data structure
  | 'caching'         // Add caching/memoization
  | 'parallelization' // Concurrent execution
  | 'lazy-evaluation' // Defer computation
  | 'early-exit'      // Short-circuit logic
  | 'memory'          // Reduce memory usage
  | 'io'              // Optimize I/O operations
  | 'network'         // Optimize network calls
  | 'database';       // Database query optimization

export interface IOOperation {
  type: 'file' | 'network' | 'database';
  operation: string;
  isBlocking: boolean;
  isRepeated: boolean;
}

// ============================================================================
// Validation Schema
// ============================================================================

const ProfileOptionsSchema = z.object({
  code: z.string().min(1).max(500000),
  language: z.string().min(1),
  filePath: z.string().optional(),
  analyzeTime: z.boolean().optional(),
  analyzeSpace: z.boolean().optional(),
  detectLeaks: z.boolean().optional(),
  identifyHotspots: z.boolean().optional(),
  generateBenchmark: z.boolean().optional(),
  inputSizes: z.array(z.number()).optional(),
  expectedInputSize: z.enum(['small', 'medium', 'large', 'huge']).optional(),
  constraints: z.array(z.string()).optional(),
});

// ============================================================================
// Static Code Analysis
// ============================================================================

/**
 * Analyze code structure for performance patterns
 */
function analyzeCodeStructure(code: string, language: string): {
  loops: number;
  nestedLoops: number;
  recursiveCalls: number;
  ioOperations: IOOperation[];
} {
  // Count loops
  const loopPatterns = /\b(for|while|forEach|map|filter|reduce|each)\b/gi;
  const loops = (code.match(loopPatterns) || []).length;

  // Detect nested loops (simplified)
  const nestedLoopPattern = /\b(for|while)\b[^{]*{[^}]*(for|while)\b/gis;
  const nestedLoops = (code.match(nestedLoopPattern) || []).length;

  // Detect recursion
  const functionNames = [...code.matchAll(/(?:function|def|fn)\s+(\w+)/g)].map(m => m[1]);
  const recursiveCalls = functionNames.filter(name => 
    new RegExp(`\\b${name}\\s*\\(`).test(code)
  ).length;

  // Detect I/O operations
  const ioOperations: IOOperation[] = [];
  
  // File I/O
  if (code.match(/\b(readFile|writeFile|open|read|write|createWriteStream)\b/i)) {
    ioOperations.push({
      type: 'file',
      operation: 'File I/O detected',
      isBlocking: code.includes('Sync') || code.includes('await'),
      isRepeated: /\b(for|while)[^{]*{[^}]*(read|write)/i.test(code),
    });
  }

  // Network I/O
  if (code.match(/\b(fetch|axios|request|http\.get|http\.post)\b/i)) {
    ioOperations.push({
      type: 'network',
      operation: 'Network request detected',
      isBlocking: code.includes('await') || code.includes('.then('),
      isRepeated: /\b(for|while)[^{]*{[^}]*(fetch|request)/i.test(code),
    });
  }

  // Database operations
  if (code.match(/\b(query|execute|find|findOne|insert|update|delete|aggregate)\b/i)) {
    ioOperations.push({
      type: 'database',
      operation: 'Database query detected',
      isBlocking: true,
      isRepeated: /\b(for|while)[^{]*{[^}]*(query|find)/i.test(code),
    });
  }

  return { loops, nestedLoops, recursiveCalls, ioOperations };
}

/**
 * Estimate Big-O complexity from code structure
 */
function estimateComplexity(structure: ReturnType<typeof analyzeCodeStructure>): {
  time: string;
  space: string;
  confidence: number;
} {
  const { loops, nestedLoops, recursiveCalls, ioOperations } = structure;

  let timeComplexity = 'O(1)';
  let spaceComplexity = 'O(1)';
  let confidence = 0.6;

  // Time complexity estimation
  if (nestedLoops >= 3) {
    timeComplexity = 'O(n³) or worse';
    confidence = 0.7;
  } else if (nestedLoops >= 2) {
    timeComplexity = 'O(n²)';
    confidence = 0.75;
  } else if (nestedLoops === 1 || loops > 1) {
    timeComplexity = 'O(n log n) or O(n²)';
    confidence = 0.65;
  } else if (loops === 1) {
    timeComplexity = 'O(n)';
    confidence = 0.8;
  } else if (recursiveCalls > 0) {
    timeComplexity = 'O(2ⁿ) or O(n!)';
    confidence = 0.5;
  }

  // Space complexity estimation
  if (recursiveCalls > 0) {
    spaceComplexity = 'O(n) recursion stack';
    confidence = Math.min(confidence, 0.7);
  } else if (loops > 0) {
    spaceComplexity = 'O(n) or O(1)';
    confidence = Math.min(confidence, 0.6);
  }

  return { time: timeComplexity, space: spaceComplexity, confidence };
}

/**
 * Detect memory leak patterns
 */
function detectMemoryLeaks(code: string, language: string): 'none' | 'low' | 'medium' | 'high' {
  let riskScore = 0;

  // Global variable accumulation
  if (code.match(/\b(global|window)\.\w+\s*=\s*\[/)) {
    riskScore += 3;
  }

  // Event listeners without cleanup
  if (code.match(/addEventListener/) && !code.match(/removeEventListener/)) {
    riskScore += 2;
  }

  // Timers without cleanup
  if ((code.match(/setInterval|setTimeout/) || []).length > 
      (code.match(/clearInterval|clearTimeout/) || []).length) {
    riskScore += 2;
  }

  // Circular references
  if (code.match(/\w+\.\w+\s*=\s*\w+/) && code.match(/\w+\.\w+\s*=\s*this/)) {
    riskScore += 1;
  }

  // Unbounded collections
  if (code.match(/\[\]\.push|Map\(\)|Set\(\)/) && !code.match(/clear|delete|splice/)) {
    riskScore += 2;
  }

  if (riskScore >= 6) return 'high';
  if (riskScore >= 4) return 'medium';
  if (riskScore >= 2) return 'low';
  return 'none';
}

// ============================================================================
// Main Profile Function
// ============================================================================

/**
 * Comprehensive performance profiling and analysis
 */
export async function profileCode(options: ProfileOptions): Promise<ProfileResult> {
  const timer = createTimer();
  
  const {
    code,
    language,
    filePath,
    analyzeTime = true,
    analyzeSpace = true,
    detectLeaks = true,
    identifyHotspots = true,
    generateBenchmark = false,
    inputSizes = [10, 100, 1000, 10000],
    expectedInputSize = 'medium',
    constraints = [],
  } = ProfileOptionsSchema.parse(options);

  logger.info({ language, filePath }, 'Starting performance profiling');

  const warnings: string[] = [];
  
  // Static analysis
  const structure = analyzeCodeStructure(code, language);
  const complexity = estimateComplexity(structure);
  const memoryLeakRisk = detectLeaks ? detectMemoryLeaks(code, language) : 'none';

  // Build analysis prompt
  const prompt = `You are a performance optimization expert with 50 years of experience. Analyze this ${language} code for performance.

**Code:**
\`\`\`${language}
${code}
\`\`\`

**Static Analysis:**
- Loops detected: ${structure.loops}
- Nested loops: ${structure.nestedLoops}
- Recursive calls: ${structure.recursiveCalls}
- I/O operations: ${structure.ioOperations.length}
- Estimated time complexity: ${complexity.time}
- Estimated space complexity: ${complexity.space}
- Memory leak risk: ${memoryLeakRisk}
- Expected input size: ${expectedInputSize}

**I/O Operations:**
${structure.ioOperations.map(io => `- ${io.type} (${io.isBlocking ? 'blocking' : 'non-blocking'}${io.isRepeated ? ', repeated' : ''})`).join('\n') || '- None detected'}

**Constraints:**
${constraints.length > 0 ? constraints.join('\n') : '- None specified'}

**Tasks:**
1. Analyze time complexity (Big-O notation) for best, average, and worst cases
2. Analyze space complexity
3. Identify performance hotspots (CPU, memory, I/O)
4. Provide optimization suggestions ranked by impact
5. ${generateBenchmark ? 'Generate benchmark code' : ''}

**Format your response as:**

TIME_COMPLEXITY:
Best: O(...)
Average: O(...)
Worst: O(...)
Explanation: [why this complexity]

SPACE_COMPLEXITY:
Best: O(...)
Average: O(...)
Worst: O(...)
Explanation: [why this complexity]

HOTSPOTS:
- [location]: [type] - [description] - Impact: [X%]
...

OPTIMIZATIONS:
Priority 1: [category] - [description] - Gain: [X%]
Priority 2: [category] - [description] - Gain: [X%]
...

${generateBenchmark ? `BENCHMARK:
\`\`\`${language}
[benchmark code here]
\`\`\`
` : ''}`;

  let analysis: PerformanceAnalysis = {
    timeComplexity: {
      bigO: complexity.time,
      bestCase: complexity.time,
      averageCase: complexity.time,
      worstCase: complexity.time,
      explanation: 'Static analysis estimate',
      confidence: complexity.confidence,
    },
    spaceComplexity: {
      bigO: complexity.space,
      bestCase: complexity.space,
      averageCase: complexity.space,
      worstCase: complexity.space,
      explanation: 'Static analysis estimate',
      confidence: complexity.confidence,
    },
    potentialBottlenecks: [],
    memoryLeakRisk,
    ioOperations: structure.ioOperations,
  };

  let hotspots: PerformanceHotspot[] = [];
  let suggestions: OptimizationSuggestion[] = [];
  let benchmarkCode: string | undefined;

  if (isNoLLMMode()) {
    warnings.push('No LLM provider - using static analysis only');
    
    // Add basic suggestions based on static analysis
    if (structure.nestedLoops >= 2) {
      suggestions.push({
        priority: 9,
        category: 'algorithm',
        description: 'Nested loops detected - consider using hash maps or better algorithm',
        estimatedGain: '10-100x faster',
      });
    }

    if (structure.ioOperations.some(io => io.isRepeated)) {
      suggestions.push({
        priority: 10,
        category: 'io',
        description: 'Repeated I/O operations in loop - batch or cache results',
        estimatedGain: '5-50x faster',
      });
    }

    if (memoryLeakRisk === 'high' || memoryLeakRisk === 'medium') {
      suggestions.push({
        priority: 8,
        category: 'memory',
        description: 'High memory leak risk - add cleanup for timers/listeners',
        estimatedGain: 'Prevents memory growth',
      });
    }
  } else {
    const provider = await getActiveProvider();
    
    try {
      const response = await provider.complete(prompt, {
        maxTokens: 3000,
        temperature: 0.2,
      });

      const responseText = response.text;

      // Parse time complexity
      const timeMatch = responseText.match(/TIME_COMPLEXITY:\s*Best:\s*([^\n]+)\s*Average:\s*([^\n]+)\s*Worst:\s*([^\n]+)\s*Explanation:\s*([^\n]+)/i);
      if (timeMatch && timeMatch[1] && timeMatch[2] && timeMatch[3] && timeMatch[4]) {
        analysis.timeComplexity = {
          bigO: timeMatch[2].trim(),
          bestCase: timeMatch[1].trim(),
          averageCase: timeMatch[2].trim(),
          worstCase: timeMatch[3].trim(),
          explanation: timeMatch[4].trim(),
          confidence: 0.85,
        };
      }

      // Parse space complexity
      const spaceMatch = responseText.match(/SPACE_COMPLEXITY:\s*Best:\s*([^\n]+)\s*Average:\s*([^\n]+)\s*Worst:\s*([^\n]+)\s*Explanation:\s*([^\n]+)/i);
      if (spaceMatch && spaceMatch[1] && spaceMatch[2] && spaceMatch[3] && spaceMatch[4]) {
        analysis.spaceComplexity = {
          bigO: spaceMatch[2].trim(),
          bestCase: spaceMatch[1].trim(),
          averageCase: spaceMatch[2].trim(),
          worstCase: spaceMatch[3].trim(),
          explanation: spaceMatch[4].trim(),
          confidence: 0.85,
        };
      }

      // Parse hotspots
      const hotspotsMatch = responseText.match(/HOTSPOTS:\s*([\s\S]*?)(?:OPTIMIZATIONS:|$)/i);
      if (hotspotsMatch && hotspotsMatch[1]) {
        const hotspotLines = hotspotsMatch[1].trim().split('\n')
          .filter((line: string) => line.trim().startsWith('-'));
        
        hotspots = hotspotLines.map((line: string) => {
          const clean = line.replace(/^-\s*/, '').trim();
          const parts = clean.split(' - ');
          return {
            location: parts[0] || 'Unknown',
            type: (parts[1]?.toLowerCase() as any) || 'cpu',
            severity: 'high' as const,
            description: parts[2] || clean,
            estimatedImpact: parts[3] || 'Unknown',
          };
        });
      }

      // Parse optimizations
      const optsMatch = responseText.match(/OPTIMIZATIONS:\s*([\s\S]*?)(?:BENCHMARK:|$)/i);
      if (optsMatch && optsMatch[1]) {
        const optLines = optsMatch[1].trim().split('\n')
          .filter((line: string) => /Priority\s+\d+:/i.test(line));
        
        suggestions = optLines.map((line: string) => {
          const priorityMatch = line.match(/Priority\s+(\d+):/i);
          const priority = priorityMatch ? parseInt(priorityMatch[1] || '5') : 5;
          
          const parts = line.split(' - ');
          const categoryPart = parts[0]?.split(':')[1]?.trim() || 'algorithm';
          
          return {
            priority,
            category: categoryPart.toLowerCase() as OptimizationCategory,
            description: parts[1] || line,
            estimatedGain: parts[2] || 'Unknown',
          };
        }).sort((a: any, b: any) => b.priority - a.priority);
      }

      // Parse benchmark code
      if (generateBenchmark) {
        const benchMatch = responseText.match(/BENCHMARK:\s*```[\w]*\s*([\s\S]*?)```/i);
        if (benchMatch && benchMatch[1]) {
          benchmarkCode = benchMatch[1].trim();
        }
      }
    } catch (error) {
      logger.error({ error }, 'Profiling failed');
      warnings.push(`LLM error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  const executionTimeMs = timer.elapsed();
  logger.info({ 
    timeComplexity: analysis.timeComplexity.bigO,
    hotspots: hotspots.length,
    suggestions: suggestions.length,
    executionTimeMs 
  }, 'Profiling completed');

  return {
    code,
    analysis,
    hotspots,
    suggestions,
    benchmarkCode,
    executionTimeMs,
    warnings,
  };
}

// ============================================================================
// Export
// ============================================================================

export default profileCode;
