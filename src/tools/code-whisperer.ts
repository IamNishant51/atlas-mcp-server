/**
 * Atlas Server - Code Whisperer Tool
 * 
 * INTELLIGENT CODE COMPLETION & PREDICTION ENGINE
 * 
 * Next-generation capabilities:
 * - Predict entire code blocks, not just single lines
 * - Learn from codebase patterns and conventions
 * - Context-aware suggestions based on project architecture
 * - Multi-file aware completions (knows about related files)
 * - Intent prediction (what are you trying to accomplish?)
 * - Smart imports/dependency suggestions
 * - API usage pattern completion
 * - Error-resistant suggestions (predicts and avoids bugs)
 * - Style-matched code generation
 * - Natural language to code translation
 * 
 * @module code-whisperer
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

export interface WhisperRequest {
  projectPath: string;
  currentFile: string;
  cursorPosition: { line: number; column: number };
  prefix: string; // Code before cursor
  suffix?: string; // Code after cursor
  intent?: string; // Natural language description of what user wants
  mode: 'complete' | 'generate' | 'transform' | 'explain' | 'fix';
  context?: {
    openFiles?: string[];
    recentEdits?: string[];
    errorMessages?: string[];
    testContext?: string;
  };
  options?: {
    maxSuggestions?: number;
    creativityLevel?: 'conservative' | 'balanced' | 'creative';
    includeExplanation?: boolean;
    respectExistingStyle?: boolean;
  };
}

export interface WhisperSuggestion {
  code: string;
  confidence: number;
  explanation?: string;
  insertRange?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  requiredImports?: string[];
  potentialIssues?: string[];
  alternativeApproaches?: string[];
}

export interface WhisperResult {
  suggestions: WhisperSuggestion[];
  detectedIntent: string;
  codebasePatterns: CodePattern[];
  styleGuide: StyleGuide;
  relatedContext: RelatedContext[];
  executionTimeMs: number;
}

export interface CodePattern {
  name: string;
  frequency: number;
  example: string;
  description: string;
}

export interface StyleGuide {
  indentation: string;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingCommas: boolean;
  namingConvention: 'camelCase' | 'PascalCase' | 'snake_case' | 'kebab-case';
  functionStyle: 'arrow' | 'function' | 'mixed';
  importStyle: 'named' | 'default' | 'mixed';
}

export interface RelatedContext {
  filePath: string;
  relevance: number;
  snippet: string;
  type: 'import' | 'usage' | 'similar' | 'test' | 'type';
}

// ============================================================================
// Code Analysis
// ============================================================================

/**
 * Analyze codebase style guide
 */
async function analyzeStyleGuide(projectPath: string): Promise<StyleGuide> {
  const styleGuide: StyleGuide = {
    indentation: '  ',
    quotes: 'single',
    semicolons: true,
    trailingCommas: true,
    namingConvention: 'camelCase',
    functionStyle: 'arrow',
    importStyle: 'named',
  };
  
  try {
    // Try to find and parse ESLint/Prettier config
    const configFiles = ['.eslintrc.js', '.eslintrc.json', '.prettierrc', '.prettierrc.json'];
    for (const configFile of configFiles) {
      try {
        const configPath = path.join(projectPath, configFile);
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content.replace(/\/\/.*/g, ''));
        
        if (config.rules?.semi) {
          styleGuide.semicolons = config.rules.semi[1] !== 'never';
        }
        if (config.rules?.quotes) {
          styleGuide.quotes = config.rules.quotes[1] === 'double' ? 'double' : 'single';
        }
        if (config.singleQuote !== undefined) {
          styleGuide.quotes = config.singleQuote ? 'single' : 'double';
        }
        if (config.tabWidth) {
          styleGuide.indentation = ' '.repeat(config.tabWidth);
        }
        if (config.trailingComma) {
          styleGuide.trailingCommas = config.trailingComma !== 'none';
        }
        break;
      } catch {
        // Config not found or invalid, continue
      }
    }
    
    // Analyze sample files to detect patterns
    const sampleFile = await findSampleFile(projectPath);
    if (sampleFile) {
      const content = await fs.readFile(sampleFile, 'utf-8');
      
      // Detect indentation
      const indentMatch = content.match(/^( +|\t)/m);
      if (indentMatch && indentMatch[1]) {
        styleGuide.indentation = indentMatch[1];
      }
      
      // Detect quotes
      const singleQuotes = (content.match(/'/g) || []).length;
      const doubleQuotes = (content.match(/"/g) || []).length;
      styleGuide.quotes = singleQuotes > doubleQuotes ? 'single' : 'double';
      
      // Detect semicolons
      const semicolons = (content.match(/;\s*$/gm) || []).length;
      const totalStatements = (content.match(/\n/g) || []).length;
      styleGuide.semicolons = semicolons > totalStatements * 0.3;
      
      // Detect function style
      const arrowFunctions = (content.match(/=>\s*{/g) || []).length;
      const regularFunctions = (content.match(/function\s+\w+/g) || []).length;
      styleGuide.functionStyle = arrowFunctions > regularFunctions ? 'arrow' : 
                                 regularFunctions > arrowFunctions ? 'function' : 'mixed';
      
      // Detect naming convention
      const camelCase = (content.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || []).length;
      const snakeCase = (content.match(/\b[a-z]+_[a-z]+/g) || []).length;
      styleGuide.namingConvention = camelCase > snakeCase ? 'camelCase' : 'snake_case';
    }
  } catch (e) {
    // Use defaults
  }
  
  return styleGuide;
}

/**
 * Find a representative sample file
 */
async function findSampleFile(projectPath: string): Promise<string | null> {
  const srcPath = path.join(projectPath, 'src');
  try {
    const entries = await fs.readdir(srcPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        return path.join(srcPath, entry.name);
      }
    }
  } catch {
    // src doesn't exist
  }
  return null;
}

/**
 * Detect code patterns in the codebase
 */
async function detectCodePatterns(projectPath: string, currentFile: string): Promise<CodePattern[]> {
  const patterns: CodePattern[] = [];
  
  try {
    const content = await fs.readFile(currentFile, 'utf-8');
    
    // Detect common patterns
    const patternDetectors = [
      { regex: /export\s+default\s+function\s+\w+/g, name: 'Default Export Function', description: 'Functions exported as default' },
      { regex: /export\s+const\s+\w+\s*=\s*\([^)]*\)\s*=>/g, name: 'Arrow Function Export', description: 'Const arrow functions exported' },
      { regex: /interface\s+\w+Props\s*{/g, name: 'Props Interface', description: 'React-style props interfaces' },
      { regex: /use[A-Z]\w+\s*\(/g, name: 'Custom Hooks', description: 'React custom hooks pattern' },
      { regex: /async\s+function\s+\w+\([^)]*\):\s*Promise</g, name: 'Typed Async Functions', description: 'Typed async functions with Promise return' },
      { regex: /try\s*{\s*[\s\S]*?}\s*catch\s*\(\w+\)/g, name: 'Try-Catch Pattern', description: 'Error handling with try-catch' },
      { regex: /\w+\.map\(\w+\s*=>\s*{/g, name: 'Map Pattern', description: 'Array map with arrow functions' },
      { regex: /const\s*\[\w+,\s*set\w+\]\s*=\s*useState/g, name: 'useState Pattern', description: 'React useState hook pattern' },
      { regex: /useEffect\(\(\)\s*=>\s*{[\s\S]*?},\s*\[/g, name: 'useEffect Pattern', description: 'React useEffect with dependencies' },
    ];
    
    for (const detector of patternDetectors) {
      const matches = content.match(detector.regex) || [];
      if (matches.length > 0) {
        patterns.push({
          name: detector.name,
          frequency: matches.length,
          example: matches[0] || '',
          description: detector.description,
        });
      }
    }
  } catch {
    // File read error
  }
  
  return patterns;
}

/**
 * Find related context from other files
 */
async function findRelatedContext(
  projectPath: string,
  currentFile: string,
  prefix: string
): Promise<RelatedContext[]> {
  const context: RelatedContext[] = [];
  
  try {
    const currentContent = await fs.readFile(currentFile, 'utf-8');
    
    // Extract symbols being used
    const symbolsInUse = new Set<string>();
    const importMatches = currentContent.matchAll(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      if (match[1]) {
        const symbols = match[1].split(',').map(s => s.trim().split(' as ')[0]).filter((s): s is string => !!s);
        symbols.forEach(s => symbolsInUse.add(s));
      }
    }
    
    // Find files that might be related
    const srcPath = path.dirname(currentFile);
    try {
      const entries = await fs.readdir(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name !== path.basename(currentFile) && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const filePath = path.join(srcPath, entry.name);
          const content = await fs.readFile(filePath, 'utf-8');
          
          // Check for exported symbols used in current file
          for (const symbol of symbolsInUse) {
            if (content.includes(`export`) && content.includes(symbol)) {
              const exportMatch = content.match(new RegExp(`export\\s+(?:const|function|class|interface|type)\\s+${symbol}[\\s\\S]{0,200}`));
              if (exportMatch) {
                context.push({
                  filePath: path.relative(projectPath, filePath),
                  relevance: 0.9,
                  snippet: exportMatch[0].substring(0, 200),
                  type: 'import',
                });
              }
            }
          }
          
          // Check for test files
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
            context.push({
              filePath: path.relative(projectPath, filePath),
              relevance: 0.7,
              snippet: content.substring(0, 200),
              type: 'test',
            });
          }
          
          // Check for type definitions
          if (entry.name.endsWith('.d.ts') || content.includes('interface') || content.includes('type ')) {
            const typeMatch = content.match(/(?:interface|type)\s+\w+[\s\S]{0,150}/);
            if (typeMatch) {
              context.push({
                filePath: path.relative(projectPath, filePath),
                relevance: 0.6,
                snippet: typeMatch[0],
                type: 'type',
              });
            }
          }
        }
      }
    } catch {
      // Directory read error
    }
  } catch {
    // File read error
  }
  
  // Sort by relevance
  context.sort((a, b) => b.relevance - a.relevance);
  return context.slice(0, 10);
}

/**
 * Detect user intent from code context
 */
function detectIntent(prefix: string, suffix?: string, explicitIntent?: string): string {
  if (explicitIntent) return explicitIntent;
  
  const lastLines = prefix.split('\n').slice(-5).join('\n');
  
  // Pattern-based intent detection
  if (/function\s+\w*$/.test(lastLines)) return 'Complete function declaration';
  if (/const\s+\w+\s*=\s*$/.test(lastLines)) return 'Initialize variable or function';
  if (/import\s*{?\s*$/.test(lastLines)) return 'Complete import statement';
  if (/if\s*\(\s*$/.test(lastLines)) return 'Complete conditional expression';
  if (/return\s+$/.test(lastLines)) return 'Complete return statement';
  if (/\.map\(\s*$/.test(lastLines)) return 'Complete map callback';
  if (/async\s+$/.test(lastLines)) return 'Define async function';
  if (/class\s+\w+\s*{?\s*$/.test(lastLines)) return 'Implement class body';
  if (/interface\s+\w+\s*{?\s*$/.test(lastLines)) return 'Define interface properties';
  if (/try\s*{\s*$/.test(lastLines)) return 'Implement try-catch logic';
  if (/\/\/\s*TODO:?\s*(.*)$/.test(lastLines)) {
    const match = lastLines.match(/\/\/\s*TODO:?\s*(.*)$/);
    return `Implement: ${match?.[1] || 'pending task'}`;
  }
  
  return 'Continue code implementation';
}

// ============================================================================
// AI-Powered Completion
// ============================================================================

/**
 * Generate completion using AI
 */
async function generateAICompletion(
  request: WhisperRequest,
  styleGuide: StyleGuide,
  patterns: CodePattern[],
  relatedContext: RelatedContext[],
  detectedIntent: string
): Promise<WhisperSuggestion[]> {
  if (isNoLLMMode()) {
    return generateHeuristicCompletion(request, styleGuide, detectedIntent);
  }
  
  try {
    const provider = await getActiveProvider();
    
    // Build context for AI
    const contextSnippets = relatedContext.map(c => `// From ${c.filePath}:\n${c.snippet}`).join('\n\n');
    const patternExamples = patterns.slice(0, 3).map(p => `// Pattern: ${p.name}\n${p.example}`).join('\n');
    
    const systemPrompt = `You are an expert code completion assistant. Generate high-quality, production-ready code that:
1. Follows the existing code style (${styleGuide.quotes} quotes, ${styleGuide.semicolons ? 'uses' : 'no'} semicolons, ${styleGuide.functionStyle} functions)
2. Matches the naming convention: ${styleGuide.namingConvention}
3. Is well-typed (if TypeScript)
4. Handles errors appropriately
5. Is performant and follows best practices

Respond with ONLY the code to complete, no explanations unless specifically asked.`;

    const prompt = `Complete the following code. The user intent is: "${detectedIntent}"

### Current Code Context:
\`\`\`
${request.prefix}
[CURSOR HERE]
${request.suffix || ''}
\`\`\`

### Related Code from Project:
${contextSnippets}

### Common Patterns in This Codebase:
${patternExamples}

Generate the code that should be inserted at [CURSOR HERE]. Only return the code, no markdown formatting.`;

    const response = await provider.complete(prompt, {
      systemPrompt,
      temperature: request.options?.creativityLevel === 'creative' ? 0.8 :
                   request.options?.creativityLevel === 'conservative' ? 0.1 : 0.4,
      maxTokens: 1000,
    });
    
    const code = response.text.trim();
    
    // Extract required imports
    const importMatches = code.matchAll(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g);
    const requiredImports: string[] = [];
    for (const match of importMatches) {
      requiredImports.push(match[0]);
    }
    
    // Check for potential issues
    const potentialIssues: string[] = [];
    if (code.includes('any')) potentialIssues.push('Contains "any" type - consider adding proper types');
    if (code.includes('TODO')) potentialIssues.push('Contains TODO comments');
    if (!code.includes('try') && code.includes('await')) potentialIssues.push('Async code without error handling');
    
    const suggestions: WhisperSuggestion[] = [{
      code,
      confidence: 0.85,
      explanation: request.options?.includeExplanation ? `Generated code for: ${detectedIntent}` : undefined,
      requiredImports: requiredImports.length > 0 ? requiredImports : undefined,
      potentialIssues: potentialIssues.length > 0 ? potentialIssues : undefined,
    }];
    
    // Generate alternative if creative mode
    if (request.options?.creativityLevel === 'creative') {
      const altResponse = await provider.complete(prompt + '\n\nProvide an ALTERNATIVE implementation approach.', {
        systemPrompt,
        temperature: 0.9,
        maxTokens: 1000,
      });
      
      suggestions.push({
        code: altResponse.text.trim(),
        confidence: 0.70,
        explanation: 'Alternative approach',
      });
    }
    
    return suggestions;
    
  } catch (error) {
    logger.warn({ error }, 'AI completion failed, falling back to heuristics');
    return generateHeuristicCompletion(request, styleGuide, detectedIntent);
  }
}

/**
 * Generate completion using heuristics
 */
function generateHeuristicCompletion(
  request: WhisperRequest,
  styleGuide: StyleGuide,
  detectedIntent: string
): WhisperSuggestion[] {
  const suggestions: WhisperSuggestion[] = [];
  const lastLine = request.prefix.split('\n').pop() || '';
  
  const q = styleGuide.quotes === 'single' ? "'" : '"';
  const semi = styleGuide.semicolons ? ';' : '';
  
  // Pattern-based completions
  if (/function\s+(\w+)\s*\(\s*$/.test(lastLine)) {
    const funcName = lastLine.match(/function\s+(\w+)/)?.[1] || 'myFunction';
    suggestions.push({
      code: `) {\n${styleGuide.indentation}// TODO: Implement ${funcName}\n}`,
      confidence: 0.7,
      explanation: 'Complete function signature',
    });
  }
  
  if (/const\s+(\w+)\s*=\s*$/.test(lastLine)) {
    const varName = lastLine.match(/const\s+(\w+)/)?.[1] || 'value';
    suggestions.push({
      code: `null${semi}`,
      confidence: 0.5,
    });
    suggestions.push({
      code: `() => {\n${styleGuide.indentation}// TODO: Implement\n}${semi}`,
      confidence: 0.5,
      explanation: 'Arrow function',
    });
  }
  
  if (/import\s*{\s*$/.test(lastLine)) {
    suggestions.push({
      code: ` } from ${q}${q}${semi}`,
      confidence: 0.6,
    });
  }
  
  if (/if\s*\(\s*$/.test(lastLine)) {
    suggestions.push({
      code: `condition) {\n${styleGuide.indentation}// TODO: Handle condition\n}`,
      confidence: 0.6,
    });
  }
  
  if (/\.map\(\s*$/.test(lastLine)) {
    suggestions.push({
      code: `(item) => {\n${styleGuide.indentation}return item${semi}\n})`,
      confidence: 0.7,
    });
    suggestions.push({
      code: `(item) => item)`,
      confidence: 0.6,
      explanation: 'Short form',
    });
  }
  
  if (/async\s+function\s+(\w+)\s*$/.test(lastLine)) {
    const funcName = lastLine.match(/function\s+(\w+)/)?.[1] || 'asyncFunc';
    suggestions.push({
      code: `(): Promise<void> {\n${styleGuide.indentation}try {\n${styleGuide.indentation}${styleGuide.indentation}// TODO: Implement ${funcName}\n${styleGuide.indentation}} catch (error) {\n${styleGuide.indentation}${styleGuide.indentation}console.error(error)${semi}\n${styleGuide.indentation}${styleGuide.indentation}throw error${semi}\n${styleGuide.indentation}}\n}`,
      confidence: 0.75,
      explanation: 'Async function with error handling',
    });
  }
  
  // Default suggestion
  if (suggestions.length === 0) {
    suggestions.push({
      code: `// TODO: ${detectedIntent}`,
      confidence: 0.3,
      explanation: 'Placeholder for implementation',
    });
  }
  
  return suggestions;
}

// ============================================================================
// Main Whisper Function
// ============================================================================

/**
 * Generate intelligent code completions
 */
export async function whisperCode(request: WhisperRequest): Promise<WhisperResult> {
  const timer = createTimer();
  
  logger.info({
    mode: request.mode,
    cursorPosition: request.cursorPosition,
  }, 'Code Whisperer invoked');
  
  // Analyze codebase
  const [styleGuide, patterns, relatedContext] = await Promise.all([
    analyzeStyleGuide(request.projectPath),
    detectCodePatterns(request.projectPath, request.currentFile),
    findRelatedContext(request.projectPath, request.currentFile, request.prefix),
  ]);
  
  // Detect intent
  const detectedIntent = detectIntent(request.prefix, request.suffix, request.intent);
  
  // Generate suggestions
  const suggestions = await generateAICompletion(
    request,
    styleGuide,
    patterns,
    relatedContext,
    detectedIntent
  );
  
  return {
    suggestions,
    detectedIntent,
    codebasePatterns: patterns,
    styleGuide,
    relatedContext,
    executionTimeMs: timer.elapsed(),
  };
}

export default whisperCode;
