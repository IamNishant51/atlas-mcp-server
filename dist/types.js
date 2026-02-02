/**
 * Atlas Server - Shared Type Definitions
 *
 * This module defines all shared interfaces and types used across the
 * multi-stage AI pipeline. Types are organized by domain concern.
 */
import { z } from 'zod';
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