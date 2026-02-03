/**
 * Atlas Server - Testing Utilities and Fixtures
 * 
 * Comprehensive testing infrastructure for all tools:
 * - Mock data generators
 * - Test fixtures and helpers
 * - Performance benchmarking
 * - Integration test utilities
 * - Assertion helpers
 * 
 * @module test-utils
 * @version 1.0.0
 */

import type {
  IntentAnalysis,
  PipelineContext,
  GitContext,
  ProjectInfo,
  CodeSnippet,
  DecompositionResult,
  SolutionVariant,
  Critique,
} from '../types.js';

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Generate mock intent analysis for testing
 */
export function mockIntentAnalysis(overrides?: Partial<IntentAnalysis>): IntentAnalysis {
  return {
    primaryIntent: 'code_generation',
    confidence: 0.85 as any,
    entities: [
      { type: 'language', value: 'TypeScript', position: { start: 10, end: 20 } },
      { type: 'framework', value: 'React', position: { start: 25, end: 30 } },
    ],
    keywords: ['create', 'component', 'typescript', 'react'],
    requiresClarification: false,
    ...overrides,
  };
}

/**
 * Generate mock project info for testing
 */
export function mockProjectInfo(overrides?: Partial<ProjectInfo>): ProjectInfo {
  return {
    rootPath: '/mock/project',
    languages: ['TypeScript', 'JavaScript'],
    frameworks: ['React', 'Next.js'],
    packageManager: 'npm',
    configFiles: ['package.json', 'tsconfig.json'],
    ...overrides,
  };
}

/**
 * Generate mock git context for testing
 */
export function mockGitContext(overrides?: Partial<GitContext>): GitContext {
  return {
    currentBranch: 'main',
    recentCommits: [
      {
        hash: 'abc123',
        message: 'feat: add new feature',
        author: 'Test User',
        date: '2024-01-15T10:30:00Z',
        filesChanged: 3,
      },
      {
        hash: 'def456',
        message: 'fix: resolve bug',
        author: 'Test User',
        date: '2024-01-14T15:45:00Z',
        filesChanged: 1,
      },
    ],
    uncommittedChanges: [],
    remoteUrl: 'https://github.com/user/repo.git',
    isDirty: false,
    ...overrides,
  };
}

/**
 * Generate mock code snippet for testing
 */
export function mockCodeSnippet(overrides?: Partial<CodeSnippet>): CodeSnippet {
  return {
    filePath: '/mock/file.ts',
    content: `function example() {\n  return 'mock';\n}`,
    language: 'TypeScript',
    lineRange: { start: 1, end: 3 },
    relevance: 0.8,
    ...overrides,
  };
}

/**
 * Generate mock pipeline context for testing
 */
export function mockPipelineContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    intent: mockIntentAnalysis(),
    codeSnippets: [mockCodeSnippet()],
    projectInfo: mockProjectInfo(),
    gitContext: mockGitContext(),
    ...overrides,
  };
}

/**
 * Generate mock decomposition result for testing
 */
export function mockDecompositionResult(
  overrides?: Partial<DecompositionResult>
): DecompositionResult {
  return {
    summary: 'Create a React component with TypeScript',
    tasks: [
      {
        id: '1',
        description: 'Define component interface',
        type: 'design',
        priority: 1,
        dependencies: [],
        complexity: 'low',
      },
      {
        id: '2',
        description: 'Implement component',
        type: 'implementation',
        priority: 2,
        dependencies: ['1'],
        complexity: 'medium',
      },
    ],
    executionOrder: ['1', '2'],
    overallComplexity: 'medium',
    ...overrides,
  };
}

/**
 * Generate mock solution variant for testing
 */
export function mockSolutionVariant(overrides?: Partial<SolutionVariant>): SolutionVariant {
  return {
    id: 'mock-variant-1',
    label: 'A',
    content: `const Component = () => {\n  return <div>Mock</div>;\n};`,
    approach: 'Functional component with hooks',
    tradeoffs: {
      pros: ['Simple', 'Modern'],
      cons: ['Limited flexibility'],
    },
    useCase: 'Simple presentational components',
    ...overrides,
  };
}

/**
 * Generate mock critique for testing
 */
export function mockCritique(overrides?: Partial<Critique>): Critique {
  return {
    variantId: 'mock-variant-1',
    qualityScore: 85,
    assessment: {
      correctness: 90,
      performance: 85,
      maintainability: 80,
      security: 85,
      bestPractices: 85,
    },
    issues: [
      {
        severity: 'minor',
        category: 'maintainability',
        description: 'Consider adding PropTypes or TypeScript types',
      },
    ],
    suggestions: ['Add error boundaries', 'Implement loading states'],
    isViable: true,
    ...overrides,
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Measure async function execution time
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, durationMs };
}

/**
 * Assert that a function throws with a specific message
 */
export async function assertThrows(
  fn: () => Promise<unknown> | unknown,
  expectedMessage?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (error instanceof Error) {
      if (expectedMessage) {
        const matches =
          typeof expectedMessage === 'string'
            ? error.message.includes(expectedMessage)
            : expectedMessage.test(error.message);
        if (!matches) {
          throw new Error(
            `Expected error message "${error.message}" to match "${expectedMessage}"`
          );
        }
      }
      return error;
    }
    throw error;
  }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Create a spy function that tracks calls
 */
export function createSpy<T extends (...args: any[]) => any>(): {
  spy: T;
  calls: Array<{ args: Parameters<T>; result?: ReturnType<T>; error?: Error }>;
  reset: () => void;
} {
  const calls: Array<{ args: Parameters<T>; result?: ReturnType<T>; error?: Error }> = [];

  const spy = ((...args: Parameters<T>) => {
    const call: { args: Parameters<T>; result?: ReturnType<T>; error?: Error } = { args };
    calls.push(call);
    return undefined;
  }) as T;

  return {
    spy,
    calls,
    reset: () => {
      calls.length = 0;
    },
  };
}

// ============================================================================
// Performance Benchmarking
// ============================================================================

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSecond: number;
}

/**
 * Benchmark a function performance
 */
export async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  iterations: number = 100
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < Math.min(10, iterations); i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const opsPerSecond = 1000 / avgMs;

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    opsPerSecond,
  };
}

/**
 * Compare multiple function implementations
 */
export async function benchmarkCompare(
  tests: Array<{ name: string; fn: () => Promise<void> | void }>,
  iterations: number = 100
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const test of tests) {
    const result = await benchmark(test.name, test.fn, iterations);
    results.push(result);
  }

  // Sort by fastest first
  results.sort((a, b) => a.avgMs - b.avgMs);

  return results;
}

/**
 * Print benchmark results to console
 */
export function printBenchmarkResults(results: BenchmarkResult[]): void {
  console.log('\n📊 Benchmark Results:\n');
  console.log('│ Name                           │ Avg (ms) │ Min (ms) │ Max (ms) │ Ops/sec │');
  console.log('├────────────────────────────────┼──────────┼──────────┼──────────┼─────────┤');

  for (const result of results) {
    const name = result.name.padEnd(30);
    const avg = result.avgMs.toFixed(2).padStart(8);
    const min = result.minMs.toFixed(2).padStart(8);
    const max = result.maxMs.toFixed(2).padStart(8);
    const ops = Math.round(result.opsPerSecond).toString().padStart(7);

    console.log(`│ ${name} │ ${avg} │ ${min} │ ${max} │ ${ops} │`);
  }

  console.log('└────────────────────────────────┴──────────┴──────────┴──────────┴─────────┘\n');

  // Show relative performance
  if (results.length > 1) {
    const fastest = results[0]!;
    console.log('🏆 Relative Performance:\n');
    for (let i = 1; i < results.length; i++) {
      const result = results[i]!;
      const factor = (result.avgMs / fastest.avgMs).toFixed(2);
      console.log(`   ${result.name}: ${factor}x slower than ${fastest.name}`);
    }
    console.log();
  }
}

// ============================================================================
// Integration Test Helpers
// ============================================================================

/**
 * Create a temporary directory for testing
 */
export async function createTempDir(): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  return await mkdtemp(join(tmpdir(), 'atlas-test-'));
}

/**
 * Cleanup a temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  const { rm } = await import('node:fs/promises');
  await rm(dir, { recursive: true, force: true });
}

/**
 * Write test file to a directory
 */
export async function writeTestFile(
  dir: string,
  filename: string,
  content: string
): Promise<string> {
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const filePath = join(dir, filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Execute test with automatic cleanup
 */
export async function withTestDir<T>(
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = await createTempDir();
  try {
    return await fn(dir);
  } finally {
    await cleanupTempDir(dir);
  }
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that two values are deeply equal
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);

  if (actualStr !== expectedStr) {
    throw new Error(
      message ||
        `Assertion failed:\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`
    );
  }
}

/**
 * Assert that a value is truthy
 */
export function assertTrue(value: unknown, message?: string): void {
  if (!value) {
    throw new Error(message || `Assertion failed: Expected truthy value, got ${value}`);
  }
}

/**
 * Assert that a value is falsy
 */
export function assertFalse(value: unknown, message?: string): void {
  if (value) {
    throw new Error(message || `Assertion failed: Expected falsy value, got ${value}`);
  }
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Assertion failed: Expected defined value');
  }
}

/**
 * Assert that an array contains a value
 */
export function assertContains<T>(
  array: T[],
  value: T,
  message?: string
): void {
  if (!array.includes(value)) {
    throw new Error(
      message || `Assertion failed: Array does not contain ${JSON.stringify(value)}`
    );
  }
}

/**
 * Assert that a number is within a range
 */
export function assertInRange(
  value: number,
  min: number,
  max: number,
  message?: string
): void {
  if (value < min || value > max) {
    throw new Error(
      message || `Assertion failed: ${value} is not in range [${min}, ${max}]`
    );
  }
}

// ============================================================================
// Mock LLM Provider
// ============================================================================

/**
 * Mock LLM provider for testing without actual API calls
 */
export class MockLLMProvider {
  private responses: Map<string, unknown> = new Map();
  public callCount = 0;

  /**
   * Set a mock response for a specific prompt pattern
   */
  setResponse(pattern: string | RegExp, response: unknown): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.responses.set(key, response);
  }

  /**
   * Mock complete method
   */
  async complete(prompt: string): Promise<string> {
    this.callCount++;

    for (const [pattern, response] of this.responses) {
      const regex = new RegExp(pattern);
      if (regex.test(prompt)) {
        return typeof response === 'string' ? response : JSON.stringify(response);
      }
    }

    return 'Mock response';
  }

  /**
   * Mock completeJson method
   */
  async completeJson<T>(prompt: string): Promise<{ data: T | null }> {
    this.callCount++;

    for (const [pattern, response] of this.responses) {
      const regex = new RegExp(pattern);
      if (regex.test(prompt)) {
        return { data: response as T };
      }
    }

    return { data: null };
  }

  /**
   * Reset the mock provider
   */
  reset(): void {
    this.responses.clear();
    this.callCount = 0;
  }
}

// ============================================================================
// Example Test Suite Template
// ============================================================================

/**
 * Example test suite demonstrating usage
 */
export async function exampleTestSuite(): Promise<void> {
  console.log('🧪 Running Example Test Suite...\n');

  // Test 1: Mock data generation
  const intent = mockIntentAnalysis({ confidence: 0.95 as any });
  assertEqual(intent.primaryIntent, 'code_generation', 'Intent should be code_generation');

  // Test 2: Performance benchmark
  const results = await benchmarkCompare(
    [
      {
        name: 'Sequential processing',
        fn: async () => {
          for (let i = 0; i < 10; i++) {
            await Promise.resolve(i);
          }
        },
      },
      {
        name: 'Parallel processing',
        fn: async () => {
          await Promise.all(Array.from({ length: 10 }, (_, i) => Promise.resolve(i)));
        },
      },
    ],
    50
  );

  printBenchmarkResults(results);

  // Test 3: Temporary directory
  await withTestDir(async (dir) => {
    const file = await writeTestFile(dir, 'test.txt', 'Hello, World!');
    assertTrue(file.includes('test.txt'), 'File path should contain test.txt');
  });

  console.log('✅ All tests passed!\n');
}
