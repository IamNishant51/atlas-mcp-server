/**
 * Atlas Server - Git Context Tool
 *
 * Provides git repository context including:
 * - Current branch and status (cached for performance)
 * - Recent commit history with filtering
 * - Uncommitted changes and diffs
 * - File history and blame information
 * - Resource-managed git instances
 *
 * Features:
 * - Automatic git instance caching and cleanup
 * - Parallel git operations where safe
 * - Comprehensive error handling
 * - Request deduplication for concurrent calls
 *
 * @module git
 * @version 2.0.0
 */
import { simpleGit } from 'simple-git';
import { logger, getErrorMessage, LRUCache, RequestDeduplicator, globalMetrics } from '../utils.js';
import { ManagedGitInstance, globalResourceManager } from './resource-manager.js';
// ============================================================================
// Configuration and Caching
// ============================================================================
/** Default number of commits to fetch */
const DEFAULT_COMMIT_LIMIT = 10;
/** Maximum number of commits to fetch (prevents memory issues) */
const MAX_COMMIT_LIMIT = 1000;
/** Git operation timeout (30 seconds) */
const GIT_TIMEOUT_MS = 30000;
/** Cache TTL for git context (2 minutes) */
const GIT_CONTEXT_CACHE_TTL = 120000;
/** Cache size for git operations */
const GIT_CACHE_SIZE = 50;
/** Cache for git context results */
const gitContextCache = new LRUCache(GIT_CACHE_SIZE, GIT_CONTEXT_CACHE_TTL);
/** Deduplicator for concurrent git operations */
const gitDeduplicator = new RequestDeduplicator();
/** Cache for repository validation */
const repoValidationCache = new LRUCache(100, 300000); // 5 min TTL
/**
 * Get or create a resource-managed git instance for a repository
 * Automatically registers for cleanup and lifecycle management
 *
 * @param repoPath - Repository path
 * @returns SimpleGit instance
 */
function getGitInstance(repoPath) {
    const resourceId = `git:${repoPath}`;
    // Check if already registered
    const existing = globalResourceManager.get(resourceId);
    if (existing) {
        return existing.getGit();
    }
    // Create new instance and register it
    const git = simpleGit({
        baseDir: repoPath,
        binary: 'git',
        maxConcurrentProcesses: 6,
        trimmed: false,
    });
    const managedGit = new ManagedGitInstance(repoPath, git);
    globalResourceManager.register(managedGit);
    return git;
}
/**
 * Wrapper for git operations with consistent error handling and timeout
 *
 * @template T - Return type
 * @param operation - Operation name for logging
 * @param context - Context for logging
 * @param fn - Async function to execute
 * @param fallback - Fallback value if operation fails
 * @param timeoutMs - Optional timeout in milliseconds
 * @returns Result or fallback value
 */
async function withGitErrorHandling(operation, context, fn, fallback, timeoutMs = GIT_TIMEOUT_MS) {
    try {
        // Add timeout to prevent hanging
        const result = await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Git operation timed out after ${timeoutMs}ms`)), timeoutMs)),
        ]);
        return result;
    }
    catch (error) {
        const errorMsg = getErrorMessage(error);
        logger.error({ error: errorMsg, ...context }, `Failed to ${operation}`);
        return fallback;
    }
}
// ============================================================================
// Git Context Retrieval (Enhanced)
// ============================================================================
/**
 * Get comprehensive git context for a repository with caching and deduplication
 *
 * @param repoPath - Repository path (will be validated)
 * @param commitLimit - Number of commits to fetch (default: 10, max: 1000)
 * @returns Git context or null if not a valid repository
 *
 * @example
 * ```typescript
 * const context = await getGitContext('/path/to/repo', 20);
 * if (context) {
 *   console.log(`Branch: ${context.currentBranch}`);
 *   console.log(`Commits: ${context.recentCommits.length}`);
 * }
 * ```
 */
export async function getGitContext(repoPath, commitLimit = DEFAULT_COMMIT_LIMIT) {
    // Input validation
    if (!repoPath || typeof repoPath !== 'string') {
        logger.warn('Invalid repoPath provided to getGitContext');
        return null;
    }
    // Clamp commit limit to prevent excessive memory usage
    const safeCommitLimit = Math.min(Math.max(1, commitLimit), MAX_COMMIT_LIMIT);
    // Check cache first (with commit limit as part of key)
    const cacheKey = `${repoPath}:${safeCommitLimit}`;
    const cached = gitContextCache.get(cacheKey);
    if (cached) {
        logger.debug({ repoPath }, 'Using cached git context');
        return cached;
    }
    // Deduplicate concurrent requests for same repo
    return gitDeduplicator.execute(cacheKey, async () => {
        return globalMetrics.measure('git_get_context', async () => {
            const context = await withGitErrorHandling('get git context', { repoPath }, async () => {
                const git = getGitInstance(repoPath);
                // Check if this is a git repository (with caching)
                const isRepo = await checkIsRepo(repoPath, git);
                if (!isRepo) {
                    logger.debug({ repoPath }, 'Not a git repository');
                    return null;
                }
                // Gather all context in parallel for performance
                const [branch, status, log, remotes] = await Promise.all([
                    git.branch(),
                    git.status(),
                    git.log({ maxCount: safeCommitLimit }),
                    git.getRemotes(true),
                ]);
                const context = {
                    currentBranch: branch.current,
                    recentCommits: formatCommits(log),
                    uncommittedChanges: formatChanges(status),
                    remoteUrl: remotes[0]?.refs?.fetch,
                    isDirty: !status.isClean(),
                };
                logger.debug({
                    branch: context.currentBranch,
                    commits: context.recentCommits.length,
                    changes: context.uncommittedChanges.length,
                    isDirty: context.isDirty,
                }, 'Git context retrieved');
                // Cache the result
                gitContextCache.set(cacheKey, context);
                return context;
            }, null);
            return context;
        }, { repoPath });
    });
}
/**
 * Check if directory is a git repository (with caching)
 *
 * @param repoPath - Repository path
 * @param git - Git instance
 * @returns True if valid git repository
 */
async function checkIsRepo(repoPath, git) {
    const cached = repoValidationCache.get(repoPath);
    if (cached !== undefined) {
        return cached;
    }
    try {
        const isRepo = await git.checkIsRepo();
        repoValidationCache.set(repoPath, isRepo);
        return isRepo;
    }
    catch {
        repoValidationCache.set(repoPath, false);
        return false;
    }
}
/**
 * Get the diff for uncommitted changes
 */
export async function getUncommittedDiff(repoPath) {
    return withGitErrorHandling('get uncommitted diff', { repoPath }, async () => {
        const git = getGitInstance(repoPath);
        const diff = await git.diff();
        return diff || null;
    }, null);
}
/**
 * Get the diff for a specific commit
 */
export async function getCommitDiff(repoPath, commitHash) {
    return withGitErrorHandling('get commit diff', { repoPath, commitHash }, async () => {
        const git = getGitInstance(repoPath);
        const diff = await git.show([commitHash, '--pretty=format:', '--patch']);
        return diff || null;
    }, null);
}
/**
 * Get blame information for a file
 */
export async function getFileBlame(repoPath, filePath) {
    return withGitErrorHandling('get file blame', { repoPath, filePath }, async () => {
        const git = getGitInstance(repoPath);
        const blame = await git.raw(['blame', '--line-porcelain', filePath]);
        return parseBlame(blame);
    }, null);
}
/**
 * Get file history (commits that modified a file)
 */
export async function getFileHistory(repoPath, filePath, limit = 10) {
    return withGitErrorHandling('get file history', { repoPath, filePath }, async () => {
        const git = getGitInstance(repoPath);
        const log = await git.log({
            file: filePath,
            maxCount: limit,
        });
        return formatCommits(log);
    }, []);
}
/**
 * Get list of files changed between two refs
 */
export async function getChangedFiles(repoPath, fromRef, toRef = 'HEAD') {
    return withGitErrorHandling('get changed files', { repoPath, fromRef, toRef }, async () => {
        const git = getGitInstance(repoPath);
        const result = await git.raw(['diff', '--name-only', fromRef, toRef]);
        return result.split('\n').filter(Boolean);
    }, []);
}
/**
 * Get the current HEAD commit hash
 */
export async function getHeadCommit(repoPath) {
    return withGitErrorHandling('get HEAD commit', { repoPath }, async () => {
        const git = getGitInstance(repoPath);
        const result = await git.revparse(['HEAD']);
        return result.trim();
    }, null);
}
/**
 * List all branches (local and remote)
 */
export async function listBranches(repoPath) {
    return withGitErrorHandling('list branches', { repoPath }, async () => {
        const git = getGitInstance(repoPath);
        const branches = await git.branch(['-a']);
        return {
            current: branches.current,
            local: branches.all.filter((b) => !b.startsWith('remotes/')),
            remote: branches.all
                .filter((b) => b.startsWith('remotes/'))
                .map((b) => b.replace(/^remotes\//, '')),
        };
    }, { current: '', local: [], remote: [] });
}
// ============================================================================
// Formatting Functions
// ============================================================================
/**
 * Format git log entries to our GitCommit type
 */
function formatCommits(log) {
    return log.all.map((entry) => ({
        hash: entry.hash.substring(0, 7),
        message: entry.message,
        author: entry.author_name,
        date: entry.date,
        filesChanged: 0, // Would need additional call to get this
    }));
}
/**
 * Format git status to our GitChange type (optimized with Sets)
 */
function formatChanges(status) {
    const changes = [];
    const stagedSet = new Set(status.staged);
    const createdSet = new Set(status.created);
    const notAddedSet = new Set(status.not_added);
    const deletedSet = new Set(status.deleted);
    const renamedToSet = new Set(status.renamed.map((r) => r.to));
    // Staged changes
    for (const file of status.staged) {
        changes.push({
            path: file,
            type: getChangeTypeOptimized(file, createdSet, notAddedSet, deletedSet, renamedToSet),
            staged: true,
        });
    }
    // Unstaged changes (modified)
    for (const file of status.modified) {
        if (!stagedSet.has(file)) {
            changes.push({
                path: file,
                type: 'modified',
                staged: false,
            });
        }
    }
    // Untracked files
    for (const file of status.not_added) {
        changes.push({
            path: file,
            type: 'added',
            staged: false,
        });
    }
    // Deleted files
    for (const file of status.deleted) {
        if (!stagedSet.has(file)) {
            changes.push({
                path: file,
                type: 'deleted',
                staged: false,
            });
        }
    }
    return changes;
}
/**
 * Determine change type using Sets for O(1) lookup
 */
function getChangeTypeOptimized(file, createdSet, notAddedSet, deletedSet, renamedToSet) {
    if (createdSet.has(file) || notAddedSet.has(file))
        return 'added';
    if (deletedSet.has(file))
        return 'deleted';
    if (renamedToSet.has(file))
        return 'renamed';
    return 'modified';
}
/**
 * Parse git blame porcelain output
 */
function parseBlame(blameOutput) {
    const lines = blameOutput.split('\n');
    const blameInfo = [];
    let currentHash = '';
    let currentAuthor = '';
    let currentDate = '';
    let lineNumber = 0;
    for (const line of lines) {
        // Commit hash line (40 hex chars followed by line numbers)
        const hashMatch = line.match(/^([a-f0-9]{40})\s+(\d+)\s+(\d+)/);
        if (hashMatch) {
            currentHash = hashMatch[1]?.substring(0, 7) ?? '';
            lineNumber = parseInt(hashMatch[3] ?? '0', 10);
            continue;
        }
        // Author line
        if (line.startsWith('author ')) {
            currentAuthor = line.substring(7);
            continue;
        }
        // Author time line
        if (line.startsWith('author-time ')) {
            const timestamp = parseInt(line.substring(12), 10);
            currentDate = new Date(timestamp * 1000).toISOString();
            continue;
        }
        // Content line (starts with tab)
        if (line.startsWith('\t')) {
            blameInfo.push({
                lineNumber,
                commitHash: currentHash,
                author: currentAuthor,
                date: currentDate,
                content: line.substring(1),
            });
        }
    }
    return blameInfo;
}
// ============================================================================
// Git Operations (for future use)
// ============================================================================
/**
 * Create a new branch
 */
export async function createBranch(repoPath, branchName, startPoint) {
    try {
        const git = simpleGit(repoPath);
        if (startPoint) {
            await git.checkoutBranch(branchName, startPoint);
        }
        else {
            await git.checkoutLocalBranch(branchName);
        }
        logger.info({ branchName }, 'Branch created');
        return true;
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error), branchName }, 'Failed to create branch');
        return false;
    }
}
/**
 * Stage files for commit
 */
export async function stageFiles(repoPath, files) {
    try {
        const git = simpleGit(repoPath);
        await git.add(files);
        logger.info({ fileCount: files.length }, 'Files staged');
        return true;
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error) }, 'Failed to stage files');
        return false;
    }
}
/**
 * Create a commit
 */
export async function createCommit(repoPath, message) {
    try {
        const git = simpleGit(repoPath);
        const result = await git.commit(message);
        logger.info({ commit: result.commit }, 'Commit created');
        return result.commit;
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error) }, 'Failed to create commit');
        return null;
    }
}
//# sourceMappingURL=git.js.map