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
// ============================================================================
// Git Context
// ============================================================================
/**
 * Get comprehensive git context for a repository
 */
export async function getGitContext(repoPath, commitLimit = DEFAULT_COMMIT_LIMIT) {
    try {
        const git = simpleGit(repoPath);
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
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error), repoPath }, 'Failed to get git context');
        return null;
    }
}
/**
 * Get the diff for uncommitted changes
 */
export async function getUncommittedDiff(repoPath) {
    try {
        const git = simpleGit(repoPath);
        const diff = await git.diff();
        return diff || null;
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error) }, 'Failed to get uncommitted diff');
        return null;
    }
}
/**
 * Get the diff for a specific commit
 */
export async function getCommitDiff(repoPath, commitHash) {
    try {
        const git = simpleGit(repoPath);
        const diff = await git.show([commitHash, '--pretty=format:', '--patch']);
        return diff || null;
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error), commitHash }, 'Failed to get commit diff');
        return null;
    }
}
/**
 * Get blame information for a file
 */
export async function getFileBlame(repoPath, filePath) {
    try {
        const git = simpleGit(repoPath);
        const blame = await git.raw(['blame', '--line-porcelain', filePath]);
        return parseBlame(blame);
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error), filePath }, 'Failed to get file blame');
        return null;
    }
}
/**
 * Get file history (commits that modified a file)
 */
export async function getFileHistory(repoPath, filePath, limit = 10) {
    try {
        const git = simpleGit(repoPath);
        const log = await git.log({
            file: filePath,
            maxCount: limit,
        });
        return formatCommits(log);
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error), filePath }, 'Failed to get file history');
        return [];
    }
}
/**
 * Get list of files changed between two refs
 */
export async function getChangedFiles(repoPath, fromRef, toRef = 'HEAD') {
    try {
        const git = simpleGit(repoPath);
        const result = await git.raw(['diff', '--name-only', fromRef, toRef]);
        return result.split('\n').filter(Boolean);
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error), fromRef, toRef }, 'Failed to get changed files');
        return [];
    }
}
/**
 * Get the current HEAD commit hash
 */
export async function getHeadCommit(repoPath) {
    try {
        const git = simpleGit(repoPath);
        const result = await git.revparse(['HEAD']);
        return result.trim();
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error) }, 'Failed to get HEAD commit');
        return null;
    }
}
/**
 * List all branches (local and remote)
 */
export async function listBranches(repoPath) {
    try {
        const git = simpleGit(repoPath);
        const branches = await git.branch(['-a']);
        return {
            current: branches.current,
            local: branches.all.filter((b) => !b.startsWith('remotes/')),
            remote: branches.all
                .filter((b) => b.startsWith('remotes/'))
                .map((b) => b.replace(/^remotes\//, '')),
        };
    }
    catch (error) {
        logger.error({ error: getErrorMessage(error) }, 'Failed to list branches');
        return { current: '', local: [], remote: [] };
    }
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
 * Format git status to our GitChange type
 */
function formatChanges(status) {
    const changes = [];
    // Staged changes
    for (const file of status.staged) {
        changes.push({
            path: file,
            type: getChangeType(status, file, true),
            staged: true,
        });
    }
    // Unstaged changes (modified)
    for (const file of status.modified) {
        if (!status.staged.includes(file)) {
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
        if (!status.staged.includes(file)) {
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
 * Determine change type from status
 */
function getChangeType(status, file, _staged) {
    if (status.created.includes(file) || status.not_added.includes(file)) {
        return 'added';
    }
    if (status.deleted.includes(file)) {
        return 'deleted';
    }
    if (status.renamed.some((r) => r.to === file)) {
        return 'renamed';
    }
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