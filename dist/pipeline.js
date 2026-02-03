/**
 * Atlas Server - Multi-Stage Pipeline
 *
 * Orchestrates the complete AI pipeline with optimized parallel execution:
 * 1. Intent Analysis - Understand what the user wants
 * 2. Context Gathering - Collect relevant code and project info
 * 3. Git Context - Understand repository state (parallel with context)
 * 4. Task Decomposition - Break down into subtasks
 * 5. Variant Generation - Create multiple solutions
 * 6. Critique - Review and score variants
 * 7. Optimization - Refine the best solution
 *
 * Performance Features:
 * - Parallel execution of independent stages
 * - Request deduplication for concurrent pipeline calls
 * - Comprehensive metrics collection
 * - Graceful degradation on stage failures
 *
 * @module pipeline
 * @author Nishant Unavane
 * @version 2.1.0
 */
import { analyzeIntent } from './tools/intent.js';
import { buildContext } from './tools/context.js';
import { getGitContext } from './tools/git.js';
import { decomposeTask } from './tools/decompose.js';
import { generateVariants } from './tools/variants.js';
import { critiqueVariants } from './tools/critique.js';
import { optimizeVariant } from './tools/optimize.js';
import { getOllamaClient } from './tools/ollama.js';
import { logger, executeStage, createPipelineError, nowISO, formatDuration, generateId, globalMetrics, RequestDeduplicator, } from './utils.js';
// ============================================================================
// Pipeline Deduplication and Caching
// ============================================================================
/** Request deduplicator for concurrent identical pipeline requests */
const pipelineDeduplicator = new RequestDeduplicator();
/**
 * Generate a unique key for a pipeline request
 */
function generatePipelineKey(request) {
    return `${request.query.substring(0, 100)}|${request.repoPath ?? 'no-repo'}`;
}
// ============================================================================
// Pipeline Execution
// ============================================================================
/**
 * Execute the complete multi-stage pipeline with deduplication
 */
export async function executePipeline(request) {
    const pipelineKey = generatePipelineKey(request);
    // Deduplicate concurrent identical requests
    return pipelineDeduplicator.execute(pipelineKey, () => executePipelineInternal(request));
}
/**
 * Internal pipeline execution (called after deduplication)
 */
async function executePipelineInternal(request) {
    const startTime = performance.now();
    const startedAt = nowISO();
    const pipelineId = generateId();
    const stages = [];
    logger.info({
        pipelineId,
        queryLength: request.query.length,
        hasRepoPath: !!request.repoPath,
        sessionId: request.sessionId,
    }, 'Pipeline execution started');
    try {
        // Stage 1: Intent Analysis
        const { stageResult: intentResult, output: intent } = await globalMetrics.measure('pipeline.intent', () => executeStage('intent', () => analyzeIntent(request.query)), { pipelineId });
        stages.push(intentResult);
        if (!intentResult.success || !intent) {
            throw createPipelineError('INTENT_ANALYSIS_FAILED', 'Failed to analyze user intent', 'intent');
        }
        logger.debug({
            primaryIntent: intent.primaryIntent,
            confidence: intent.confidence,
            entityCount: intent.entities.length,
        }, 'Intent analysis complete');
        // Stage 2 & 3: Git Context and Context Building (parallel execution)
        const gitContextPromise = request.repoPath
            ? executeStage('git', () => getGitContext(request.repoPath))
            : Promise.resolve({ stageResult: createSkippedStage('git'), output: null });
        // Run git context in parallel - await it when needed
        const [gitResultData, intentBasedContextData] = await Promise.all([
            gitContextPromise,
            executeStage('context', async () => {
                // Wait for git context to complete first for full context
                const { output: gitCtx } = await gitContextPromise;
                return buildContext(intent, request.repoPath, gitCtx ?? undefined);
            }),
        ]);
        const { stageResult: gitResult, output: gitContext } = gitResultData;
        const { stageResult: contextResult, output: context } = intentBasedContextData;
        stages.push(gitResult);
        stages.push(contextResult);
        if (!contextResult.success || !context) {
            throw createPipelineError('CONTEXT_BUILD_FAILED', 'Failed to build context', 'context');
        }
        // Stage 4: Task Decomposition
        const { stageResult: decomposeResult, output: decomposition } = await executeStage('decompose', () => decomposeTask(context));
        stages.push(decomposeResult);
        if (!decomposeResult.success || !decomposition) {
            throw createPipelineError('DECOMPOSITION_FAILED', 'Failed to decompose task', 'decompose');
        }
        logger.debug({
            taskCount: decomposition.tasks.length,
            complexity: decomposition.overallComplexity,
        }, 'Task decomposition complete');
        // Stage 5: Variant Generation
        const { stageResult: variantsResult, output: variantData } = await executeStage('variants', () => generateVariants(context, decomposition));
        stages.push(variantsResult);
        if (!variantsResult.success || !variantData) {
            throw createPipelineError('VARIANT_GENERATION_FAILED', 'Failed to generate variants', 'variants');
        }
        logger.debug({
            variantCount: variantData.variants.length,
            recommendedId: variantData.recommendedVariantId,
        }, 'Variant generation complete');
        // Stage 6: Critique
        const { stageResult: critiqueResult, output: critiqueData } = await executeStage('critique', () => critiqueVariants(variantData.variants));
        stages.push(critiqueResult);
        if (!critiqueResult.success || !critiqueData) {
            throw createPipelineError('CRITIQUE_FAILED', 'Failed to critique variants', 'critique');
        }
        logger.debug({
            bestVariantId: critiqueData.bestVariantId,
            summary: critiqueData.summary,
        }, 'Critique complete');
        // Stage 7: Optimization
        const bestVariant = variantData.variants.find((v) => v.id === critiqueData.bestVariantId);
        const bestCritique = critiqueData.critiques.find((c) => c.variantId === critiqueData.bestVariantId);
        if (!bestVariant || !bestCritique) {
            throw createPipelineError('OPTIMIZATION_FAILED', 'Could not find best variant for optimization', 'optimize');
        }
        const { stageResult: optimizeResult, output: optimizedOutput } = await executeStage('optimize', () => optimizeVariant(bestVariant, bestCritique));
        stages.push(optimizeResult);
        if (!optimizeResult.success || !optimizedOutput) {
            throw createPipelineError('OPTIMIZATION_FAILED', 'Failed to optimize variant', 'optimize');
        }
        // Calculate final metrics
        const executionTimeMs = Math.round(performance.now() - startTime);
        const completedAt = nowISO();
        const metadata = {
            executionTimeMs,
            stages,
            model: getOllamaClient().model,
            startedAt,
            completedAt,
        };
        logger.info({
            executionTime: formatDuration(executionTimeMs),
            stagesCompleted: stages.filter((s) => s.success).length,
            totalStages: stages.length,
        }, 'Pipeline execution completed successfully');
        return {
            success: true,
            result: optimizedOutput.content,
            metadata,
        };
    }
    catch (error) {
        const executionTimeMs = Math.round(performance.now() - startTime);
        const pipelineError = error && typeof error === 'object' && 'code' in error
            ? error
            : {
                code: 'PIPELINE_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        logger.error({
            error: pipelineError,
            executionTimeMs,
            stagesCompleted: stages.length,
        }, 'Pipeline execution failed');
        return {
            success: false,
            result: '',
            metadata: {
                executionTimeMs,
                stages,
                model: getOllamaClient().model,
                startedAt,
                completedAt: nowISO(),
            },
            error: {
                code: pipelineError.code,
                message: pipelineError.message,
                stage: pipelineError.stage,
            },
        };
    }
}
/**
 * Create a skipped stage result
 */
function createSkippedStage(name) {
    return {
        name,
        success: true,
        durationMs: 0,
        output: null,
    };
}
// ============================================================================
// Pipeline Variants
// ============================================================================
/**
 * Execute a lightweight pipeline (skip some stages for speed)
 */
export async function executeLightPipeline(request) {
    const startTime = performance.now();
    const startedAt = nowISO();
    const stages = [];
    logger.info({ mode: 'light' }, 'Light pipeline execution started');
    try {
        // Stage 1: Intent Analysis
        const { stageResult: intentResult, output: intent } = await executeStage('intent', () => analyzeIntent(request.query));
        stages.push(intentResult);
        if (!intent) {
            throw createPipelineError('INTENT_FAILED', 'Intent analysis failed', 'intent');
        }
        // Stage 2: Minimal Context
        const { stageResult: contextResult, output: context } = await executeStage('context', () => buildContext(intent, request.repoPath));
        stages.push(contextResult);
        if (!context) {
            throw createPipelineError('CONTEXT_FAILED', 'Context build failed', 'context');
        }
        // Stage 3: Single Variant Generation (skip decomposition for speed)
        const simpleDecomposition = {
            summary: `${intent.primaryIntent}: ${intent.keywords.join(', ')}`,
            tasks: [{
                    id: '1',
                    description: 'Implement solution',
                    type: 'implementation',
                    priority: 1,
                    dependencies: [],
                    complexity: 'medium',
                }],
            executionOrder: ['1'],
            overallComplexity: 'medium',
        };
        const { stageResult: variantsResult, output: variantData } = await executeStage('variants', () => generateVariants(context, simpleDecomposition, 1));
        stages.push(variantsResult);
        if (!variantData || variantData.variants.length === 0) {
            throw createPipelineError('VARIANTS_FAILED', 'Variant generation failed', 'variants');
        }
        // Return first variant without critique/optimization
        const executionTimeMs = Math.round(performance.now() - startTime);
        return {
            success: true,
            result: variantData.variants[0].content,
            metadata: {
                executionTimeMs,
                stages,
                model: getOllamaClient().model,
                startedAt,
                completedAt: nowISO(),
            },
        };
    }
    catch (error) {
        const executionTimeMs = Math.round(performance.now() - startTime);
        return {
            success: false,
            result: '',
            metadata: {
                executionTimeMs,
                stages,
                model: getOllamaClient().model,
                startedAt,
                completedAt: nowISO(),
            },
            error: {
                code: 'LIGHT_PIPELINE_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
        };
    }
}
/**
 * Execute pipeline with streaming progress updates
 */
export async function executePipelineWithProgress(request, onProgress) {
    const startTime = performance.now();
    const startedAt = nowISO();
    const stages = [];
    const runStage = async (name, fn) => {
        onProgress(name, 'started');
        const result = await executeStage(name, fn);
        onProgress(name, result.stageResult.success ? 'completed' : 'failed', result.output);
        return result;
    };
    try {
        // Run all stages with progress callbacks
        const { output: intent } = await runStage('intent', () => analyzeIntent(request.query));
        if (!intent)
            throw new Error('Intent analysis failed');
        stages.push({ name: 'intent', success: true, durationMs: 0 });
        const gitContext = request.repoPath
            ? (await runStage('git', () => getGitContext(request.repoPath))).output
            : null;
        stages.push({ name: 'git', success: true, durationMs: 0 });
        const { output: context } = await runStage('context', () => buildContext(intent, request.repoPath, gitContext ?? undefined));
        if (!context)
            throw new Error('Context build failed');
        stages.push({ name: 'context', success: true, durationMs: 0 });
        const { output: decomposition } = await runStage('decompose', () => decomposeTask(context));
        if (!decomposition)
            throw new Error('Decomposition failed');
        stages.push({ name: 'decompose', success: true, durationMs: 0 });
        const { output: variantData } = await runStage('variants', () => generateVariants(context, decomposition));
        if (!variantData)
            throw new Error('Variant generation failed');
        stages.push({ name: 'variants', success: true, durationMs: 0 });
        const { output: critiqueData } = await runStage('critique', () => critiqueVariants(variantData.variants));
        if (!critiqueData)
            throw new Error('Critique failed');
        stages.push({ name: 'critique', success: true, durationMs: 0 });
        const bestVariant = variantData.variants.find((v) => v.id === critiqueData.bestVariantId);
        const bestCritique = critiqueData.critiques.find((c) => c.variantId === critiqueData.bestVariantId);
        if (!bestVariant || !bestCritique)
            throw new Error('Best variant not found');
        const { output: optimized } = await runStage('optimize', () => optimizeVariant(bestVariant, bestCritique));
        if (!optimized)
            throw new Error('Optimization failed');
        stages.push({ name: 'optimize', success: true, durationMs: 0 });
        return {
            success: true,
            result: optimized.content,
            metadata: {
                executionTimeMs: Math.round(performance.now() - startTime),
                stages,
                model: getOllamaClient().model,
                startedAt,
                completedAt: nowISO(),
            },
        };
    }
    catch (error) {
        return {
            success: false,
            result: '',
            metadata: {
                executionTimeMs: Math.round(performance.now() - startTime),
                stages,
                model: getOllamaClient().model,
                startedAt,
                completedAt: nowISO(),
            },
            error: {
                code: 'PIPELINE_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
        };
    }
}
// ============================================================================
// Pipeline Utilities
// ============================================================================
/**
 * Validate a pipeline request
 */
export function validateRequest(request) {
    if (!request || typeof request !== 'object')
        return false;
    const req = request;
    if (typeof req['query'] !== 'string' || req['query'].length === 0) {
        return false;
    }
    if (req['repoPath'] !== undefined && typeof req['repoPath'] !== 'string') {
        return false;
    }
    return true;
}
/**
 * Get pipeline status summary
 */
export function getPipelineStatus(response) {
    const completedStages = response.metadata.stages.filter((s) => s.success).length;
    const totalStages = response.metadata.stages.length;
    const failedStage = response.metadata.stages.find((s) => !s.success)?.name;
    let status;
    if (response.success) {
        status = 'success';
    }
    else if (completedStages > 0) {
        status = 'partial';
    }
    else {
        status = 'failed';
    }
    return { status, completedStages, totalStages, failedStage };
}
//# sourceMappingURL=pipeline.js.map