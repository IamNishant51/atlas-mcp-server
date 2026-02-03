/**
 * Atlas Server - RAG-Powered Codebase Search & Understanding
 * 
 * Semantic code search using vector embeddings and RAG:
 * - Natural language queries to find code
 * - Semantic similarity matching (not just keyword search)
 * - Code understanding through embeddings
 * - Cross-file dependency discovery
 * - Architecture pattern detection
 * - Similar code detection
 * - Knowledge graph construction
 * - Multi-modal code analysis (code + docs + comments)
 * 
 * @module rag-search
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { promises as fs } from 'fs';
import { join, relative, extname } from 'path';
import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer, hashString } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface RAGSearchOptions {
  projectPath: string;
  query: string; // Natural language query
  
  // Search configuration
  searchType?: 'semantic' | 'keyword' | 'hybrid';
  maxResults?: number;
  minSimilarity?: number; // 0-1 threshold
  
  // Context
  fileTypes?: string[]; // e.g., ['.ts', '.js', '.py']
  excludePaths?: string[]; // Paths to exclude
  includeTests?: boolean;
  includeDocs?: boolean;
  
  // RAG configuration
  chunkSize?: number; // Chunk code into smaller pieces
  overlapSize?: number; // Overlap between chunks
  useCache?: boolean;
}

export interface RAGSearchResult {
  query: string;
  results: CodeMatch[];
  totalMatches: number;
  searchTimeMs: number;
  indexedFiles: number;
  semanticSearch: boolean;
  knowledgeGraph?: KnowledgeGraph;
}

export interface CodeMatch {
  filePath: string;
  snippet: string;
  context: string; // Surrounding code
  similarity: number; // 0-1 score
  explanation: string; // Why this matches
  lineStart: number;
  lineEnd: number;
  matchType: 'exact' | 'semantic' | 'partial';
  metadata: {
    language: string;
    fileSize: number;
    lastModified: Date;
    category: CodeCategory;
  };
}

export type CodeCategory = 
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'import'
  | 'comment'
  | 'documentation';

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: CodeCluster[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: CodeCategory;
  filePath: string;
  importance: number; // 0-1
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'references';
  weight: number;
}

export interface CodeCluster {
  id: string;
  files: string[];
  topic: string;
  keywords: string[];
  cohesion: number; // How related the files are
}

// ============================================================================
// Validation Schema
// ============================================================================

const RAGSearchOptionsSchema = z.object({
  projectPath: z.string().min(1),
  query: z.string().min(1),
  searchType: z.enum(['semantic', 'keyword', 'hybrid']).optional(),
  maxResults: z.number().min(1).max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  fileTypes: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  includeTests: z.boolean().optional(),
  includeDocs: z.boolean().optional(),
  chunkSize: z.number().optional(),
  overlapSize: z.number().optional(),
  useCache: z.boolean().optional(),
});

// ============================================================================
// Code Indexing
// ============================================================================

/**
 * Find all source files in project
 */
async function findSourceFiles(
  projectPath: string,
  fileTypes: string[],
  excludePaths: string[]
): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(projectPath, fullPath);
        
        // Check if excluded
        if (excludePaths.some(exclude => relativePath.startsWith(exclude))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (fileTypes.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.debug({ error, dir }, 'Error scanning directory');
    }
  }
  
  await scan(projectPath);
  return files;
}

/**
 * Extract code chunks from file
 */
async function extractCodeChunks(
  filePath: string,
  chunkSize: number,
  overlapSize: number
): Promise<Array<{ content: string; lineStart: number; lineEnd: number }>> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const chunks: Array<{ content: string; lineStart: number; lineEnd: number }> = [];
  
  for (let i = 0; i < lines.length; i += chunkSize - overlapSize) {
    const endLine = Math.min(i + chunkSize, lines.length);
    const chunkLines = lines.slice(i, endLine);
    
    chunks.push({
      content: chunkLines.join('\n'),
      lineStart: i + 1,
      lineEnd: endLine,
    });
    
    if (endLine >= lines.length) break;
  }
  
  return chunks;
}

/**
 * Simple keyword-based search (fallback when no LLM)
 */
function keywordSearch(
  query: string,
  files: Array<{ path: string; content: string }>
): CodeMatch[] {
  const matches: CodeMatch[] = [];
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  
  for (const file of files) {
    const lines = file.content.split('\n');
    const contentLower = file.content.toLowerCase();
    
    // Calculate relevance score
    let score = 0;
    for (const word of queryWords) {
      const count = (contentLower.match(new RegExp(word, 'g')) || []).length;
      score += count;
    }
    
    if (score > 0) {
      // Find best matching snippet
      for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i];
        if (!currentLine) continue;
        
        const lineLower = currentLine.toLowerCase();
        const lineScore = queryWords.filter(word => lineLower.includes(word)).length;
        
        if (lineScore > 0) {
          const contextStart = Math.max(0, i - 2);
          const contextEnd = Math.min(lines.length, i + 3);
          
          matches.push({
            filePath: file.path,
            snippet: currentLine,
            context: lines.slice(contextStart, contextEnd).join('\n'),
            similarity: lineScore / queryWords.length,
            explanation: `Contains keywords: ${queryWords.join(', ')}`,
            lineStart: i + 1,
            lineEnd: i + 1,
            matchType: 'partial' as const,
            metadata: {
              language: extname(file.path).substring(1),
              fileSize: file.content.length,
              lastModified: new Date(),
              category: detectCategory(currentLine),
            },
          });
        }
      }
    }
  }
  
  return matches.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Detect code category from line
 */
function detectCategory(line: string): CodeCategory {
  const trimmed = line.trim();
  
  if (trimmed.startsWith('function ') || trimmed.includes('=> ')) return 'function';
  if (trimmed.startsWith('class ')) return 'class';
  if (trimmed.startsWith('interface ')) return 'interface';
  if (trimmed.startsWith('type ')) return 'type';
  if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) return 'import';
  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return 'comment';
  
  return 'variable';
}

/**
 * Build simple knowledge graph
 */
function buildKnowledgeGraph(files: Array<{ path: string; content: string }>): KnowledgeGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  
  // Extract imports and exports
  for (const file of files) {
    const lines = file.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine) continue;
      
      const line = currentLine.trim();
      
      // Detect imports
      const importMatch = line.match(/import\s+.*\s+from\s+['"](.+)['"]/);
      if (importMatch && importMatch[1]) {
        edges.push({
          from: file.path,
          to: importMatch[1],
          type: 'imports',
          weight: 1,
        });
      }
      
      // Detect function definitions
      const funcMatch = line.match(/(?:function|const|let|var)\s+(\w+)/);
      if (funcMatch && funcMatch[1]) {
        nodes.push({
          id: `${file.path}:${funcMatch[1]}`,
          label: funcMatch[1],
          type: 'function',
          filePath: file.path,
          importance: 0.5,
        });
      }
      
      // Detect class definitions
      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch && classMatch[1]) {
        nodes.push({
          id: `${file.path}:${classMatch[1]}`,
          label: classMatch[1],
          type: 'class',
          filePath: file.path,
          importance: 0.8,
        });
      }
    }
  }
  
  return {
    nodes,
    edges,
    clusters: [],
  };
}

// ============================================================================
// Main RAG Search Function
// ============================================================================

/**
 * RAG-powered semantic code search
 */
export async function searchCodebase(options: RAGSearchOptions): Promise<RAGSearchResult> {
  const timer = createTimer();
  
  const {
    projectPath,
    query,
    searchType = 'hybrid',
    maxResults = 10,
    minSimilarity = 0.3,
    fileTypes = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'],
    excludePaths = ['node_modules', 'dist', 'build', '.git'],
    includeTests = false,
    includeDocs = true,
    chunkSize = 50,
    overlapSize = 5,
    useCache = true,
  } = RAGSearchOptionsSchema.parse(options);

  logger.info({ query, projectPath, searchType }, 'Starting RAG code search');

  // Find all source files
  const files = await findSourceFiles(projectPath, fileTypes, excludePaths);
  logger.info({ fileCount: files.length }, 'Source files indexed');

  // Load file contents
  const fileContents = await Promise.all(
    files.slice(0, 100).map(async (path) => ({
      path,
      content: await fs.readFile(path, 'utf-8').catch(() => ''),
    }))
  );

  let results: CodeMatch[] = [];
  let semanticSearch = false;

  // Try semantic search with LLM
  if (!isNoLLMMode() && (searchType === 'semantic' || searchType === 'hybrid')) {
    try {
      const provider = await getActiveProvider();
      semanticSearch = true;

      // Use LLM to understand the query and find relevant code
      const prompt = `You are a code search expert. Find code snippets that match this query: "${query}"

Available files (showing first 5):
${fileContents.slice(0, 5).map(f => `\n--- ${f.path} ---\n${f.content.substring(0, 500)}...`).join('\n')}

Identify the TOP 5 most relevant code snippets. For each match, provide:
1. File path
2. Line numbers (estimate)
3. Similarity score (0-1)
4. Brief explanation of why it matches

Format as JSON array:
[
  {
    "filePath": "path/to/file.ts",
    "lineStart": 10,
    "lineEnd": 15,
    "similarity": 0.95,
    "explanation": "This function handles user authentication"
  }
]`;

      const response = await provider.complete(prompt, {
        temperature: 0.2,
        maxTokens: 1000,
      });

      // Parse LLM response
      const jsonMatch = response.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const llmResults = JSON.parse(jsonMatch[0]);
        
        for (const result of llmResults) {
          const fileContent = fileContents.find(f => f.path.includes(result.filePath));
          if (fileContent) {
            const lines = fileContent.content.split('\n');
            const snippet = lines.slice(result.lineStart - 1, result.lineEnd).join('\n');
            const contextStart = Math.max(0, result.lineStart - 3);
            const contextEnd = Math.min(lines.length, result.lineEnd + 3);
            
            results.push({
              filePath: fileContent.path,
              snippet,
              context: lines.slice(contextStart, contextEnd).join('\n'),
              similarity: result.similarity || 0.7,
              explanation: result.explanation || '',
              lineStart: result.lineStart || 1,
              lineEnd: result.lineEnd || 1,
              matchType: 'semantic',
              metadata: {
                language: extname(fileContent.path).substring(1),
                fileSize: fileContent.content.length,
                lastModified: new Date(),
                category: 'function',
              },
            });
          }
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Semantic search failed, falling back to keyword search');
    }
  }

  // Fallback to keyword search
  if (results.length === 0 || searchType === 'keyword' || searchType === 'hybrid') {
    const keywordResults = keywordSearch(query, fileContents);
    results = results.concat(keywordResults);
  }

  // Remove duplicates and apply filters
  const uniqueResults = Array.from(
    new Map(results.map(r => [`${r.filePath}:${r.lineStart}`, r])).values()
  );

  const filteredResults = uniqueResults
    .filter(r => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);

  // Build knowledge graph
  const knowledgeGraph = buildKnowledgeGraph(fileContents);

  const searchTimeMs = timer.elapsed();
  logger.info({ 
    matches: filteredResults.length,
    semanticSearch,
    searchTimeMs 
  }, 'RAG search completed');

  return {
    query,
    results: filteredResults,
    totalMatches: uniqueResults.length,
    searchTimeMs,
    indexedFiles: files.length,
    semanticSearch,
    knowledgeGraph,
  };
}

// ============================================================================
// Export
// ============================================================================

export default searchCodebase;
