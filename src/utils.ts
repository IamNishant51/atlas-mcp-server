/**
 * Atlas Server - Utility Functions
 * 
 * Shared utilities for logging, timing, error handling, and common operations.
 * 
 * Features:
 * - High-performance logging with MCP mode support
 * - Circuit breaker pattern for resilient external calls
 * - LRU cache with TTL for efficient memoization
 * - Request deduplication for concurrent identical calls
 * - Comprehensive retry logic with exponential backoff
 * - Type-safe error handling utilities
 * - Performance metrics collection
 * 
 * @module utils
 * @author Nishant Unavane
 * @version 2.1.0
 */

import pino from 'pino';
import { randomBytes } from 'crypto';
import type { PipelineError, StageName, StageResult } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum safe integer for performance tracking */
const MAX_DURATION_MS = Number.MAX_SAFE_INTEGER;

/** Default concurrency limit for parallel operations */
export const DEFAULT_CONCURRENCY = 3;

// ============================================================================
// Logger Configuration
// ============================================================================

/**
 * Detect if running in MCP stdio mode
 * Multiple detection methods for reliability
 */
const isMcpMode = (() => {
  const args = process.argv.join(' ').toLowerCase();
  return args.includes('mcp') || 
         process.env['MCP_MODE'] === 'true' ||
         process.env['LOG_LEVEL'] === 'silent';
})();

/** Singleton logger instance */
let _loggerInstance: pino.Logger | null = null;

/**
 * Create a configured pino logger instance
 * In MCP mode, we disable pretty printing to avoid polluting stdio
 * @param level - Log level (debug, info, warn, error, silent)
 */
export function createLogger(level: string = 'info'): pino.Logger {
  // Return cached instance if available with same level
  if (_loggerInstance) return _loggerInstance;
  
  // In MCP mode, use silent or minimal logging to stderr
  if (isMcpMode) {
    _loggerInstance = pino({
      level: process.env['LOG_LEVEL'] ?? 'silent', 
    }, pino.destination(2));
    return _loggerInstance;
  }
  
  _loggerInstance = pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  });
  
  return _loggerInstance;
}

/** Default logger instance (singleton) */
export const logger = createLogger(process.env['LOG_LEVEL'] ?? 'info');

// ============================================================================
// Timing Utilities
// ============================================================================

/**
 * Measure execution time of an async function with high precision
 * @template T - Return type of the function
 * @param fn - Async function to measure
 * @returns Result and duration in milliseconds
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.min(Math.round(performance.now() - start), MAX_DURATION_MS);
    return { result, durationMs };
  } catch (error) {
    // Ensure timing is still recorded on error
    const durationMs = Math.min(Math.round(performance.now() - start), MAX_DURATION_MS);
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { durationMs });
  }
}

/**
 * Create a simple timer for measuring elapsed time
 * Useful for tracking duration across multiple operations
 */
export function createTimer(): { elapsed: () => number; reset: () => void } {
  let start = performance.now();
  return {
    elapsed: () => Math.min(Math.round(performance.now() - start), MAX_DURATION_MS),
    reset: () => { start = performance.now(); },
  };
}

/**
 * Safely stringify an object, handling circular references
 */
export function safeStringify(obj: unknown, indent: number = 2): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    },
    indent
  );
}

/**
 * Create a stage result with timing, error handling, and optional retry
 * @template T - Output type of the stage function
 * @param name - Stage name for tracking
 * @param fn - Async function to execute
 * @param options - Optional configuration (retries, timeout)
 * @returns Stage result with output or error
 */
export async function executeStage<T>(
  name: StageName,
  fn: () => Promise<T>,
  options: { retries?: number; timeoutMs?: number } = {}
): Promise<{ stageResult: StageResult<T>; output: T }> {
  const start = performance.now();
  let lastError: Error | null = null;
  let retryCount = 0;
  const maxRetries = options.retries ?? 0;
  
  while (retryCount <= maxRetries) {
    try {
      // Apply timeout if specified
      const output = options.timeoutMs
        ? await Promise.race([
            fn(),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error(`Stage ${name} timed out after ${options.timeoutMs}ms`)), options.timeoutMs)
            ),
          ])
        : await fn();
      
      const durationMs = Math.round(performance.now() - start);
      
      return {
        stageResult: {
          name,
          success: true,
          durationMs,
          output,
          retries: retryCount > 0 ? retryCount : undefined,
        },
        output,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;
      
      if (retryCount <= maxRetries) {
        logger.debug({ stage: name, retry: retryCount, maxRetries }, `Retrying stage ${name}`);
        await sleep(Math.min(1000 * retryCount, 5000)); // Exponential backoff
      }
    }
  }
  
  const durationMs = Math.round(performance.now() - start);
  const errorMessage = lastError?.message ?? 'Unknown error';
  
  logger.error({ stage: name, error: errorMessage, retries: retryCount - 1 }, `Stage ${name} failed`);
  
  return {
    stageResult: {
      name,
      success: false,
      durationMs,
      output: undefined,
      error: errorMessage,
      retries: retryCount > 1 ? retryCount - 1 : undefined,
    },
    output: null as T,
  };
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Create a structured pipeline error
 */
export function createPipelineError(
  code: string,
  message: string,
  stage?: StageName,
  details?: Record<string, unknown>
): PipelineError {
  return {
    code,
    message,
    stage,
    details,
  };
}

/**
 * Type guard to check if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Generate a unique ID for tracking using crypto for better randomness
 */
export function generateId(): string {
  const randomPart = randomBytes(4).toString('hex');
  return `${Date.now().toString(36)}-${randomPart}`;
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...`;
}

/**
 * Clean and normalize whitespace in a string
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Extract code blocks from markdown text
 */
export function extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks: Array<{ language: string; code: string }> = [];
  
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push({
      language: match[1] ?? 'text',
      code: match[2]?.trim() ?? '',
    });
  }
  
  return blocks;
}

// ============================================================================
// Retry Logic
// ============================================================================

export interface RetryOptions {
  /** Maximum number of attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Retry an async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === opts.maxAttempts) {
        break;
      }

      logger.warn(
        { attempt, maxAttempts: opts.maxAttempts, delay },
        'Retrying after failure'
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Circuit Breaker Pattern
// ============================================================================

/**
 * Circuit breaker states
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker for resilient external service calls
 * Prevents cascade failures by failing fast when service is unavailable
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly options: {
      failureThreshold: number;
      resetTimeoutMs: number;
      halfOpenSuccesses: number;
    } = {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenSuccesses: 2,
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenSuccesses) {
        this.state = 'closed';
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
  }
}

// ============================================================================
// JSON Utilities
// ============================================================================

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T>(text: string): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }
}

/**
 * Extract JSON from a text that might contain markdown or other content
 */
export function extractJson<T>(text: string): T | null {
  // Try to find JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const result = safeJsonParse<T>(jsonMatch[0]);
    if (result.success) {
      return result.data;
    }
  }
  
  // Try to find JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const result = safeJsonParse<T>(arrayMatch[0]);
    if (result.success) {
      return result.data;
    }
  }
  
  return null;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Ensure a value is defined or throw
 */
export function ensureDefined<T>(value: T | null | undefined, message: string): T {
  if (!isDefined(value)) {
    throw new Error(message);
  }
  return value;
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Get current timestamp as ISO string
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Format milliseconds to human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

// ============================================================================
// Batch Processing Utilities
// ============================================================================

/**
 * Process items in parallel with concurrency limit and progress tracking
 * @template T - Input item type
 * @template R - Result type
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param options - Configuration options
 * @returns Array of results in original order
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
    stopOnError?: boolean;
  } = {}
): Promise<R[]> {
  const { concurrency = DEFAULT_CONCURRENCY, onProgress, stopOnError = false } = options;
  const results: R[] = new Array(items.length);
  const errors: Array<{ index: number; error: Error }> = [];
  let currentIndex = 0;
  let completedCount = 0;
  let shouldStop = false;

  async function runNext(): Promise<void> {
    while (currentIndex < items.length && !shouldStop) {
      const index = currentIndex++;
      const item = items[index]!;
      
      try {
        results[index] = await fn(item, index);
      } catch (error) {
        errors.push({ index, error: error instanceof Error ? error : new Error(String(error)) });
        if (stopOnError) {
          shouldStop = true;
          return;
        }
      }
      
      completedCount++;
      onProgress?.(completedCount, items.length);
    }
  }

  // Start up to 'concurrency' workers
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext()
  );

  await Promise.all(workers);
  
  if (errors.length > 0 && stopOnError) {
    throw errors[0]!.error;
  }
  
  return results;
}

/**
 * Debounce async function calls
 */
export function debounce<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingPromise: Promise<Awaited<ReturnType<T>>> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    pendingPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        fn(...args)
          .then((result) => resolve(result as Awaited<ReturnType<T>>))
          .catch(reject);
      }, delayMs);
    });
    
    return pendingPromise;
  };
}

/**
 * LRU Cache with TTL support for efficient memoization
 * @template K - Key type
 * @template V - Value type
 */
export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; expiry: number; accessTime: number }>();
  
  constructor(
    private readonly maxSize: number = 100,
    private readonly ttlMs: number = 60000
  ) {}

  get(key: K): V | undefined {
    const now = Date.now();
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    if (entry.expiry <= now) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Update access time for LRU
    entry.accessTime = now;
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const now = Date.now();
    
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      value,
      expiry: now + (ttlMs ?? this.ttlMs),
      accessTime: now,
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;
    const now = Date.now();
    
    for (const [key, entry] of this.cache) {
      // First, remove expired entries
      if (entry.expiry <= now) {
        this.cache.delete(key);
        continue;
      }
      
      if (entry.accessTime < oldestTime) {
        oldestTime = entry.accessTime;
        oldestKey = key;
      }
    }
    
    // If still at capacity, remove LRU entry
    if (this.cache.size >= this.maxSize && oldestKey !== undefined) {
      this.cache.delete(oldestKey);
    }
  }

  /** Get cache statistics */
  getStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.maxSize };
  }
}

/**
 * Memoize async function with LRU cache and TTL
 * @template T - Function type
 * @param fn - Async function to memoize
 * @param options - Cache configuration
 * @returns Memoized function
 */
export function memoizeAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: {
    ttlMs?: number;
    maxCacheSize?: number;
    keyFn?: (...args: Parameters<T>) => string;
  } = {}
): T & { cache: LRUCache<string, Awaited<ReturnType<T>>>; clearCache: () => void } {
  const {
    ttlMs = 60000,
    maxCacheSize = 100,
    keyFn = (...args) => JSON.stringify(args),
  } = options;
  
  const cache = new LRUCache<string, Awaited<ReturnType<T>>>(maxCacheSize, ttlMs);
  const pending = new Map<string, Promise<Awaited<ReturnType<T>>>>();

  const memoized = ((...args: Parameters<T>) => {
    const key = keyFn(...args);
    
    // Check cache first
    const cached = cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    
    // Deduplicate concurrent calls with same key
    const pendingCall = pending.get(key);
    if (pendingCall) {
      return pendingCall;
    }
    
    // Execute and cache
    const promise = fn(...args).then((result) => {
      cache.set(key, result as Awaited<ReturnType<T>>);
      pending.delete(key);
      return result as Awaited<ReturnType<T>>;
    }).catch((error) => {
      pending.delete(key);
      throw error;
    });
    
    pending.set(key, promise);
    return promise;
  }) as T & { cache: LRUCache<string, Awaited<ReturnType<T>>>; clearCache: () => void };

  memoized.cache = cache;
  memoized.clearCache = () => cache.clear();
  
  return memoized;
}

// ============================================================================
// Request Deduplication
// ============================================================================

/**
 * Request deduplicator to prevent duplicate concurrent requests
 * Useful for expensive operations that may be called multiple times simultaneously
 */
export class RequestDeduplicator<T> {
  private pending = new Map<string, Promise<T>>();
  
  /**
   * Execute a function with deduplication
   * If a request with the same key is already in progress, returns that promise
   */
  async execute(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      return existing;
    }
    
    const promise = fn()
      .finally(() => {
        this.pending.delete(key);
      });
    
    this.pending.set(key, promise);
    return promise;
  }
  
  /** Check if a request is in progress */
  isInProgress(key: string): boolean {
    return this.pending.has(key);
  }
  
  /** Get count of pending requests */
  get pendingCount(): number {
    return this.pending.size;
  }
  
  /** Clear all pending requests (careful - may cause issues) */
  clear(): void {
    this.pending.clear();
  }
}

// ============================================================================
// Performance Metrics Collection
// ============================================================================

export interface MetricEntry {
  name: string;
  durationMs: number;
  timestamp: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Performance metrics collector for monitoring and optimization
 * Collects timing data for operations and provides aggregated statistics
 */
export class MetricsCollector {
  private metrics: MetricEntry[] = [];
  private readonly maxEntries: number;
  
  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }
  
  /**
   * Record a metric entry
   */
  record(entry: Omit<MetricEntry, 'timestamp'>): void {
    this.metrics.push({
      ...entry,
      timestamp: Date.now(),
    });
    
    // Prune old entries if over limit
    if (this.metrics.length > this.maxEntries) {
      this.metrics = this.metrics.slice(-this.maxEntries);
    }
  }
  
  /**
   * Measure execution time of an async function
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();
    let success = true;
    
    try {
      return await fn();
    } catch (error) {
      success = false;
      throw error;
    } finally {
      this.record({
        name,
        durationMs: Math.round(performance.now() - start),
        success,
        metadata,
      });
    }
  }
  
  /**
   * Get statistics for a specific metric
   */
  getStats(name: string): {
    count: number;
    avgDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    successRate: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const entries = this.metrics.filter(m => m.name === name);
    if (entries.length === 0) return null;
    
    const durations = entries.map(e => e.durationMs).sort((a, b) => a - b);
    const successCount = entries.filter(e => e.success).length;
    
    return {
      count: entries.length,
      avgDurationMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minDurationMs: durations[0]!,
      maxDurationMs: durations[durations.length - 1]!,
      successRate: successCount / entries.length,
      p50: durations[Math.floor(durations.length * 0.50)]!,
      p95: durations[Math.floor(durations.length * 0.95)]!,
      p99: durations[Math.floor(durations.length * 0.99)]!,
    };
  }
  
  /**
   * Get all unique metric names
   */
  getMetricNames(): string[] {
    return [...new Set(this.metrics.map(m => m.name))];
  }
  
  /**
   * Get all statistics
   */
  getAllStats(): Record<string, ReturnType<MetricsCollector['getStats']>> {
    const stats: Record<string, ReturnType<MetricsCollector['getStats']>> = {};
    for (const name of this.getMetricNames()) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }
  
  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
  
  /**
   * Export metrics as JSON
   */
  export(): MetricEntry[] {
    return [...this.metrics];
  }
}

/** Global metrics collector singleton */
export const globalMetrics = new MetricsCollector(5000);

// ============================================================================
// String Hashing for Cache Keys
// ============================================================================

/**
 * Fast string hash function for cache key generation
 * Uses djb2 algorithm for good distribution
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generate a cache key from multiple values
 */
export function generateCacheKey(...values: unknown[]): string {
  return hashString(JSON.stringify(values));
}
