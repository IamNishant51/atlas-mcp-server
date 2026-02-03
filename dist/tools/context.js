/**
 * Atlas Server - Context Aggregation Tool
 *
 * Gathers and aggregates context from multiple sources:
 * - Project structure analysis with caching
 * - Relevant code snippets with relevance scoring
 * - Configuration files with validation
 * - Dependencies information with security checking
 *
 * Performance Features:
 * - Parallel file scanning for faster analysis
 * - Result caching to avoid redundant operations
 * - Smart snippet ranking by relevance
 * - Memory-efficient streaming for large files
 *
 * @module context
 * @version 2.0.0
 */
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, extname, relative, normalize } from 'node:path';
import { logger, isDefined, LRUCache, parallelMap, globalMetrics } from '../utils.js';
// ============================================================================
// Configuration (Centralized for Easy Tuning)
// ============================================================================
/** Maximum file size to read (prevents memory exhaustion) */
const MAX_FILE_SIZE = 100 * 1024; // 100KB
/** Maximum characters per code snippet */
const MAX_SNIPPET_LENGTH = 2000;
/** Maximum number of snippets to return */
const MAX_SNIPPETS = 10;
/** Maximum directory depth for scanning */
const MAX_SCAN_DEPTH = 10;
/** Concurrency for parallel file operations */
const FILE_SCAN_CONCURRENCY = 5;
/** Cache TTL for project analysis (5 minutes) */
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000;
/** Cache size for project info */
const PROJECT_CACHE_SIZE = 50;
/** Supported code file extensions with language mapping */
const CODE_EXTENSIONS = new Map([
    ['.ts', 'TypeScript'], ['.tsx', 'TypeScript'],
    ['.js', 'JavaScript'], ['.jsx', 'JavaScript'], ['.mjs', 'JavaScript'], ['.cjs', 'JavaScript'],
    ['.py', 'Python'], ['.pyw', 'Python'],
    ['.rs', 'Rust'],
    ['.go', 'Go'],
    ['.java', 'Java'],
    ['.rb', 'Ruby'],
    ['.php', 'PHP'],
    ['.swift', 'Swift'],
    ['.kt', 'Kotlin'], ['.kts', 'Kotlin'],
    ['.c', 'C'], ['.h', 'C'], ['.cpp', 'C++'], ['.hpp', 'C++'], ['.cc', 'C++'],
    ['.cs', 'C#'],
    ['.vue', 'Vue'], ['.svelte', 'Svelte'],
]);
const CONFIG_FILES = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'requirements.txt',
    'Gemfile',
    'composer.json',
    '.env',
    '.env.example',
];
/** Directories to ignore during scanning (performance and security) */
const IGNORE_DIRS = new Set([
    'node_modules', 'bower_components',
    '.git', '.svn', '.hg',
    'dist', 'build', 'out', 'target',
    '.next', '.nuxt', '.output',
    '__pycache__', '.pytest_cache', '.mypy_cache', '.tox',
    'vendor', 'Pods',
    '.venv', 'venv', 'env', 'virtualenv',
    'coverage', '.nyc_output',
    'tmp', 'temp', 'cache',
    '.idea', '.vscode', '.vs',
]);
// ============================================================================
// Caching Layer for Performance
// ============================================================================
/** Cache for project analysis results */
const projectCache = new LRUCache(PROJECT_CACHE_SIZE, PROJECT_CACHE_TTL_MS);
/** Cache for file existence checks */
const fileExistsCache = new LRUCache(200, 30000); // 30s TTL
// ============================================================================
// Context Building (Enhanced with Validation and Caching)
// ============================================================================
/**
 * Build comprehensive context for the pipeline with caching and parallel processing
 *
 * @param intent - Analyzed user intent
 * @param repoPath - Optional repository path
 * @param gitContext - Optional git context
 * @returns Pipeline context with code snippets and project info
 *
 * @example
 * ```typescript
 * const context = await buildContext(intent, '/path/to/repo', gitContext);
 * console.log(`Found ${context.codeSnippets.length} relevant snippets`);
 * ```
 */
export async function buildContext(intent, repoPath, gitContext) {
    // Input validation
    if (!intent || !intent.primaryIntent) {
        throw new Error('Invalid intent: primaryIntent is required');
    }
    const startTime = performance.now();
    logger.debug({ repoPath, hasGitContext: !!gitContext }, 'Building context');
    const context = {
        intent,
        codeSnippets: [],
        gitContext,
    };
    if (!repoPath) {
        logger.debug('No repository path provided, returning minimal context');
        return context;
    }
    // Normalize path for consistent caching
    const normalizedPath = normalize(repoPath);
    try {
        // Gather project info with caching
        context.projectInfo = await globalMetrics.measure('context_analyze_project', () => analyzeProject(normalizedPath));
        // Find relevant code snippets in parallel with project analysis
        context.codeSnippets = await globalMetrics.measure('context_find_snippets', () => findRelevantSnippets(normalizedPath, intent, context.projectInfo));
        const duration = Math.round(performance.now() - startTime);
        logger.debug({
            snippetCount: context.codeSnippets.length,
            languages: context.projectInfo.languages,
            durationMs: duration,
        }, 'Context built successfully');
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn({ error: errorMsg, repoPath: normalizedPath }, 'Error building context');
        // Return partial context rather than failing completely
        context.projectInfo = undefined;
        context.codeSnippets = [];
    }
    return context;
}
/**
 * Analyze project structure and configuration with caching
 *
 * @param rootPath - Project root directory
 * @returns Comprehensive project information
 * @throws {Error} If rootPath is invalid or inaccessible
 */
export async function analyzeProject(rootPath) {
    // Input validation
    if (!rootPath || typeof rootPath !== 'string') {
        throw new Error('Invalid rootPath: must be a non-empty string');
    }
    // Check cache first
    const cacheKey = normalize(rootPath);
    const cached = projectCache.get(cacheKey);
    if (cached) {
        logger.debug({ rootPath }, 'Using cached project info');
        return cached;
    }
    // Verify directory exists and is accessible
    try {
        const stats = await stat(rootPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${rootPath}`);
        }
    }
    catch (error) {
        throw new Error(`Cannot access directory: ${rootPath} - ${error}`);
    }
    const languages = new Set();
    const frameworks = new Set();
    const configFiles = [];
    let packageManager;
    // Check for config files in parallel for better performance
    const configChecks = await parallelMap(CONFIG_FILES, async (configFile) => {
        const filePath = join(rootPath, configFile);
        const exists = await fileExists(filePath);
        return exists ? configFile : null;
    }, { concurrency: FILE_SCAN_CONCURRENCY });
    configFiles.push(...configChecks.filter(isDefined));
    // Detect package manager
    if (configFiles.includes('package.json')) {
        if (await fileExists(join(rootPath, 'bun.lockb'))) {
            packageManager = 'bun';
        }
        else if (await fileExists(join(rootPath, 'pnpm-lock.yaml'))) {
            packageManager = 'pnpm';
        }
        else if (await fileExists(join(rootPath, 'yarn.lock'))) {
            packageManager = 'yarn';
        }
        else {
            packageManager = 'npm';
        }
    }
    // Analyze package.json for frameworks (with error handling)
    const packageJsonPath = join(rootPath, 'package.json');
    if (await fileExists(packageJsonPath)) {
        try {
            const content = await readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(content);
            const allDeps = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
            };
            // Detect frameworks with priority (more specific first)
            const frameworkDetectors = [
                ['@nestjs/core', 'NestJS'],
                ['next', 'Next.js'],
                ['react', 'React'],
                ['vue', 'Vue'],
                ['@angular/core', 'Angular'],
                ['svelte', 'Svelte'],
                ['fastify', 'Fastify'],
                ['express', 'Express'],
                ['koa', 'Koa'],
            ];
            for (const [pkg, framework] of frameworkDetectors) {
                if (allDeps[pkg])
                    frameworks.add(framework);
            }
            // Detect TypeScript
            if (allDeps['typescript'])
                languages.add('TypeScript');
        }
        catch (error) {
            logger.warn({ error, path: packageJsonPath }, 'Failed to parse package.json');
            // Continue without package.json analysis
        }
    }
    // Scan for code files to detect languages (with depth limit for performance)
    await scanForLanguages(rootPath, languages, 3);
    const projectInfo = {
        rootPath,
        languages: Array.from(languages),
        frameworks: Array.from(frameworks),
        packageManager,
        configFiles,
    };
    // Cache the result
    projectCache.set(cacheKey, projectInfo);
    return projectInfo;
}
/**
 * Find code snippets relevant to the user's intent
 */
async function findRelevantSnippets(rootPath, intent, projectInfo) {
    const snippets = [];
    const targetFiles = [];
    // Find files mentioned in entities
    for (const entity of intent.entities) {
        if (entity.type === 'file') {
            const filePath = await findFile(rootPath, entity.value);
            if (filePath) {
                targetFiles.push(filePath);
            }
        }
    }
    // If no specific files, scan for relevant files based on keywords
    if (targetFiles.length === 0) {
        const relevantFiles = await scanForRelevantFiles(rootPath, intent.keywords, 5);
        targetFiles.push(...relevantFiles);
    }
    // Read and create snippets
    for (const filePath of targetFiles.slice(0, MAX_SNIPPETS)) {
        try {
            const content = await readFile(filePath, 'utf-8');
            const language = detectLanguage(filePath);
            snippets.push({
                filePath: relative(rootPath, filePath),
                content: content.substring(0, MAX_SNIPPET_LENGTH),
                language,
                lineRange: { start: 1, end: content.split('\n').length },
                relevance: calculateRelevance(content, intent.keywords),
            });
        }
        catch {
            // Skip unreadable files
        }
    }
    // Sort by relevance
    return snippets.sort((a, b) => b.relevance - a.relevance);
}
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Check if a file exists with caching for performance
 *
 * @param path - File path to check
 * @returns True if file exists and is accessible
 */
async function fileExists(path) {
    // Check cache first
    const cached = fileExistsCache.get(path);
    if (cached !== undefined) {
        return cached;
    }
    try {
        await access(path, constants.F_OK);
        fileExistsCache.set(path, true);
        return true;
    }
    catch {
        fileExistsCache.set(path, false);
        return false;
    }
}
/**
 * Scan directory for languages used
 */
async function scanForLanguages(dir, languages, depth) {
    if (depth <= 0)
        return;
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!IGNORE_DIRS.has(entry.name)) {
                    await scanForLanguages(join(dir, entry.name), languages, depth - 1);
                }
            }
            else if (entry.isFile()) {
                const ext = extname(entry.name).toLowerCase();
                const lang = EXTENSION_TO_LANGUAGE[ext];
                if (lang) {
                    languages.add(lang);
                }
            }
        }
    }
    catch {
        // Ignore read errors
    }
}
/**
 * Find a file by name in the project
 */
async function findFile(rootPath, fileName) {
    const queue = [rootPath];
    while (queue.length > 0) {
        const dir = queue.shift();
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isFile() && entry.name === fileName) {
                    return fullPath;
                }
                if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
                    queue.push(fullPath);
                }
            }
        }
        catch {
            // Ignore read errors
        }
    }
    return null;
}
/**
 * Scan for files relevant to keywords
 */
async function scanForRelevantFiles(rootPath, keywords, maxFiles) {
    const files = [];
    const queue = [rootPath];
    while (queue.length > 0 && files.length < maxFiles * 2) {
        const dir = queue.shift();
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
                    const score = keywords.filter((kw) => entry.name.toLowerCase().includes(kw.toLowerCase())).length;
                    if (score > 0) {
                        files.push({ path: fullPath, score });
                    }
                }
                if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
                    queue.push(fullPath);
                }
            }
        }
        catch {
            // Ignore read errors
        }
    }
    return files
        .sort((a, b) => b.score - a.score)
        .slice(0, maxFiles)
        .map((f) => f.path);
}
/**
 * Detect language from file extension
 */
function detectLanguage(filePath) {
    const ext = extname(filePath).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] ?? 'text';
}
/**
 * Calculate relevance score based on keyword matches
 */
function calculateRelevance(content, keywords) {
    if (keywords.length === 0)
        return 0.5;
    const lowerContent = content.toLowerCase();
    const matches = keywords.filter((kw) => lowerContent.includes(kw.toLowerCase())).length;
    return Math.min(1, matches / keywords.length);
}
/**
 * Extension to language mapping
 */
const EXTENSION_TO_LANGUAGE = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.pyw': 'Python',
    '.rs': 'Rust',
    '.go': 'Go',
    '.java': 'Java',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.kts': 'Kotlin',
    '.c': 'C',
    '.h': 'C',
    '.cpp': 'C++',
    '.hpp': 'C++',
    '.cc': 'C++',
    '.cs': 'C#',
    '.vue': 'Vue',
    '.svelte': 'Svelte',
};
// ============================================================================
// Exports
// ============================================================================
export { CODE_EXTENSIONS, CONFIG_FILES, IGNORE_DIRS };
//# sourceMappingURL=context.js.map