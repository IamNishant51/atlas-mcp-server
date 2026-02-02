/**
 * Atlas Server - Utility Functions
 *
 * Shared utilities for logging, timing, error handling, and common operations.
 */
import pino from 'pino';
// ============================================================================
// Logger Configuration
// ============================================================================
/**
 * Check if running in MCP stdio mode (suppress pretty output)
 */
const isMcpMode = process.argv[1]?.includes('mcp') || process.env['MCP_MODE'] === 'true';
/**
 * Create a configured pino logger instance
 * In MCP mode, we disable pretty printing to avoid polluting stdio
 */
export function createLogger(level = 'info') {
    // In MCP mode, use silent or minimal logging to avoid interfering with stdio JSON
    if (isMcpMode) {
        return pino({
            level: process.env['LOG_LEVEL'] ?? 'silent', // Silent by default in MCP mode
        });
    }
    return pino({
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
}
/** Default logger instance */
export const logger = createLogger(process.env['LOG_LEVEL'] ?? 'info');
// ============================================================================
// Timing Utilities
// ============================================================================
/**
 * Measure execution time of an async function
 */
export async function measureTime(fn) {
    const start = performance.now();
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    return { result, durationMs };
}
/**
 * Create a simple timer for measuring elapsed time
 */
export function createTimer() {
    const start = performance.now();
    return {
        elapsed: () => Math.round(performance.now() - start),
    };
}
/**
 * Safely stringify an object, handling circular references
 */
export function safeStringify(obj, indent = 2) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    }, indent);
}
/**
 * Create a stage result with timing
 */
export async function executeStage(name, fn) {
    const start = performance.now();
    try {
        const output = await fn();
        const durationMs = Math.round(performance.now() - start);
        return {
            stageResult: {
                name,
                success: true,
                durationMs,
                output,
            },
            output,
        };
    }
    catch (error) {
        const durationMs = Math.round(performance.now() - start);
        logger.error({ stage: name, error }, `Stage ${name} failed`);
        return {
            stageResult: {
                name,
                success: false,
                durationMs,
                output: error instanceof Error ? error.message : 'Unknown error',
            },
            output: null,
        };
    }
}
// ============================================================================
// Error Utilities
// ============================================================================
/**
 * Create a structured pipeline error
 */
export function createPipelineError(code, message, stage, details) {
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
export function isError(value) {
    return value instanceof Error;
}
/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error) {
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
 * Generate a unique ID for tracking
 */
export function generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str, maxLength) {
    if (str.length <= maxLength)
        return str;
    return `${str.substring(0, maxLength - 3)}...`;
}
/**
 * Clean and normalize whitespace in a string
 */
export function normalizeWhitespace(str) {
    return str.replace(/\s+/g, ' ').trim();
}
/**
 * Extract code blocks from markdown text
 */
export function extractCodeBlocks(text) {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        blocks.push({
            language: match[1] ?? 'text',
            code: match[2]?.trim() ?? '',
        });
    }
    return blocks;
}
const defaultRetryOptions = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
};
/**
 * Retry an async function with exponential backoff
 */
export async function retry(fn, options = {}) {
    const opts = { ...defaultRetryOptions, ...options };
    let lastError;
    let delay = opts.initialDelayMs;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === opts.maxAttempts) {
                break;
            }
            logger.warn({ attempt, maxAttempts: opts.maxAttempts, delay }, 'Retrying after failure');
            await sleep(delay);
            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
        }
    }
    throw lastError;
}
/**
 * Sleep for a specified duration
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ============================================================================
// JSON Utilities
// ============================================================================
/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse(text) {
    try {
        const data = JSON.parse(text);
        return { success: true, data };
    }
    catch {
        return { success: false, error: 'Invalid JSON' };
    }
}
/**
 * Extract JSON from a text that might contain markdown or other content
 */
export function extractJson(text) {
    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        const result = safeJsonParse(jsonMatch[0]);
        if (result.success) {
            return result.data;
        }
    }
    // Try to find JSON array
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        const result = safeJsonParse(arrayMatch[0]);
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
export function isDefined(value) {
    return value !== null && value !== undefined;
}
/**
 * Ensure a value is defined or throw
 */
export function ensureDefined(value, message) {
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
export function nowISO() {
    return new Date().toISOString();
}
/**
 * Format milliseconds to human-readable duration
 */
export function formatDuration(ms) {
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
 * Process items in parallel with concurrency limit
 */
export async function parallelMap(items, fn, concurrency = 3) {
    const results = [];
    const executing = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const promise = fn(item, i).then((result) => {
            results[i] = result;
        });
        executing.push(promise);
        if (executing.length >= concurrency) {
            await Promise.race(executing);
            // Remove completed promises
            for (let j = executing.length - 1; j >= 0; j--) {
                if (executing[j]) {
                    executing[j].then(() => executing.splice(j, 1)).catch(() => { });
                }
            }
        }
    }
    await Promise.all(executing);
    return results;
}
/**
 * Debounce async function calls
 */
export function debounce(fn, delayMs) {
    let timeoutId = null;
    let pendingPromise = null;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        pendingPromise = new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => {
                fn(...args)
                    .then((result) => resolve(result))
                    .catch(reject);
            }, delayMs);
        });
        return pendingPromise;
    };
}
/**
 * Memoize async function with TTL
 */
export function memoizeAsync(fn, ttlMs = 60000, keyFn = (...args) => JSON.stringify(args)) {
    const cache = new Map();
    return ((...args) => {
        const key = keyFn(...args);
        const now = Date.now();
        const cached = cache.get(key);
        if (cached && cached.expiry > now) {
            return Promise.resolve(cached.value);
        }
        return fn(...args).then((result) => {
            cache.set(key, { value: result, expiry: now + ttlMs });
            // Cleanup old entries
            if (cache.size > 100) {
                for (const [k, v] of cache) {
                    if (v.expiry <= now)
                        cache.delete(k);
                }
            }
            return result;
        });
    });
}
//# sourceMappingURL=utils.js.map