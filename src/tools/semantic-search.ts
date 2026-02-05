/**
 * Atlas Server - Semantic Code Search Tool
 * 
 * INTELLIGENT SEMANTIC SEARCH ENGINE
 * 
 * Revolutionary capabilities:
 * - Search by meaning, not just keywords
 * - Understand code intent and functionality
 * - Find similar code patterns across the codebase
 * - Discover code by behavior description
 * - Cross-language semantic matching
 * - Find usage examples of patterns
 * - Semantic code clone detection
 * - Intent-based API discovery
 * - Natural language queries
 * 
 * @module semantic-search
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer } from '../utils.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface SemanticSearchRequest {
  projectPath: string;
  query: string; // Natural language or code snippet
  queryType?: 'natural-language' | 'code-snippet' | 'pattern' | 'behavior';
  filters?: {
    fileTypes?: string[];
    directories?: string[];
    excludeTests?: boolean;
    minSimilarity?: number;
  };
  maxResults?: number;
  includeContext?: boolean;
}

export interface SearchResult {
  filePath: string;
  matchedSnippet: string;
  lineRange: { start: number; end: number };
  similarity: number; // 0-1
  matchType: 'exact' | 'semantic' | 'pattern' | 'behavioral';
  explanation: string;
  contextBefore?: string;
  contextAfter?: string;
  relatedMatches?: string[];
}

export interface SemanticSearchResponse {
  query: string;
  interpretedIntent: string;
  results: SearchResult[];
  suggestedRefinements?: string[];
  relatedPatterns?: string[];
  executionTimeMs: number;
}

// ============================================================================
// Semantic Analysis
// ============================================================================

/**
 * Extract semantic features from code
 */
function extractSemanticFeatures(code: string): SemanticFeatures {
  return {
    keywords: extractKeywords(code),
    patterns: extractPatterns(code),
    intent: inferIntent(code),
    structure: analyzeStructure(code),
    dependencies: extractDependencies(code),
  };
}

interface SemanticFeatures {
  keywords: string[];
  patterns: string[];
  intent: string[];
  structure: CodeStructure;
  dependencies: string[];
}

interface CodeStructure {
  hasLoops: boolean;
  hasConditionals: boolean;
  hasAsyncOps: boolean;
  hasErrorHandling: boolean;
  hasDataTransform: boolean;
  hasIO: boolean;
}

/**
 * Extract meaningful keywords
 */
function extractKeywords(code: string): string[] {
  const keywords = new Set<string>();
  
  // Extract identifiers
  const identifiers = code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  for (const id of identifiers) {
    // Filter out JS keywords and common words
    if (!/^(const|let|var|function|class|if|else|return|for|while|switch|case|break|continue|try|catch|throw|async|await|import|export|default|new|this|typeof|instanceof)$/.test(id)) {
      keywords.add(id.toLowerCase());
    }
  }
  
  // Extract camelCase components
  for (const id of identifiers) {
    const parts = id.split(/(?=[A-Z])/);
    for (const part of parts) {
      if (part.length > 2) {
        keywords.add(part.toLowerCase());
      }
    }
  }
  
  return Array.from(keywords);
}

/**
 * Extract code patterns
 */
function extractPatterns(code: string): string[] {
  const patterns: string[] = [];
  
  if (/\.map\(/.test(code)) patterns.push('array-map');
  if (/\.filter\(/.test(code)) patterns.push('array-filter');
  if (/\.reduce\(/.test(code)) patterns.push('array-reduce');
  if (/async.*await/.test(code)) patterns.push('async-await');
  if (/new Promise/.test(code)) patterns.push('promise-creation');
  if (/\.then\(/.test(code)) patterns.push('promise-chaining');
  if (/try\s*{[\s\S]*catch/.test(code)) patterns.push('error-handling');
  if (/for\s*\(/.test(code)) patterns.push('for-loop');
  if (/while\s*\(/.test(code)) patterns.push('while-loop');
  if (/if\s*\(/.test(code)) patterns.push('conditional');
  if (/switch\s*\(/.test(code)) patterns.push('switch-statement');
  if (/class\s+\w+/.test(code)) patterns.push('class-definition');
  if (/function\s+\w+/.test(code)) patterns.push('function-declaration');
  if (/=>\s*{/.test(code)) patterns.push('arrow-function');
  if (/useState\(/.test(code)) patterns.push('react-state');
  if (/useEffect\(/.test(code)) patterns.push('react-effect');
  if (/setTimeout|setInterval/.test(code)) patterns.push('timer');
  if (/fetch\(|axios\./.test(code)) patterns.push('http-request');
  if (/fs\.|readFile|writeFile/.test(code)) patterns.push('file-io');
  if (/Math\./.test(code)) patterns.push('math-operations');
  if (/JSON\.parse|JSON\.stringify/.test(code)) patterns.push('json-operations');
  if (/localStorage|sessionStorage/.test(code)) patterns.push('storage');
  if (/addEventListener|on\w+\s*=/.test(code)) patterns.push('event-handling');
  
  return patterns;
}

/**
 * Infer code intent
 */
function inferIntent(code: string): string[] {
  const intents: string[] = [];
  
  if (/sort|orderBy|sortBy/.test(code)) intents.push('sorting');
  if (/filter|where|find/.test(code)) intents.push('filtering');
  if (/map|transform|convert/.test(code)) intents.push('transformation');
  if (/validate|check|verify|test/.test(code)) intents.push('validation');
  if (/parse|decode|deserialize/.test(code)) intents.push('parsing');
  if (/format|encode|serialize/.test(code)) intents.push('formatting');
  if (/save|write|store|persist/.test(code)) intents.push('persistence');
  if (/load|read|fetch|get/.test(code)) intents.push('retrieval');
  if (/delete|remove|clear/.test(code)) intents.push('deletion');
  if (/update|modify|change|set/.test(code)) intents.push('modification');
  if (/create|make|build|generate/.test(code)) intents.push('creation');
  if (/calculate|compute|sum|count/.test(code)) intents.push('computation');
  if (/search|find|lookup|query/.test(code)) intents.push('searching');
  if (/render|display|show|draw/.test(code)) intents.push('rendering');
  if (/handle|process|manage/.test(code)) intents.push('handling');
  
  return intents;
}

/**
 * Analyze code structure
 */
function analyzeStructure(code: string): CodeStructure {
  return {
    hasLoops: /\b(for|while|forEach|map|filter|reduce)\b/.test(code),
    hasConditionals: /\b(if|else|switch|case|\?)\b/.test(code),
    hasAsyncOps: /\b(async|await|then|Promise)\b/.test(code),
    hasErrorHandling: /\b(try|catch|throw|Error)\b/.test(code),
    hasDataTransform: /\.(map|filter|reduce|sort|slice|splice)/.test(code),
    hasIO: /\b(fetch|axios|fs\.|readFile|writeFile|console\.log)\b/.test(code),
  };
}

/**
 * Extract dependencies
 */
function extractDependencies(code: string): string[] {
  const deps: string[] = [];
  const importMatches = code.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
  
  for (const match of importMatches) {
    if (match[1]) deps.push(match[1]);
  }
  
  return deps;
}

/**
 * Calculate semantic similarity between two code snippets
 */
function calculateSemanticSimilarity(
  queryFeatures: SemanticFeatures,
  codeFeatures: SemanticFeatures
): number {
  let score = 0;
  let weights = 0;
  
  // Keyword overlap (30% weight)
  const keywordOverlap = queryFeatures.keywords.filter(k => codeFeatures.keywords.includes(k)).length;
  const keywordScore = keywordOverlap / Math.max(1, queryFeatures.keywords.length);
  score += keywordScore * 0.3;
  weights += 0.3;
  
  // Pattern overlap (25% weight)
  const patternOverlap = queryFeatures.patterns.filter(p => codeFeatures.patterns.includes(p)).length;
  const patternScore = patternOverlap / Math.max(1, queryFeatures.patterns.length);
  score += patternScore * 0.25;
  weights += 0.25;
  
  // Intent overlap (25% weight)
  const intentOverlap = queryFeatures.intent.filter(i => codeFeatures.intent.includes(i)).length;
  const intentScore = intentOverlap / Math.max(1, queryFeatures.intent.length);
  score += intentScore * 0.25;
  weights += 0.25;
  
  // Structure similarity (20% weight)
  const structureScore = calculateStructureSimilarity(queryFeatures.structure, codeFeatures.structure);
  score += structureScore * 0.2;
  weights += 0.2;
  
  return weights > 0 ? score / weights : 0;
}

/**
 * Calculate structure similarity
 */
function calculateStructureSimilarity(s1: CodeStructure, s2: CodeStructure): number {
  let matches = 0;
  let total = 0;
  
  for (const key of Object.keys(s1) as (keyof CodeStructure)[]) {
    if (s1[key] === s2[key]) matches++;
    total++;
  }
  
  return matches / total;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search files semantically
 */
async function searchFiles(
  projectPath: string,
  queryFeatures: SemanticFeatures,
  filters: NonNullable<SemanticSearchRequest['filters']>,
  maxResults: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  // Find files to search
  async function findFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(projectPath, fullPath);
        
        // Apply directory filters
        if (filters.directories && !filters.directories.some(d => relPath.startsWith(d))) {
          continue;
        }
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          files.push(...await findFiles(fullPath));
        } else if (entry.isFile()) {
          // Apply file type filters
          const ext = path.extname(entry.name);
          if (!filters.fileTypes || filters.fileTypes.includes(ext)) {
            // Exclude tests if requested
            if (filters.excludeTests && (entry.name.includes('.test.') || entry.name.includes('.spec.'))) {
              continue;
            }
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      // Ignore
    }
    return files;
  }
  
  const files = await findFiles(projectPath);
  
  // Search each file
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      
      // Split into logical chunks (functions, classes, etc.)
      const chunks = splitIntoChunks(content);
      
      for (const chunk of chunks) {
        const features = extractSemanticFeatures(chunk.code);
        const similarity = calculateSemanticSimilarity(queryFeatures, features);
        
        if (similarity >= (filters.minSimilarity || 0.3)) {
          const matchType = similarity > 0.8 ? 'exact' :
                           similarity > 0.6 ? 'semantic' :
                           similarity > 0.4 ? 'pattern' : 'behavioral';
          
          results.push({
            filePath: path.relative(projectPath, file),
            matchedSnippet: chunk.code.substring(0, 300),
            lineRange: chunk.lineRange,
            similarity,
            matchType,
            explanation: generateExplanation(queryFeatures, features, similarity),
            contextBefore: chunk.lineRange.start > 0 ? lines[chunk.lineRange.start - 1] : undefined,
            contextAfter: chunk.lineRange.end < lines.length ? lines[chunk.lineRange.end] : undefined,
          });
        }
      }
    } catch (e) {
      // Skip files with errors
    }
  }
  
  // Sort by similarity
  results.sort((a, b) => b.similarity - a.similarity);
  
  return results.slice(0, maxResults);
}

interface CodeChunk {
  code: string;
  lineRange: { start: number; end: number };
}

/**
 * Split code into logical chunks
 */
function splitIntoChunks(code: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = code.split('\n');
  
  // Find function and class boundaries
  let currentChunk: string[] = [];
  let startLine = 0;
  let braceDepth = 0;
  let inChunk = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    // Start of a function or class
    if (/^(export\s+)?(async\s+)?(function|class)\s+\w+/.test(line.trim()) || /^(export\s+)?const\s+\w+\s*=\s*(\([^)]*\))?\s*=>/.test(line.trim())) {
      if (currentChunk.length > 0) {
        chunks.push({
          code: currentChunk.join('\n'),
          lineRange: { start: startLine, end: i - 1 },
        });
      }
      currentChunk = [line];
      startLine = i;
      inChunk = true;
      braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    } else if (inChunk) {
      currentChunk.push(line);
      braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      
      if (braceDepth === 0 && currentChunk.length > 2) {
        chunks.push({
          code: currentChunk.join('\n'),
          lineRange: { start: startLine, end: i },
        });
        currentChunk = [];
        inChunk = false;
      }
    }
  }
  
  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      code: currentChunk.join('\n'),
      lineRange: { start: startLine, end: lines.length - 1 },
    });
  }
  
  // If no chunks found, treat entire file as one chunk
  if (chunks.length === 0) {
    chunks.push({
      code,
      lineRange: { start: 0, end: lines.length - 1 },
    });
  }
  
  return chunks;
}

/**
 * Generate explanation for match
 */
function generateExplanation(
  queryFeatures: SemanticFeatures,
  codeFeatures: SemanticFeatures,
  similarity: number
): string {
  const reasons: string[] = [];
  
  const keywordOverlap = queryFeatures.keywords.filter(k => codeFeatures.keywords.includes(k));
  if (keywordOverlap.length > 0) {
    reasons.push(`Shares keywords: ${keywordOverlap.slice(0, 3).join(', ')}`);
  }
  
  const patternOverlap = queryFeatures.patterns.filter(p => codeFeatures.patterns.includes(p));
  if (patternOverlap.length > 0) {
    reasons.push(`Uses patterns: ${patternOverlap.join(', ')}`);
  }
  
  const intentOverlap = queryFeatures.intent.filter(i => codeFeatures.intent.includes(i));
  if (intentOverlap.length > 0) {
    reasons.push(`Similar intent: ${intentOverlap.join(', ')}`);
  }
  
  return reasons.join('; ') || `${(similarity * 100).toFixed(0)}% semantic match`;
}

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Perform semantic code search
 */
export async function searchCode(request: SemanticSearchRequest): Promise<SemanticSearchResponse> {
  const timer = createTimer();
  
  logger.info({
    query: request.query.substring(0, 100),
    queryType: request.queryType,
  }, 'Starting semantic search');
  
  // Interpret the query
  let interpretedIntent = request.query;
  let searchQuery = request.query;
  
  // If natural language, convert to features
  if (request.queryType === 'natural-language' || !request.queryType) {
    // Extract intent from natural language
    interpretedIntent = request.query;
    
    // Try AI interpretation
    if (!isNoLLMMode()) {
      try {
        const provider = await getActiveProvider();
        const response = await provider.complete(
          `Given this search query: "${request.query}"

Generate a short code snippet that would match this intent. Respond with ONLY the code, no explanations.`,
          {
            systemPrompt: 'You are a code search assistant. Generate minimal code snippets.',
            temperature: 0.3,
            maxTokens: 200,
          }
        );
        searchQuery = response.text.trim();
      } catch {
        // Use query as-is
      }
    }
  }
  
  // Extract features from query
  const queryFeatures = extractSemanticFeatures(searchQuery);
  
  // Perform search
  const results = await searchFiles(
    request.projectPath,
    queryFeatures,
    request.filters || {},
    request.maxResults || 20
  );
  
  // Generate suggested refinements
  const suggestedRefinements: string[] = [];
  if (results.length === 0) {
    suggestedRefinements.push('Try broader keywords');
    suggestedRefinements.push('Remove file type filters');
    suggestedRefinements.push('Lower similarity threshold');
  } else if (results.length > 100) {
    suggestedRefinements.push('Add more specific keywords');
    suggestedRefinements.push('Filter by file type or directory');
    suggestedRefinements.push('Increase similarity threshold');
  }
  
  // Extract related patterns
  const relatedPatterns = Array.from(
    new Set(results.flatMap(r => extractPatterns(r.matchedSnippet)))
  ).slice(0, 5);
  
  return {
    query: request.query,
    interpretedIntent,
    results,
    suggestedRefinements: suggestedRefinements.length > 0 ? suggestedRefinements : undefined,
    relatedPatterns: relatedPatterns.length > 0 ? relatedPatterns : undefined,
    executionTimeMs: timer.elapsed(),
  };
}

export default searchCode;
