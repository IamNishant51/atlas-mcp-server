/**
 * Atlas Server - Context Aggregation Tool
 *
 * Gathers and aggregates context from multiple sources:
 * - Project structure analysis
 * - Relevant code snippets
 * - Configuration files
 * - Dependencies information
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { logger } from '../utils.js';
// ============================================================================
// Configuration
// ============================================================================
const MAX_FILE_SIZE = 100 * 1024; // 100KB max file size to read
const MAX_SNIPPET_LENGTH = 2000; // Max characters per snippet
const MAX_SNIPPETS = 10; // Max number of snippets to return
const CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyw',
    '.rs',
    '.go',
    '.java',
    '.rb',
    '.php',
    '.swift',
    '.kt', '.kts',
    '.c', '.h', '.cpp', '.hpp', '.cc',
    '.cs',
    '.vue', '.svelte',
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
const IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    '.next',
    '__pycache__',
    '.pytest_cache',
    'target',
    'vendor',
    '.venv',
    'venv',
    'env',
]);
// ============================================================================
// Context Building
// ============================================================================
/**
 * Build comprehensive context for the pipeline
 */
export async function buildContext(intent, repoPath, gitContext) {
    logger.debug({ repoPath, hasGitContext: !!gitContext }, 'Building context');
    const context = {
        intent,
        codeSnippets: [],
        gitContext,
    };
    if (!repoPath) {
        return context;
    }
    try {
        // Gather project info
        context.projectInfo = await analyzeProject(repoPath);
        // Find relevant code snippets based on intent
        context.codeSnippets = await findRelevantSnippets(repoPath, intent, context.projectInfo);
        logger.debug({
            snippetCount: context.codeSnippets.length,
            languages: context.projectInfo.languages,
        }, 'Context built successfully');
    }
    catch (error) {
        logger.warn({ error, repoPath }, 'Error building context');
    }
    return context;
}
/**
 * Analyze project structure and configuration
 */
export async function analyzeProject(rootPath) {
    const languages = new Set();
    const frameworks = new Set();
    const configFiles = [];
    let packageManager;
    // Check for config files
    for (const configFile of CONFIG_FILES) {
        try {
            const filePath = join(rootPath, configFile);
            await stat(filePath);
            configFiles.push(configFile);
        }
        catch {
            // File doesn't exist
        }
    }
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
    // Analyze package.json for frameworks
    const packageJsonPath = join(rootPath, 'package.json');
    if (await fileExists(packageJsonPath)) {
        try {
            const content = await readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(content);
            const allDeps = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
            };
            // Detect frameworks
            if (allDeps['next'])
                frameworks.add('Next.js');
            if (allDeps['react'])
                frameworks.add('React');
            if (allDeps['vue'])
                frameworks.add('Vue');
            if (allDeps['@angular/core'])
                frameworks.add('Angular');
            if (allDeps['svelte'])
                frameworks.add('Svelte');
            if (allDeps['express'])
                frameworks.add('Express');
            if (allDeps['fastify'])
                frameworks.add('Fastify');
            if (allDeps['koa'])
                frameworks.add('Koa');
            if (allDeps['nestjs'] || allDeps['@nestjs/core'])
                frameworks.add('NestJS');
            // Detect TypeScript
            if (allDeps['typescript'])
                languages.add('TypeScript');
        }
        catch {
            // Ignore parse errors
        }
    }
    // Scan for code files to detect languages
    await scanForLanguages(rootPath, languages, 3);
    return {
        rootPath,
        languages: Array.from(languages),
        frameworks: Array.from(frameworks),
        packageManager,
        configFiles,
    };
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
 * Check if a file exists
 */
async function fileExists(path) {
    try {
        await stat(path);
        return true;
    }
    catch {
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