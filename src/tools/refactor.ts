/**
 * Atlas Server - AI-Powered Code Refactoring Tool
 * 
 * Advanced refactoring capabilities beyond simple code cleanup:
 * - Pattern detection (design patterns, anti-patterns)
 * - Complexity reduction (cyclomatic complexity analysis)
 * - SOLID principles enforcement
 * - Performance hotspot identification
 * - Automated Extract Method/Class/Interface
 * - Dead code elimination
 * - Type inference and migration
 * - Dependency injection suggestions
 * 
 * @module refactor
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer, safeStringify } from '../utils.js';
import { validateInput } from './validation.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface RefactorOptions {
  code: string;
  language: string;
  filePath?: string;
  
  // Refactoring targets
  targets?: RefactorTarget[];
  
  // Configuration
  maxComplexity?: number; // Target cyclomatic complexity
  enforceSOLID?: boolean;
  preserveBehavior?: boolean; // Ensure no behavior changes
  addTypes?: boolean; // Add TypeScript types if missing
  modernize?: boolean; // Update to latest language features
  
  // Context
  projectContext?: string;
  dependencies?: string[];
}

export type RefactorTarget =
  | 'complexity'      // Reduce cyclomatic complexity
  | 'duplication'     // Remove code duplication (DRY)
  | 'naming'          // Improve variable/function names
  | 'structure'       // Improve code organization
  | 'performance'     // Optimize performance
  | 'solid'           // Apply SOLID principles
  | 'patterns'        // Apply design patterns
  | 'types'           // Add/improve type annotations
  | 'async'           // Convert to async/await
  | 'functional'      // Convert to functional style
  | 'deadcode';       // Remove unused code

export interface RefactorResult {
  originalCode: string;
  refactoredCode: string;
  changes: RefactorChange[];
  metrics: CodeMetrics;
  suggestions: string[];
  executionTimeMs: number;
  warnings: string[];
}

export interface RefactorChange {
  type: RefactorTarget;
  description: string;
  lineNumber: number;
  impact: 'high' | 'medium' | 'low';
  autoApplicable: boolean;
}

export interface CodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  maintainabilityIndex: number; // 0-100 score
  duplicatedLines: number;
  functionCount: number;
  classCount: number;
  commentRatio: number;
  testCoverage?: number;
}

// ============================================================================
// Validation Schema
// ============================================================================

const RefactorOptionsSchema = z.object({
  code: z.string().min(1).max(500000),
  language: z.string().min(1),
  filePath: z.string().optional(),
  targets: z.array(z.enum([
    'complexity', 'duplication', 'naming', 'structure', 
    'performance', 'solid', 'patterns', 'types', 
    'async', 'functional', 'deadcode'
  ])).optional(),
  maxComplexity: z.number().min(1).max(50).optional(),
  enforceSOLID: z.boolean().optional(),
  preserveBehavior: z.boolean().optional(),
  addTypes: z.boolean().optional(),
  modernize: z.boolean().optional(),
  projectContext: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

// ============================================================================
// Code Metrics Calculator
// ============================================================================

/**
 * Calculate code metrics for before/after comparison
 */
function calculateMetrics(code: string, language: string): CodeMetrics {
  const lines = code.split('\n');
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  const commentLines = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.startsWith('//') || 
           trimmed.startsWith('/*') || 
           trimmed.startsWith('*') ||
           trimmed.startsWith('#');
  });

  // Simple cyclomatic complexity (count decision points)
  const decisionPoints = (code.match(/\b(if|else|for|while|case|catch|\?|&&|\|\|)\b/g) || []).length;
  const cyclomaticComplexity = decisionPoints + 1;

  // Maintainability Index (simplified formula)
  // MI = max(0, (171 - 5.2 * ln(Halstead Volume) - 0.23 * CC - 16.2 * ln(LOC)) * 100 / 171)
  const volume = Math.log(nonEmptyLines.length + 1) * 10; // Simplified
  const mi = Math.max(0, (171 - 5.2 * volume - 0.23 * cyclomaticComplexity - 16.2 * Math.log(nonEmptyLines.length + 1)) * 100 / 171);

  // Count functions and classes
  const functionCount = (code.match(/\b(function|def|fn|func)\s+\w+/g) || []).length +
                       (code.match(/=>\s*{/g) || []).length;
  const classCount = (code.match(/\b(class|struct|interface)\s+\w+/g) || []).length;

  return {
    linesOfCode: nonEmptyLines.length,
    cyclomaticComplexity,
    maintainabilityIndex: Math.round(mi),
    duplicatedLines: 0, // Would need more sophisticated analysis
    functionCount,
    classCount,
    commentRatio: commentLines.length / (nonEmptyLines.length || 1),
  };
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Detect common code smells and anti-patterns
 */
function detectPatterns(code: string, language: string): { smells: string[]; patterns: string[] } {
  const smells: string[] = [];
  const patterns: string[] = [];

  // God Class detection
  if (code.match(/class\s+\w+\s*{[^}]{2000,}}/s)) {
    smells.push('God Class: Class with too many responsibilities');
  }

  // Long Method detection
  const methods = code.match(/(?:function|def|fn)\s+\w+[^{]*{[^}]{500,}}/gs) || [];
  if (methods.length > 0) {
    smells.push(`Long Method: ${methods.length} functions with 50+ lines`);
  }

  // Magic Numbers
  const magicNumbers = code.match(/\b\d{3,}\b/g) || [];
  if (magicNumbers.length > 3) {
    smells.push(`Magic Numbers: ${magicNumbers.length} hardcoded numeric literals`);
  }

  // Nested Conditionals
  if (code.match(/if\s*\([^)]+\)\s*{[^}]*if\s*\([^)]+\)\s*{[^}]*if/s)) {
    smells.push('Deeply Nested Conditionals: Consider guard clauses');
  }

  // Singleton Pattern detection
  if (code.match(/private\s+static\s+\w+\s+instance\s*[=;]/)) {
    patterns.push('Singleton Pattern detected');
  }

  // Factory Pattern detection
  if (code.match(/class\s+\w*Factory/)) {
    patterns.push('Factory Pattern detected');
  }

  // Observer Pattern detection
  if (code.match(/\b(on|addEventListener|subscribe|emit)\b/)) {
    patterns.push('Observer Pattern detected');
  }

  return { smells, patterns };
}

// ============================================================================
// Main Refactor Function
// ============================================================================

/**
 * AI-powered code refactoring with pattern detection
 */
export async function refactorCode(options: RefactorOptions): Promise<RefactorResult> {
  const timer = createTimer();
  
  // Validate input
  const validated = validateInput(RefactorOptionsSchema, options);
  const { code, language, filePath, targets = [], maxComplexity = 10, enforceSOLID = true } = validated;

  logger.info({ language, targets, filePath }, 'Starting code refactoring');

  // Calculate initial metrics
  const beforeMetrics = calculateMetrics(code, language);
  
  // Detect patterns
  const { smells, patterns } = detectPatterns(code, language);
  
  const warnings: string[] = [];
  const changes: RefactorChange[] = [];

  // Build refactoring prompt
  const targetsStr = targets.length > 0 
    ? targets.join(', ') 
    : 'all common refactorings';

  const prompt = `You are a senior software architect with 50 years of experience. Refactor this ${language} code.

**Original Code:**
\`\`\`${language}
${code}
\`\`\`

**Current Metrics:**
- Lines of Code: ${beforeMetrics.linesOfCode}
- Cyclomatic Complexity: ${beforeMetrics.cyclomaticComplexity}
- Maintainability Index: ${beforeMetrics.maintainabilityIndex}/100
- Functions: ${beforeMetrics.functionCount}
- Classes: ${beforeMetrics.classCount}

**Detected Issues:**
${smells.length > 0 ? smells.map(s => `- ${s}`).join('\n') : '- No major code smells detected'}

**Detected Patterns:**
${patterns.length > 0 ? patterns.map(p => `- ${p}`).join('\n') : '- No design patterns detected'}

**Refactoring Targets:** ${targetsStr}
**Max Complexity Target:** ${maxComplexity}
**Enforce SOLID Principles:** ${enforceSOLID ? 'Yes' : 'No'}

**Instructions:**
1. Refactor the code to improve:
   - Readability and maintainability
   - Performance where applicable
   - Type safety (add types if missing)
   - Follow SOLID principles ${enforceSOLID ? '(strictly)' : '(loosely)'}
   - Reduce cyclomatic complexity to ${maxComplexity} or below
2. Add descriptive comments for complex logic
3. Use modern ${language} features and best practices
4. Extract reusable functions/classes
5. Remove code duplication
6. Preserve original behavior exactly

**Provide:**
1. The refactored code
2. A list of changes made (one per line, format: "TYPE: Description")
3. Suggestions for further improvements

Format your response as:
\`\`\`${language}
[refactored code here]
\`\`\`

CHANGES:
- [change 1]
- [change 2]
...

SUGGESTIONS:
- [suggestion 1]
- [suggestion 2]
...`;

  // Get LLM provider
  let refactoredCode = code;
  let suggestions: string[] = [];

  if (isNoLLMMode()) {
    warnings.push('No LLM provider available - using basic refactoring only');
    
    // Basic automated refactorings without LLM
    refactoredCode = applyBasicRefactorings(code, language, targets);
    suggestions = [
      'Install an LLM provider for advanced AI-powered refactoring',
      'Consider manual code review for complex changes'
    ];
  } else {
    const provider = await getActiveProvider();
    
    try {
      const response = await provider.complete(prompt, {
        maxTokens: 4000,
        temperature: 0.3, // Lower temp for more consistent refactoring
      });

      const responseText = response.text;

      // Parse response
      const codeMatch = responseText.match(new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\`\`\``));
      if (codeMatch && codeMatch[1]) {
        refactoredCode = codeMatch[1].trim();
      } else {
        warnings.push('Could not extract refactored code from LLM response');
        refactoredCode = code;
      }

      // Parse changes
      const changesMatch = responseText.match(/CHANGES:\s*([\s\S]*?)(?:SUGGESTIONS:|$)/);
      if (changesMatch && changesMatch[1]) {
        const changeLines = changesMatch[1].trim().split('\n')
          .filter((line: string) => line.trim().startsWith('-'))
          .map((line: string) => line.replace(/^-\s*/, '').trim());
        
        changeLines.forEach((changeLine: string, idx: number) => {
          const [typeStr, ...descParts] = changeLine.split(':');
          const type = (typeStr?.toLowerCase().trim() as RefactorTarget) || 'structure';
          const description = descParts.join(':').trim();
          
          if (description) {
            changes.push({
              type,
              description,
              lineNumber: 1, // Would need more sophisticated parsing
              impact: beforeMetrics.cyclomaticComplexity > 15 ? 'high' : 'medium',
              autoApplicable: true,
            });
          }
        });
      }

      // Parse suggestions
      const suggestionsMatch = responseText.match(/SUGGESTIONS:\s*([\s\S]*?)$/);
      if (suggestionsMatch && suggestionsMatch[1]) {
        suggestions = suggestionsMatch[1].trim().split('\n')
          .filter((line: string) => line.trim().startsWith('-'))
          .map((line: string) => line.replace(/^-\s*/, '').trim())
          .filter(Boolean);
      }
    } catch (error) {
      logger.error({ error }, 'Refactoring failed');
      warnings.push(`LLM error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      refactoredCode = code;
    }
  }

  // Calculate final metrics
  const afterMetrics = calculateMetrics(refactoredCode, language);

  // Add metrics comparison to suggestions
  if (afterMetrics.cyclomaticComplexity < beforeMetrics.cyclomaticComplexity) {
    suggestions.unshift(`✅ Complexity reduced from ${beforeMetrics.cyclomaticComplexity} to ${afterMetrics.cyclomaticComplexity}`);
  }
  if (afterMetrics.maintainabilityIndex > beforeMetrics.maintainabilityIndex) {
    suggestions.unshift(`✅ Maintainability improved from ${beforeMetrics.maintainabilityIndex} to ${afterMetrics.maintainabilityIndex}`);
  }

  const executionTimeMs = timer.elapsed();
  logger.info({ 
    beforeComplexity: beforeMetrics.cyclomaticComplexity,
    afterComplexity: afterMetrics.cyclomaticComplexity,
    changesCount: changes.length,
    executionTimeMs 
  }, 'Refactoring completed');

  return {
    originalCode: code,
    refactoredCode,
    changes,
    metrics: afterMetrics,
    suggestions,
    executionTimeMs,
    warnings,
  };
}

/**
 * Apply basic refactorings without LLM
 */
function applyBasicRefactorings(code: string, language: string, targets: RefactorTarget[]): string {
  let result = code;

  // Remove trailing whitespace
  result = result.split('\n').map(line => line.trimEnd()).join('\n');

  // Consistent indentation
  result = result.replace(/\t/g, '  ');

  // Remove multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  // Add space after keywords
  result = result.replace(/\b(if|for|while|switch|catch)\(/g, '$1 (');

  return result;
}

// ============================================================================
// Export
// ============================================================================

export default refactorCode;
