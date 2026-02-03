/**
 * Atlas Server - Input Validation and Sanitization
 * 
 * Comprehensive validation layer for all tool inputs to ensure:
 * - Type safety at runtime
 * - Security against injection attacks
 * - Proper error messages for debugging
 * - Performance through caching
 * 
 * @module validation
 * @version 1.0.0
 */

import { z } from 'zod';
import { logger } from '../utils.js';

// ============================================================================
// Security Constants
// ============================================================================

/** Maximum safe string length (prevents DoS) */
const MAX_STRING_LENGTH = 1_000_000; // 1MB

/** Maximum code size to process */
const MAX_CODE_SIZE = 500_000; // 500KB

/** Maximum array length */
const MAX_ARRAY_LENGTH = 1000;

/** Regex patterns for security validation */
const SECURITY_PATTERNS = {
  /** Path traversal attack patterns */
  PATH_TRAVERSAL: /\.\.[\/\\]/,
  /** SQL injection patterns */
  SQL_INJECTION: /(union|select|insert|update|delete|drop|create|alter|exec|script|javascript|onerror|onload)/i,
  /** Command injection patterns */
  COMMAND_INJECTION: /[;&|`$(){}[\]<>]/,
  /** Safe file path pattern */
  SAFE_PATH: /^[a-zA-Z0-9._\-\/\\:]+$/,
} as const;

// ============================================================================
// Base Schemas
// ============================================================================

/** Safe string schema with length limits */
export const SafeStringSchema = z
  .string()
  .max(MAX_STRING_LENGTH, 'String exceeds maximum length')
  .transform((val) => val.trim());

/** Code string schema with specific limits */
export const CodeStringSchema = z
  .string()
  .max(MAX_CODE_SIZE, 'Code exceeds maximum size')
  .min(1, 'Code cannot be empty');

/** File path schema with security validation */
export const FilePathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(1000, 'Path too long')
  .refine(
    (path) => !SECURITY_PATTERNS.PATH_TRAVERSAL.test(path),
    'Path contains path traversal characters'
  );

/** Optional file path */
export const OptionalFilePathSchema = FilePathSchema.optional();

/** Language identifier */
export const LanguageSchema = z.enum([
  'typescript', 'javascript', 'python', 'rust', 'go', 'java', 
  'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin', 
  'scala', 'dart', 'elixir', 'haskell', 'other'
]);

/** Framework identifier */
export const FrameworkSchema = z.enum([
  'react', 'vue', 'angular', 'svelte', 'next', 'nuxt',
  'express', 'fastify', 'nestjs', 'django', 'flask', 'spring',
  'rails', 'laravel', 'other'
]);

// ============================================================================
// Debug Tool Validation
// ============================================================================

export const DebugRequestSchema = z.object({
  error: SafeStringSchema.optional(),
  stackTrace: SafeStringSchema.optional(),
  code: CodeStringSchema.optional(),
  context: SafeStringSchema.optional(),
  language: LanguageSchema.optional(),
  framework: FrameworkSchema.optional(),
}).refine(
  (data) => data.error || data.stackTrace,
  'Either error or stackTrace must be provided'
);

export type ValidatedDebugRequest = z.infer<typeof DebugRequestSchema>;

// ============================================================================
// Documentation Tool Validation
// ============================================================================

export const DocumentationOptionsSchema = z.object({
  style: z.enum(['jsdoc', 'tsdoc', 'pydoc', 'godoc', 'rustdoc', 'auto']).optional(),
  format: z.enum(['markdown', 'html', 'json', 'plain']).optional(),
  includeExamples: z.boolean().optional(),
  includeTypes: z.boolean().optional(),
  verbose: z.boolean().optional(),
  language: LanguageSchema.optional(),
});

export type ValidatedDocumentationOptions = z.infer<typeof DocumentationOptionsSchema>;

// ============================================================================
// Explanation Tool Validation
// ============================================================================

export const ExplanationOptionsSchema = z.object({
  level: z.enum(['beginner', 'intermediate', 'expert']).optional(),
  type: z.enum(['overview', 'detailed', 'line-by-line', 'algorithm']).optional(),
  language: LanguageSchema.optional(),
  focusArea: SafeStringSchema.optional(),
  includeComplexity: z.boolean().optional(),
  includePatterns: z.boolean().optional(),
});

export type ValidatedExplanationOptions = z.infer<typeof ExplanationOptionsSchema>;

// ============================================================================
// Test Generation Validation
// ============================================================================

export const TestGenerationOptionsSchema = z.object({
  language: LanguageSchema.optional(),
  framework: z.enum(['jest', 'vitest', 'mocha', 'pytest', 'unittest', 'go_test', 'rspec', 'auto']).optional(),
  testType: z.enum(['unit', 'integration', 'e2e', 'snapshot', 'property']).optional(),
  functionName: SafeStringSchema.optional(),
  context: SafeStringSchema.optional(),
});

export type ValidatedTestGenerationOptions = z.infer<typeof TestGenerationOptionsSchema>;

// ============================================================================
// Security Scan Validation
// ============================================================================

export const SecurityScanOptionsSchema = z.object({
  language: LanguageSchema.optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info', 'all']).optional(),
  categories: z.array(z.enum([
    'injection', 'authentication', 'authorization', 'xss', 'secrets',
    'cryptography', 'configuration', 'dependencies', 'input_validation',
    'sensitive_data', 'other'
  ])).max(MAX_ARRAY_LENGTH).optional(),
});

export type ValidatedSecurityScanOptions = z.infer<typeof SecurityScanOptionsSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate and sanitize input with comprehensive error reporting
 * 
 * @template T - Zod schema type
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param context - Context for error messages
 * @returns Validated data
 * @throws {ValidationError} If validation fails
 */
export function validateInput<T extends z.ZodType>(
  schema: T,
  data: unknown,
  context: string = 'input'
): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      
      logger.error({ context, issues }, 'Validation failed');
      throw new ValidationError(
        `Invalid ${context}: ${issues}`,
        error.issues
      );
    }
    throw error;
  }
}

/**
 * Validate input and return result without throwing
 * 
 * @template T - Zod schema type
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with data or errors
 */
export function safeValidate<T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}

/**
 * Sanitize string to prevent injection attacks
 * 
 * @param input - String to sanitize
 * @param options - Sanitization options
 * @returns Sanitized string
 */
export function sanitizeString(
  input: string,
  options: {
    maxLength?: number;
    allowHtml?: boolean;
    allowSpecialChars?: boolean;
  } = {}
): string {
  const {
    maxLength = MAX_STRING_LENGTH,
    allowHtml = false,
    allowSpecialChars = true,
  } = options;

  let sanitized = input.slice(0, maxLength).trim();

  // Remove HTML if not allowed
  if (!allowHtml) {
    sanitized = sanitized
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '');
  }

  // Remove dangerous characters if not allowed
  if (!allowSpecialChars) {
    sanitized = sanitized.replace(/[<>&'"]/g, '');
  }

  return sanitized;
}

/**
 * Validate file path for security
 * 
 * @param path - Path to validate
 * @returns True if path is safe
 */
export function isSecurePath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  
  // Check for path traversal
  if (SECURITY_PATTERNS.PATH_TRAVERSAL.test(path)) return false;
  
  // Check for command injection characters
  if (SECURITY_PATTERNS.COMMAND_INJECTION.test(path)) return false;
  
  // Check length
  if (path.length > 1000) return false;
  
  return true;
}

/**
 * Sanitize code input to prevent injection
 * 
 * @param code - Code to sanitize
 * @param maxSize - Maximum size in bytes
 * @returns Sanitized code
 */
export function sanitizeCode(code: string, maxSize: number = MAX_CODE_SIZE): string {
  if (!code || typeof code !== 'string') {
    return '';
  }

  // Trim to max size
  let sanitized = code.slice(0, maxSize);

  // Remove null bytes (potential binary injection)
  sanitized = sanitized.replace(/\0/g, '');

  return sanitized;
}

// ============================================================================
// Custom Errors
// ============================================================================

/**
 * Custom validation error with detailed information
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[] = []
  ) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /** Get formatted error messages */
  getFormattedErrors(): string[] {
    return this.issues.map((issue) => 
      `${issue.path.join('.')}: ${issue.message}`
    );
  }

  /** Convert to JSON for API responses */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      issues: this.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    };
  }
}

// ============================================================================
// Rate Limiting Support
// ============================================================================

/**
 * Simple in-memory rate limiter for tool calls
 */
export class RateLimiter {
  private requests = new Map<string, number[]>();
  
  constructor(
    private readonly maxRequests: number = 100,
    private readonly windowMs: number = 60000 // 1 minute
  ) {}

  /**
   * Check if request is allowed
   * 
   * @param key - Unique identifier for the requester
   * @returns True if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    
    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(
      (ts) => now - ts < this.windowMs
    );
    
    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }
    
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    
    // Cleanup old entries periodically
    if (this.requests.size > 1000) {
      this.cleanup();
    }
    
    return true;
  }

  /**
   * Cleanup old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests) {
      const validTimestamps = timestamps.filter(
        (ts) => now - ts < this.windowMs
      );
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Get current count for a key
   */
  getCount(key: string): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    return timestamps.filter((ts) => now - ts < this.windowMs).length;
  }
}

/** Global rate limiter instance */
export const globalRateLimiter = new RateLimiter(100, 60000);
