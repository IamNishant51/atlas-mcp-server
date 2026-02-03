/**
 * Atlas Server - Resource Management and Cleanup
 * 
 * Comprehensive resource lifecycle management to prevent memory leaks:
 * - Automatic cleanup of resources
 * - Graceful shutdown handling
 * - Resource pooling and recycling
 * - Memory usage tracking
 * - File handle management
 * 
 * @module resource-manager
 * @version 1.0.0
 */

import { logger } from '../utils.js';
import type { SimpleGit } from 'simple-git';

// ============================================================================
// Resource Types
// ============================================================================

/**
 * Resource that requires cleanup
 */
export interface ManagedResource {
  /** Unique identifier for the resource */
  readonly id: string;
  /** Resource type for tracking */
  readonly type: ResourceType;
  /** Timestamp when resource was created */
  readonly createdAt: number;
  /** Last access timestamp for LRU eviction */
  lastAccessedAt: number;
  /** Cleanup function to release the resource */
  cleanup(): Promise<void> | void;
  /** Check if resource is still valid */
  isValid(): boolean;
}

/**
 * Types of managed resources
 */
export type ResourceType =
  | 'git-instance'
  | 'file-handle'
  | 'cache'
  | 'timer'
  | 'connection'
  | 'stream'
  | 'subprocess'
  | 'other';

/**
 * Git instance wrapper with lifecycle management
 */
export class ManagedGitInstance implements ManagedResource {
  readonly id: string;
  readonly type: ResourceType = 'git-instance';
  readonly createdAt: number;
  lastAccessedAt: number;

  constructor(
    readonly repoPath: string,
    private git: SimpleGit
  ) {
    this.id = `git:${repoPath}`;
    this.createdAt = Date.now();
    this.lastAccessedAt = Date.now();
  }

  /** Get the git instance and update access time */
  getGit(): SimpleGit {
    this.lastAccessedAt = Date.now();
    return this.git;
  }

  /** Check if instance is still valid */
  isValid(): boolean {
    // Git instances don't expire but can be invalidated
    return this.git !== null;
  }

  /** Cleanup the git instance */
  async cleanup(): Promise<void> {
    logger.debug({ repoPath: this.repoPath }, 'Cleaning up git instance');
    // SimpleGit doesn't require explicit cleanup, but we null it out
    (this.git as unknown) = null;
  }
}

// ============================================================================
// Resource Manager
// ============================================================================

/**
 * Centralized resource manager for automatic cleanup
 */
export class ResourceManager {
  private resources = new Map<string, ManagedResource>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownHandlers: Array<() => Promise<void> | void> = [];
  private isShuttingDown = false;

  constructor(
    private readonly options: {
      /** Cleanup interval in milliseconds */
      cleanupIntervalMs?: number;
      /** Maximum idle time before resource cleanup (milliseconds) */
      maxIdleTimeMs?: number;
      /** Maximum number of resources to keep */
      maxResources?: number;
    } = {}
  ) {
    const {
      cleanupIntervalMs = 60000, // 1 minute
      maxIdleTimeMs = 300000, // 5 minutes
      maxResources = 100,
    } = options;

    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.performCleanup(maxIdleTimeMs, maxResources);
    }, cleanupIntervalMs);

    // Register shutdown handler
    this.registerShutdownHandlers();
  }

  /**
   * Register a resource for management
   */
  register(resource: ManagedResource): void {
    if (this.isShuttingDown) {
      logger.warn('Cannot register resource during shutdown');
      return;
    }

    this.resources.set(resource.id, resource);
    logger.debug(
      { id: resource.id, type: resource.type, totalResources: this.resources.size },
      'Resource registered'
    );
  }

  /**
   * Unregister and cleanup a resource
   */
  async unregister(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (resource) {
      await this.cleanupResource(resource);
      this.resources.delete(id);
    }
  }

  /**
   * Get a resource by ID
   */
  get<T extends ManagedResource>(id: string): T | null {
    const resource = this.resources.get(id) as T | undefined;
    if (resource) {
      resource.lastAccessedAt = Date.now();
      return resource;
    }
    return null;
  }

  /**
   * Check if a resource exists
   */
  has(id: string): boolean {
    return this.resources.has(id);
  }

  /**
   * Get all resources of a specific type
   */
  getByType<T extends ManagedResource>(type: ResourceType): T[] {
    const results: T[] = [];
    for (const resource of this.resources.values()) {
      if (resource.type === type) {
        results.push(resource as T);
      }
    }
    return results;
  }

  /**
   * Perform periodic cleanup of idle resources
   */
  private async performCleanup(maxIdleTimeMs: number, maxResources: number): Promise<void> {
    const now = Date.now();
    const resourcesToCleanup: ManagedResource[] = [];

    // Find resources to cleanup
    for (const resource of this.resources.values()) {
      const idleTime = now - resource.lastAccessedAt;
      
      // Cleanup invalid or idle resources
      if (!resource.isValid() || idleTime > maxIdleTimeMs) {
        resourcesToCleanup.push(resource);
      }
    }

    // If still over limit after idle cleanup, cleanup LRU resources
    if (this.resources.size > maxResources) {
      const sorted = Array.from(this.resources.values())
        .filter((r) => !resourcesToCleanup.includes(r))
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
      
      const excess = this.resources.size - maxResources;
      resourcesToCleanup.push(...sorted.slice(0, excess));
    }

    // Cleanup resources
    if (resourcesToCleanup.length > 0) {
      logger.debug(
        { count: resourcesToCleanup.length, totalResources: this.resources.size },
        'Performing resource cleanup'
      );

      for (const resource of resourcesToCleanup) {
        await this.cleanupResource(resource);
        this.resources.delete(resource.id);
      }
    }
  }

  /**
   * Cleanup a single resource
   */
  private async cleanupResource(resource: ManagedResource): Promise<void> {
    try {
      await resource.cleanup();
      logger.debug({ id: resource.id, type: resource.type }, 'Resource cleaned up');
    } catch (error) {
      logger.error(
        { error, id: resource.id, type: resource.type },
        'Error cleaning up resource'
      );
    }
  }

  /**
   * Register a custom shutdown handler
   */
  onShutdown(handler: () => Promise<void> | void): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Graceful shutdown - cleanup all resources
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info({ resourceCount: this.resources.size }, 'Starting graceful shutdown');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Run custom shutdown handlers
    for (const handler of this.shutdownHandlers) {
      try {
        await handler();
      } catch (error) {
        logger.error({ error }, 'Error in shutdown handler');
      }
    }

    // Cleanup all resources
    const cleanupPromises = Array.from(this.resources.values()).map((resource) =>
      this.cleanupResource(resource)
    );

    await Promise.allSettled(cleanupPromises);
    this.resources.clear();

    logger.info('Graceful shutdown complete');
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerShutdownHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    for (const signal of signals) {
      process.once(signal, () => {
        logger.info({ signal }, 'Received shutdown signal');
        this.shutdown()
          .then(() => process.exit(0))
          .catch((error) => {
            logger.error({ error }, 'Error during shutdown');
            process.exit(1);
          });
      });
    }

    // Handle uncaught errors
    process.once('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
      this.shutdown()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });

    process.once('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled rejection');
      this.shutdown()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });
  }

  /**
   * Get resource statistics
   */
  getStats(): {
    total: number;
    byType: Record<ResourceType, number>;
    oldestResourceAge: number;
  } {
    const byType: Partial<Record<ResourceType, number>> = {};
    let oldestAge = 0;
    const now = Date.now();

    for (const resource of this.resources.values()) {
      byType[resource.type] = (byType[resource.type] || 0) + 1;
      const age = now - resource.createdAt;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      total: this.resources.size,
      byType: byType as Record<ResourceType, number>,
      oldestResourceAge: oldestAge,
    };
  }
}

// ============================================================================
// Global Resource Manager
// ============================================================================

/** Global resource manager instance */
export const globalResourceManager = new ResourceManager({
  cleanupIntervalMs: 60000, // 1 minute
  maxIdleTimeMs: 300000, // 5 minutes
  maxResources: 100,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a managed resource with automatic cleanup
 * 
 * @param create - Function to create the resource
 * @param cleanup - Function to cleanup the resource
 * @param options - Resource options
 * @returns The created resource
 */
export async function withManagedResource<T>(
  create: () => Promise<T> | T,
  cleanup: (resource: T) => Promise<void> | void,
  options: {
    id: string;
    type: ResourceType;
    autoRegister?: boolean;
  }
): Promise<T> {
  const { id, type, autoRegister = true } = options;
  
  const resource = await create();
  
  if (autoRegister) {
    const managedResource: ManagedResource = {
      id,
      type,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      cleanup: () => cleanup(resource),
      isValid: () => resource !== null && resource !== undefined,
    };
    
    globalResourceManager.register(managedResource);
  }
  
  return resource;
}

/**
 * Execute a function with automatic resource cleanup
 * 
 * @param fn - Function to execute
 * @param resources - Resources to cleanup after execution
 * @returns Result of the function
 */
export async function withCleanup<T>(
  fn: () => Promise<T> | T,
  resources: ManagedResource[]
): Promise<T> {
  try {
    return await fn();
  } finally {
    // Cleanup resources in parallel
    await Promise.allSettled(
      resources.map((resource) => resource.cleanup())
    );
  }
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  private readonly threshold: number;
  private warnings = 0;

  constructor(thresholdMB: number = 512) {
    this.threshold = thresholdMB * 1024 * 1024; // Convert to bytes
  }

  /**
   * Check current memory usage
   */
  check(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    isOverThreshold: boolean;
  } {
    const usage = process.memoryUsage();
    const isOverThreshold = usage.heapUsed > this.threshold;

    if (isOverThreshold) {
      this.warnings++;
      logger.warn(
        {
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
          thresholdMB: Math.round(this.threshold / 1024 / 1024),
          warnings: this.warnings,
        },
        'Memory usage exceeds threshold'
      );
    }

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      isOverThreshold,
    };
  }

  /**
   * Force garbage collection if available
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      logger.debug('Forced garbage collection');
      return true;
    }
    logger.debug('Garbage collection not available (run with --expose-gc)');
    return false;
  }
}

/** Global memory monitor */
export const globalMemoryMonitor = new MemoryMonitor(512);
