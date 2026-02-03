/**
 * Common Error Handling and Validation Utilities
 * Centralized error handling to improve reliability across all tools
 */

import { logger } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Custom Error Classes
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class FileSystemError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message);
    this.name = 'FileSystemError';
  }
}

export class LLMProviderError extends Error {
  constructor(message: string, public readonly provider?: string) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs?: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and parse input with Zod schema
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  errorMessage?: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new ValidationError(
        errorMessage || `Validation failed: ${issues}`
      );
    }
    throw error;
  }
}

/**
 * Safely validate file path exists and is accessible
 */
export async function validatePath(path: string, type: 'file' | 'directory' = 'file'): Promise<void> {
  const { promises: fs } = await import('fs');
  
  try {
    const stats = await fs.stat(path);
    
    if (type === 'file' && !stats.isFile()) {
      throw new FileSystemError(`Path is not a file: ${path}`, path);
    }
    
    if (type === 'directory' && !stats.isDirectory()) {
      throw new FileSystemError(`Path is not a directory: ${path}`, path);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FileSystemError(`Path does not exist: ${path}`, path);
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new FileSystemError(`Permission denied: ${path}`, path);
    }
    throw error;
  }
}

/**
 * Validate required fields are present
 */
export function requireFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): void {
  const missing = fields.filter(field => obj[field] === undefined || obj[field] === null);
  
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

// ============================================================================
// Error Handling Wrappers
// ============================================================================

/**
 * Wrap async function with error handling and logging
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorMessage?: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      const message = errorMessage || `Operation failed: ${fn.name}`;
      logger.error({ error, args }, message);
      
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error(`${message}: ${String(error)}`);
    }
  }) as T;
}

/**
 * Retry async operation with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    onRetry,
  } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        
        if (onRetry) {
          onRetry(attempt, lastError);
        } else {
          logger.warn(
            { attempt, maxAttempts, delay, error: lastError },
            'Retrying after error'
          );
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}

/**
 * Add timeout to async operation
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(
        errorMessage || `Operation timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
    }, timeoutMs);
  });
  
  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T = unknown>(
  json: string,
  defaultValue?: T
): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.warn({ error }, 'Failed to parse JSON');
    return defaultValue;
  }
}

/**
 * Safe async operation with fallback
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.warn({ error }, 'Async operation failed, using fallback');
    return fallback;
  }
}

// ============================================================================
// Input Sanitization
// ============================================================================

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[';]/g, '') // Remove potential SQL injection chars
    .trim()
    .substring(0, 10000); // Limit length
}

/**
 * Validate and sanitize file path
 */
export function sanitizePath(path: string): string {
  // Remove path traversal attempts
  const sanitized = path
    .replace(/\.\./g, '')
    .replace(/\/\//g, '/')
    .trim();
  
  if (sanitized.length === 0) {
    throw new ValidationError('Invalid path: empty after sanitization');
  }
  
  return sanitized;
}

// ============================================================================
// Result Types for Better Error Handling
// ============================================================================

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create success result
 */
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create error result
 */
export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wrap function to return Result type
 */
export async function tryAsync<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return success(data);
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}
