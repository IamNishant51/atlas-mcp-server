/**
 * Atlas Server - Performance Benchmarks
 * 
 * Benchmarks for testing optimization effectiveness.
 * Run with: npx tsx src/benchmark.ts
 * 
 * @module benchmark
 * @author Nishant Unavane
 * @version 1.0.0
 */

import {
  LRUCache,
  CircuitBreaker,
  RequestDeduplicator,
  MetricsCollector,
  memoizeAsync,
  parallelMap,
  hashString,
  generateCacheKey,
  retry,
  sleep,
  createTimer,
  globalMetrics,
} from './utils.js';

// ============================================================================
// Benchmark Utilities
// ============================================================================

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSecond: number;
}

async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  const times: number[] = [];
  
  // Warmup
  for (let i = 0; i < Math.min(10, iterations / 10); i++) {
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
  
  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    opsPerSecond: 1000 / avgMs,
  };
}

function printResult(result: BenchmarkResult): void {
  console.log(`\n📊 ${result.name}`);
  console.log(`   Iterations: ${result.iterations}`);
  console.log(`   Avg: ${result.avgMs.toFixed(3)}ms`);
  console.log(`   Min: ${result.minMs.toFixed(3)}ms`);
  console.log(`   Max: ${result.maxMs.toFixed(3)}ms`);
  console.log(`   Ops/sec: ${result.opsPerSecond.toFixed(0)}`);
}

// ============================================================================
// Benchmarks
// ============================================================================

async function benchmarkLRUCache(): Promise<BenchmarkResult> {
  const cache = new LRUCache<string, number>(1000, 60000);
  let i = 0;
  
  return benchmark('LRU Cache (set + get)', () => {
    const key = `key-${i++ % 100}`;
    cache.set(key, i);
    cache.get(key);
  }, 10000);
}

async function benchmarkHashString(): Promise<BenchmarkResult> {
  const testStrings = [
    'short string',
    'medium length string with some content here',
    'a very long string that contains a lot of text and would be typical of a code snippet or prompt'.repeat(10),
  ];
  let i = 0;
  
  return benchmark('String Hashing', () => {
    hashString(testStrings[i++ % testStrings.length]!);
  }, 10000);
}

async function benchmarkGenerateCacheKey(): Promise<BenchmarkResult> {
  const testData = [
    { provider: 'ollama', prompt: 'Test prompt', temp: 0.7 },
    { provider: 'openai', prompt: 'Another test', temp: 0.3, model: 'gpt-4' },
    { complex: { nested: { data: [1, 2, 3] } } },
  ];
  let i = 0;
  
  return benchmark('Generate Cache Key', () => {
    generateCacheKey('provider', testData[i++ % testData.length], Date.now());
  }, 10000);
}

async function benchmarkCircuitBreaker(): Promise<BenchmarkResult> {
  const cb = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 1000, halfOpenSuccesses: 2 });
  
  return benchmark('Circuit Breaker Execute', async () => {
    await cb.execute(async () => 'success');
  }, 1000);
}

async function benchmarkRequestDeduplicator(): Promise<BenchmarkResult> {
  const dedup = new RequestDeduplicator<string>();
  let i = 0;
  
  return benchmark('Request Deduplicator', async () => {
    // Alternate between new keys and repeated keys
    const key = `key-${Math.floor(i++ / 2) % 10}`;
    await dedup.execute(key, async () => 'result');
  }, 1000);
}

async function benchmarkMetricsCollector(): Promise<BenchmarkResult> {
  const metrics = new MetricsCollector(10000);
  let i = 0;
  
  return benchmark('Metrics Collector (record)', () => {
    metrics.record({
      name: `metric-${i++ % 10}`,
      durationMs: Math.random() * 100,
      success: Math.random() > 0.1,
    });
  }, 10000);
}

async function benchmarkMetricsCollectorStats(): Promise<BenchmarkResult> {
  const metrics = new MetricsCollector(10000);
  
  // Fill with data
  for (let i = 0; i < 1000; i++) {
    metrics.record({
      name: `metric-${i % 10}`,
      durationMs: Math.random() * 100,
      success: Math.random() > 0.1,
    });
  }
  
  return benchmark('Metrics Collector (getStats)', () => {
    metrics.getStats('metric-5');
  }, 1000);
}

async function benchmarkMemoizeAsync(): Promise<BenchmarkResult> {
  let callCount = 0;
  const slowFn = memoizeAsync(
    async (...args: unknown[]) => {
      callCount++;
      const x = args[0] as number;
      return x * 2;
    },
    { ttlMs: 60000, maxCacheSize: 100 }
  );
  let i = 0;
  
  return benchmark('Memoized Async Function', async () => {
    await slowFn(i++ % 20); // 20 unique keys, will hit cache
  }, 1000);
}

async function benchmarkParallelMap(): Promise<BenchmarkResult> {
  const items = Array.from({ length: 10 }, (_, i) => i);
  
  return benchmark('Parallel Map (10 items, concurrency 3)', async () => {
    await parallelMap(
      items,
      async (item) => item * 2,
      { concurrency: 3 }
    );
  }, 100);
}

async function benchmarkRetry(): Promise<BenchmarkResult> {
  let attempts = 0;
  
  return benchmark('Retry (success on 1st attempt)', async () => {
    await retry(async () => {
      attempts++;
      return 'success';
    }, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2 });
  }, 100);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 Atlas Server Performance Benchmarks');
  console.log('='.repeat(50));
  
  const results: BenchmarkResult[] = [];
  
  results.push(await benchmarkLRUCache());
  results.push(await benchmarkHashString());
  results.push(await benchmarkGenerateCacheKey());
  results.push(await benchmarkCircuitBreaker());
  results.push(await benchmarkRequestDeduplicator());
  results.push(await benchmarkMetricsCollector());
  results.push(await benchmarkMetricsCollectorStats());
  results.push(await benchmarkMemoizeAsync());
  results.push(await benchmarkParallelMap());
  results.push(await benchmarkRetry());
  
  console.log('\n' + '='.repeat(50));
  console.log('📈 Benchmark Results');
  console.log('='.repeat(50));
  
  for (const result of results) {
    printResult(result);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  
  const fastest = results.reduce((a, b) => a.opsPerSecond > b.opsPerSecond ? a : b);
  const slowest = results.reduce((a, b) => a.opsPerSecond < b.opsPerSecond ? a : b);
  
  console.log(`\n✅ Fastest: ${fastest.name} (${fastest.opsPerSecond.toFixed(0)} ops/sec)`);
  console.log(`⚠️  Slowest: ${slowest.name} (${slowest.opsPerSecond.toFixed(0)} ops/sec)`);
  
  // Global metrics summary
  console.log('\n📊 Global Metrics:');
  console.log(globalMetrics.getAllStats());
}

main().catch(console.error);
