/**
 * Atlas Server - Utility Functions
 *
 * Shared utilities for logging, timing, error handling, and common operations.
 */
import pino from 'pino';
import type { PipelineError, StageName, StageResult } from './types.js';
/**
 * Create a configured pino logger instance
 * In MCP mode, we disable pretty printing to avoid polluting stdio
 */
export declare function createLogger(level?: string): pino.Logger<never, boolean>;
/** Default logger instance */
export declare const logger: pino.Logger<never, boolean>;
/**
 * Measure execution time of an async function
 */
export declare function measureTime<T>(fn: () => Promise<T>): Promise<{
    result: T;
    durationMs: number;
}>;
/**
 * Create a simple timer for measuring elapsed time
 */
export declare function createTimer(): {
    elapsed: () => number;
};
/**
 * Safely stringify an object, handling circular references
 */
export declare function safeStringify(obj: unknown, indent?: number): string;
/**
 * Create a stage result with timing
 */
export declare function executeStage<T>(name: StageName, fn: () => Promise<T>): Promise<{
    stageResult: StageResult;
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
 * Generate a unique ID for tracking
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
 * Process items in parallel with concurrency limit
 */
export declare function parallelMap<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, concurrency?: number): Promise<R[]>;
/**
 * Debounce async function calls
 */
export declare function debounce<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, delayMs: number): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;
/**
 * Memoize async function with TTL
 */
export declare function memoizeAsync<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, ttlMs?: number, keyFn?: (...args: Parameters<T>) => string): T;
//# sourceMappingURL=utils.d.ts.map