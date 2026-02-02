/**
 * Atlas Server - Git Context Tool
 *
 * Provides git repository context including:
 * - Current branch and status
 * - Recent commit history
 * - Uncommitted changes
 * - File history and blame information
 */
import type { GitContext, GitCommit } from '../types.js';
/**
 * Get comprehensive git context for a repository
 */
export declare function getGitContext(repoPath: string, commitLimit?: number): Promise<GitContext | null>;
/**
 * Get the diff for uncommitted changes
 */
export declare function getUncommittedDiff(repoPath: string): Promise<string | null>;
/**
 * Get the diff for a specific commit
 */
export declare function getCommitDiff(repoPath: string, commitHash: string): Promise<string | null>;
/**
 * Get blame information for a file
 */
export declare function getFileBlame(repoPath: string, filePath: string): Promise<BlameInfo[] | null>;
/**
 * Get file history (commits that modified a file)
 */
export declare function getFileHistory(repoPath: string, filePath: string, limit?: number): Promise<GitCommit[]>;
/**
 * Get list of files changed between two refs
 */
export declare function getChangedFiles(repoPath: string, fromRef: string, toRef?: string): Promise<string[]>;
/**
 * Get the current HEAD commit hash
 */
export declare function getHeadCommit(repoPath: string): Promise<string | null>;
/**
 * List all branches (local and remote)
 */
export declare function listBranches(repoPath: string): Promise<{
    current: string;
    local: string[];
    remote: string[];
}>;
export interface BlameInfo {
    lineNumber: number;
    commitHash: string;
    author: string;
    date: string;
    content: string;
}
/**
 * Create a new branch
 */
export declare function createBranch(repoPath: string, branchName: string, startPoint?: string): Promise<boolean>;
/**
 * Stage files for commit
 */
export declare function stageFiles(repoPath: string, files: string[]): Promise<boolean>;
/**
 * Create a commit
 */
export declare function createCommit(repoPath: string, message: string): Promise<string | null>;
//# sourceMappingURL=git.d.ts.map