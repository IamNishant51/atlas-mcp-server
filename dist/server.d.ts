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
import { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './types.js';
/**
 * Create and configure the Fastify server
 */
export declare function createServer(config?: Partial<ServerConfig>): Promise<FastifyInstance>;
/**
 * Start the server
 */
export declare function startServer(config?: Partial<ServerConfig>): Promise<FastifyInstance>;
/**
 * Graceful shutdown handler
 */
export declare function shutdown(server: FastifyInstance): Promise<void>;
//# sourceMappingURL=server.d.ts.map