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
 *
 * @module types
 * @version 2.0.0
 */
import { z } from 'zod';
/** Helper to create a Score (clamped 0-100) */
export function createScore(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
/** Helper to create a Confidence (clamped 0-1) */
export function createConfidence(value) {
    return Math.max(0, Math.min(1, value));
}
/** Helper to create a SessionId */
export function createSessionId(value) {
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