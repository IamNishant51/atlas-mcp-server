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
import type { PipelineError, StageName, StageResult } from './types.js';
/** Default concurrency limit for parallel operations */
export declare const DEFAULT_CONCURRENCY = 3;
/**
 * Create a configured pino logger instance
 * In MCP mode, we disable pretty printing to avoid polluting stdio
 * @param level - Log level (debug, info, warn, error, silent)
 */
export declare function createLogger(level?: string): pino.Logger;
/** Default logger instance (singleton) */
export declare const logger: pino.Logger<never, boolean>;
/**
 * Measure execution time of an async function with high precision
 * @template T - Return type of the function
 * @param fn - Async function to measure
 * @returns Result and duration in milliseconds
 */
export declare function measureTime<T>(fn: () => Promise<T>): Promise<{
    result: T;
    durationMs: number;
}>;
/**
 * Create a simple timer for measuring elapsed time
 * Useful for tracking duration across multiple operations
 */
export declare function createTimer(): {
    elapsed: () => number;
    reset: () => void;
};
/**
 * Safely stringify an object, handling circular references
 */
export declare function safeStringify(obj: unknown, indent?: number): string;
/**
 * Create a stage result with timing, error handling, and optional retry
 * @template T - Output type of the stage function
 * @param name - Stage name for tracking
 * @param fn - Async function to execute
 * @param options - Optional configuration (retries, timeout)
 * @returns Stage result with output or error
 */
export declare function executeStage<T>(name: StageName, fn: () => Promise<T>, options?: {
    retries?: number;
    timeoutMs?: number;
}): Promise<{
    stageResult: StageResult<T>;
    output: T;
}>;
/**
 * Create a structured pipeline error
 */
export declare function createPipelineError(code: string, message: string, stage?: StageName, details?: Record<string, unknown>): PipelineError;
/**
 * Type guard to check if value is an Error
 */
export declare function isError(value: unknown): value is Error;
/**
 * Extract error message from unknown error type
 */
export declare function getErrorMessage(error: unknown): string;
/**
 * Generate a unique ID for tracking using crypto for better randomness
 */
export declare function generateId(): string;
/**
 * Truncate string to max length with ellipsis
 */
export declare function truncate(str: string, maxLength: number): string;
/**
 * Clean and normalize whitespace in a string
 */
export declare function normalizeWhitespace(str: string): string;
/**
 * Extract code blocks from markdown text
 */
export declare function extractCodeBlocks(text: string): Array<{
    language: string;
    code: string;
}>;
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
/**
 * Retry an async function with exponential backoff
 */
export declare function retry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
/**
 * Sleep for a specified duration
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Circuit breaker states
 */
type CircuitState = 'closed' | 'open' | 'half-open';
/**
 * Circuit breaker for resilient external service calls
 * Prevents cascade failures by failing fast when service is unavailable
 */
export declare class CircuitBreaker {
    private readonly options;
    private state;
    private failureCount;
    private lastFailureTime;
    private successCount;
    constructor(options?: {
        failureThreshold: number;
        resetTimeoutMs: number;
        halfOpenSuccesses: number;
    });
    execute<T>(fn: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    getState(): CircuitState;
    reset(): void;
}
/**
 * Safely parse JSON with error handling
 */
export declare function safeJsonParse<T>(text: string): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
/**
 * Extract JSON from a text that might contain markdown or other content
 */
export declare function extractJson<T>(text: string): T | null;
/**
 * Check if a value is defined (not null or undefined)
 */
export declare function isDefined<T>(value: T | null | undefined): value is T;
/**
 * Ensure a value is defined or throw
 */
export declare function ensureDefined<T>(value: T | null | undefined, message: string): T;
/**
 * Get current timestamp as ISO string
 */
export declare function nowISO(): string;
/**
 * Format milliseconds to human-readable duration
 */
export declare function formatDuration(ms: number): string;
/**
 * Process items in parallel with concurrency limit and progress tracking
 * @template T - Input item type
 * @template R - Result type
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param options - Configuration options
 * @returns Array of results in original order
 */
export declare function parallelMap<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, options?: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
    stopOnError?: boolean;
}): Promise<R[]>;
/**
 * Debounce async function calls
 */
export declare function debounce<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, delayMs: number): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;
/**
 * LRU Cache with TTL support for efficient memoization
 * @template K - Key type
 * @template V - Value type
 */
export declare class LRUCache<K, V> {
    private readonly maxSize;
    private readonly ttlMs;
    private cache;
    constructor(maxSize?: number, ttlMs?: number);
    get(key: K): V | undefined;
    set(key: K, value: V, ttlMs?: number): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    get size(): number;
    private evictLRU;
    /** Get cache statistics */
    getStats(): {
        size: number;
        maxSize: number;
    };
}
/**
 * Memoize async function with LRU cache and TTL
 * @template T - Function type
 * @param fn - Async function to memoize
 * @param options - Cache configuration
 * @returns Memoized function
 */
export declare function memoizeAsync<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, options?: {
    ttlMs?: number;
    maxCacheSize?: number;
    keyFn?: (...args: Parameters<T>) => string;
}): T & {
    cache: LRUCache<string, Awaited<ReturnType<T>>>;
    clearCache: () => void;
};
/**
 * Request deduplicator to prevent duplicate concurrent requests
 * Useful for expensive operations that may be called multiple times simultaneously
 */
export declare class RequestDeduplicator<T> {
    private pending;
    /**
     * Execute a function with deduplication
     * If a request with the same key is already in progress, returns that promise
     */
    execute(key: string, fn: () => Promise<T>): Promise<T>;
    /** Check if a request is in progress */
    isInProgress(key: string): boolean;
    /** Get count of pending requests */
    get pendingCount(): number;
    /** Clear all pending requests (careful - may cause issues) */
    clear(): void;
}
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
export declare class MetricsCollector {
    private metrics;
    private readonly maxEntries;
    constructor(maxEntries?: number);
    /**
     * Record a metric entry
     */
    record(entry: Omit<MetricEntry, 'timestamp'>): void;
    /**
     * Measure execution time of an async function
     */
    measure<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>;
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
    } | null;
    /**
     * Get all unique metric names
     */
    getMetricNames(): string[];
    /**
     * Get all statistics
     */
    getAllStats(): Record<string, ReturnType<MetricsCollector['getStats']>>;
    /**
     * Clear all metrics
     */
    clear(): void;
    /**
     * Export metrics as JSON
     */
    export(): MetricEntry[];
}
/** Global metrics collector singleton */
export declare const globalMetrics: MetricsCollector;
/**
 * Fast string hash function for cache key generation
 * Uses djb2 algorithm for good distribution
 */
export declare function hashString(str: string): string;
/**
 * Generate a cache key from multiple values
 */
export declare function generateCacheKey(...values: unknown[]): string;
export {};
//# sourceMappingURL=utils.d.ts.map