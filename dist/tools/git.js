/**
 * Atlas Server - Git Context Tool
 *
 * Provides git repository context including:
 * - Current branch and status
 * - Recent commit history
 * - Uncommitted changes
 * - File history and blame information
 */
import { simpleGit } from 'simple-git';
import { logger, getErrorMessage } from '../utils.js';
// ============================================================================
// Configuration
// ============================================================================
const DEFAULT_COMMIT_LIMIT = 10;
// Git instance cache to avoid creating new instances for the same repo
const gitInstanceCache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute cache
const MAX_CACHE_SIZE = 10;
/**
 * Get or create a cached git instance for a repository
 */
function getGitInstance(repoPath) {
    const now = Date.now();
    const cached = gitInstanceCache.get(repoPath);
    if (cached) {
        cached.lastAccess = now;
        return cached.git;
    }
    // Cleanup old entries if cache is full
    if (gitInstanceCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = [...gitInstanceCache.entries()]
            .sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0]?.[0];
        if (oldestKey)
            gitInstanceCache.delete(oldestKey);
    }
    const git = simpleGit(repoPath);
    gitInstanceCache.set(repoPath, { git, lastAccess: now });
    return git;
}
/**
 * Wrapper for git operations with consistent error handling
 */
async function withGitErrorHandling(operation, context, fn, fallback) {
    try {
        return await fn();
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error), ...context }, `Failed to ${operation}`);
        return fallback;
    }
}
// ============================================================================
// Git Context
// ============================================================================
/**
 * Get comprehensive git context for a repository
 */
export async function getGitContext(repoPath, commitLimit = DEFAULT_COMMIT_LIMIT) {
    return withGitErrorHandling('get git context', { repoPath }, async () => {
        const git = getGitInstance(repoPath);
        // Check if this is a git repository
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            logger.debug({ repoPath }, 'Not a git repository');
            return null;
        }
        // Gather all context in parallel
        const [branch, status, log, remotes] = await Promise.all([
            git.branch(),
            git.status(),
            git.log({ maxCount: commitLimit }),
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
        return context;
    }, null);
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