/**
 * Atlas Server - Fastify HTTP Server
 *
 * Production-ready HTTP server with:
 * - Pipeline execution endpoints
 * - Health checks
 * - Request validation
 * - Error handling
 * - CORS support
 * - Structured logging
 */
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PipelineRequestSchema, createSessionId } from './types.js';
import { executePipeline, executeLightPipeline, getPipelineStatus } from './pipeline.js';
import { getOllamaClient } from './tools/ollama.js';
import { logger, generateId, nowISO } from './utils.js';
// ============================================================================
// Configuration
// ============================================================================
const DEFAULT_CONFIG = {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: (process.env['LOG_LEVEL'] ?? 'info'),
    corsEnabled: process.env['CORS_ENABLED'] !== 'false',
    ollama: {
        baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
        model: process.env['OLLAMA_MODEL'] ?? 'llama3.2',
        timeoutMs: parseInt(process.env['OLLAMA_TIMEOUT_MS'] ?? '120000', 10),
        maxRetries: parseInt(process.env['OLLAMA_MAX_RETRIES'] ?? '3', 10),
    },
};
/** Request timeout configuration */
const REQUEST_TIMEOUT_MS = parseInt(process.env['REQUEST_TIMEOUT_MS'] ?? '300000', 10); // 5 min default
// ============================================================================
// Server Factory
// ============================================================================
/**
 * Create and configure the Fastify server
 */
export async function createServer(config = {}) {
    const serverConfig = { ...DEFAULT_CONFIG, ...config };
    const server = Fastify({
        logger: {
            level: serverConfig.logLevel,
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            },
        },
        requestIdHeader: 'x-request-id',
        genReqId: () => generateId(),
        connectionTimeout: 60000, // 60s connection timeout
        keepAliveTimeout: 30000, // 30s keep-alive
        requestTimeout: REQUEST_TIMEOUT_MS,
        bodyLimit: 10 * 1024 * 1024, // 10MB max body
    });
    // Register plugins
    if (serverConfig.corsEnabled) {
        await server.register(cors, {
            origin: true,
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        });
    }
    // Register routes
    registerRoutes(server);
    // Register error handler
    server.setErrorHandler((error, request, reply) => {
        server.log.error({ error, requestId: request.id }, 'Request error');
        reply.status(error.statusCode ?? 500).send({
            success: false,
            error: {
                code: 'SERVER_ERROR',
                message: error.message,
                requestId: request.id,
            },
        });
    });
    // Register not found handler
    server.setNotFoundHandler((request, reply) => {
        reply.status(404).send({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: `Route ${request.method} ${request.url} not found`,
            },
        });
    });
    return server;
}
// ============================================================================
// Routes
// ============================================================================
/**
 * Register all API routes
 */
function registerRoutes(server) {
    // Health check endpoint
    server.get('/health', healthHandler);
    // Pipeline endpoints
    server.post('/api/pipeline', pipelineHandler);
    server.post('/api/pipeline/light', lightPipelineHandler);
    // Info endpoints
    server.get('/api/models', modelsHandler);
    server.get('/api/info', infoHandler);
}
// ============================================================================
// Route Handlers
// ============================================================================
/**
 * Health check handler
 */
async function healthHandler(request, reply) {
    const ollamaClient = getOllamaClient();
    const ollamaHealthy = await ollamaClient.healthCheck();
    const status = ollamaHealthy ? 'healthy' : 'degraded';
    reply.status(ollamaHealthy ? 200 : 503).send({
        status,
        version: '1.0.0',
        timestamp: nowISO(),
        services: {
            ollama: ollamaHealthy,
        },
    });
}
/**
 * Main pipeline execution handler
 */
async function pipelineHandler(request, reply) {
    const startTime = performance.now();
    // Validate request
    const parseResult = PipelineRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
        reply.status(400).send({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                details: parseResult.error.errors,
            },
        });
        return;
    }
    const pipelineRequest = {
        ...parseResult.data,
        sessionId: createSessionId(request.id),
    };
    request.log.info({
        queryLength: pipelineRequest.query.length,
        hasRepoPath: !!pipelineRequest.repoPath,
    }, 'Pipeline request received');
    // Execute pipeline
    const response = await executePipeline(pipelineRequest);
    // Log completion
    const status = getPipelineStatus(response);
    request.log.info({
        success: response.success,
        status: status.status,
        executionTimeMs: response.metadata.executionTimeMs,
        completedStages: status.completedStages,
    }, 'Pipeline request completed');
    // Send response
    reply.status(response.success ? 200 : 500).send(response);
}
/**
 * Light pipeline execution handler (faster, less thorough)
 */
async function lightPipelineHandler(request, reply) {
    // Validate request
    const parseResult = PipelineRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
        reply.status(400).send({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                details: parseResult.error.errors,
            },
        });
        return;
    }
    const pipelineRequest = {
        ...parseResult.data,
        sessionId: createSessionId(request.id),
    };
    request.log.info({ mode: 'light' }, 'Light pipeline request received');
    // Execute light pipeline
    const response = await executeLightPipeline(pipelineRequest);
    reply.status(response.success ? 200 : 500).send(response);
}
/**
 * List available models handler
 */
async function modelsHandler(request, reply) {
    try {
        const ollamaClient = getOllamaClient();
        const models = await ollamaClient.listModels();
        reply.send({
            success: true,
            models,
            currentModel: ollamaClient.model,
        });
    }
    catch (error) {
        reply.status(500).send({
            success: false,
            error: {
                code: 'MODELS_FETCH_ERROR',
                message: 'Failed to fetch models from Ollama',
            },
        });
    }
}
/**
 * Server info handler
 */
async function infoHandler(request, reply) {
    const ollamaClient = getOllamaClient();
    reply.send({
        name: 'atlas-server',
        version: '1.0.0',
        description: 'Multi-stage AI pipeline server with Ollama integration',
        endpoints: {
            health: 'GET /health',
            pipeline: 'POST /api/pipeline',
            lightPipeline: 'POST /api/pipeline/light',
            models: 'GET /api/models',
            info: 'GET /api/info',
        },
        configuration: {
            model: ollamaClient.model,
        },
        stages: [
            'intent - Analyze user intent',
            'context - Gather relevant context',
            'git - Analyze git repository state',
            'decompose - Break down into subtasks',
            'variants - Generate solution variants',
            'critique - Review and score variants',
            'optimize - Refine the best solution',
        ],
    });
}
// ============================================================================
// Server Startup
// ============================================================================
/**
 * Start the server
 */
export async function startServer(config = {}) {
    const serverConfig = { ...DEFAULT_CONFIG, ...config };
    const server = await createServer(serverConfig);
    try {
        // Initialize Ollama client
        const ollamaClient = getOllamaClient(serverConfig.ollama);
        const ollamaHealthy = await ollamaClient.healthCheck();
        if (!ollamaHealthy) {
            logger.warn('Ollama service is not available. Some features may not work.');
        }
        // Start listening
        await server.listen({
            port: serverConfig.port,
            host: serverConfig.host,
        });
        logger.info({
            port: serverConfig.port,
            host: serverConfig.host,
            ollamaModel: serverConfig.ollama.model,
            ollamaConnected: ollamaHealthy,
        }, 'Atlas server started');
        return server;
    }
    catch (error) {
        logger.error({ error }, 'Failed to start server');
        throw error;
    }
}
/**
 * Graceful shutdown handler
 */
export async function shutdown(server) {
    logger.info('Shutting down server...');
    try {
        await server.close();
        logger.info('Server shut down successfully');
    }
    catch (error) {
        logger.error({ error }, 'Error during shutdown');
        throw error;
    }
}
// ============================================================================
// Main Entry Point
// ============================================================================
// Start the server when this file is executed directly
startServer()
    .then((server) => {
    // Handle shutdown signals
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
        process.on(signal, async () => {
            logger.info({ signal }, 'Received shutdown signal');
            await shutdown(server);
            process.exit(0);
        });
    }
})
    .catch((error) => {
    logger.error({ error }, 'Fatal error during startup');
    process.exit(1);
});
//# sourceMappingURL=server.js.map