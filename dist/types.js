/**
 * Atlas Server - Shared Type Definitions
 *
 * This module defines all shared interfaces and types used across the
 * multi-stage AI pipeline. Types are organized by domain concern.
 *
 * Design Principles:
 * - Branded types for domain-specific values (IDs, scores)
 * - Strict readonly types where mutation is not expected
 * - Comprehensive Zod schemas for runtime validation
 * - Type guards for safe narrowing
 * - Lazy schema compilation for performance
 *
 * @module types
 * @author Nishant Unavane
 * @version 2.1.0
 */
import { z } from 'zod';
/** Helper to create a Score (clamped 0-100) - optimized with bitwise operations */
export function createScore(value) {
    // Use bitwise OR to convert to integer (faster than Math.round for positive numbers)
    const clamped = value < 0 ? 0 : value > 100 ? 100 : (value + 0.5) | 0;
    return clamped;
}
/** Helper to create a Confidence (clamped 0-1) */
export function createConfidence(value) {
    // Clamp between 0 and 1
    return (value < 0 ? 0 : value > 1 ? 1 : value);
}
/** Helper to create a SessionId */
export function createSessionId(value) {
    return value;
}
/** Helper to create a VariantId */
export function createVariantId(value) {
    return value;
}
/** Helper to create a TaskId */
export function createTaskId(value) {
    return value;
}
// ============================================================================
// Zod Schemas for Validation
// ============================================================================
export const PipelineRequestSchema = z.object({
    query: z.string().min(1, 'Query is required'),
    repoPath: z.string().optional(),
    userContext: z.record(z.unknown()).optional(),
    sessionId: z.string().optional(),
});
export const HealthResponseSchema = z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    version: z.string(),
    timestamp: z.string(),
    services: z.object({
        ollama: z.boolean(),
    }),
});
//# sourceMappingURL=types.js.map