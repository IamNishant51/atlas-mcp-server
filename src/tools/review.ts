/**
 * Atlas Server - AI Code Review Assistant
 * 
 * Comprehensive AI-powered code review capabilities:
 * - Multi-dimensional code quality analysis
 * - Best practices enforcement
 * - Architectural pattern validation
 * - Security vulnerability detection
 * - Performance optimization suggestions
 * - Test coverage recommendations
 * - Documentation quality assessment
 * - Team coding standards compliance
 * 
 * @module review
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface CodeReviewOptions {
  code: string;
  language: string;
  filePath?: string;
  
  // Review aspects
  checkQuality?: boolean;
  checkSecurity?: boolean;
  checkPerformance?: boolean;
  checkArchitecture?: boolean;
  checkTests?: boolean;
  checkDocumentation?: boolean;
  
  // Context
  framework?: string;
  teamStandards?: string;
  pullRequestContext?: string;
  changedFiles?: string[];
}

export interface CodeReviewResult {
  code: string;
  overallScore: number; // 0-100
  grades: ReviewGrades;
  findings: ReviewFinding[];
  suggestions: ReviewSuggestion[];
  metrics: QualityMetrics;
  summary: string;
  executionTimeMs: number;
  warnings: string[];
}

export interface ReviewGrades {
  quality: Grade;
  security: Grade;
  performance: Grade;
  architecture: Grade;
  tests: Grade;
  documentation: Grade;
}

export interface Grade {
  score: number; // 0-100
  letter: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  issues: number;
  strengths: string[];
  weaknesses: string[];
}

export interface ReviewFinding {
  severity: 'blocker' | 'critical' | 'major' | 'minor' | 'info';
  category: ReviewCategory;
  title: string;
  description: string;
  location?: CodeLocation;
  suggestion: string;
  autoFixable: boolean;
  references?: string[]; // Links to documentation
}

export type ReviewCategory =
  | 'correctness'      // Bugs, logic errors
  | 'security'         // Security vulnerabilities
  | 'performance'      // Performance issues
  | 'maintainability'  // Code readability, complexity
  | 'reliability'      // Error handling, edge cases
  | 'architecture'     // Design patterns, structure
  | 'testing'          // Test coverage, quality
  | 'documentation'    // Comments, docs
  | 'style'            // Code formatting, naming
  | 'best-practices';  // Language/framework conventions

export interface CodeLocation {
  startLine: number;
  endLine: number;
  snippet?: string;
}

export interface ReviewSuggestion {
  priority: 'must' | 'should' | 'consider';
  category: string;
  description: string;
  codeExample?: string;
  rationale: string;
}

export interface QualityMetrics {
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  commentRatio: number; // 0-1
  averageComplexity: number;
  duplicatedCodeRatio: number;
  testCoverage?: number;
  documentationCoverage: number; // % of public APIs documented
}

// ============================================================================
// Validation Schema
// ============================================================================

const CodeReviewOptionsSchema = z.object({
  code: z.string().min(1).max(500000),
  language: z.string().min(1),
  filePath: z.string().optional(),
  checkQuality: z.boolean().optional(),
  checkSecurity: z.boolean().optional(),
  checkPerformance: z.boolean().optional(),
  checkArchitecture: z.boolean().optional(),
  checkTests: z.boolean().optional(),
  checkDocumentation: z.boolean().optional(),
  framework: z.string().optional(),
  teamStandards: z.string().optional(),
  pullRequestContext: z.string().optional(),
  changedFiles: z.array(z.string()).optional(),
});

// ============================================================================
// Static Analysis
// ============================================================================

/**
 * Calculate quality metrics from code
 */
function calculateQualityMetrics(code: string, language: string): QualityMetrics {
  const lines = code.split('\n');
  
  const codeLines = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*') && !trimmed.startsWith('#');
  });
  
  const commentLines = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#');
  });
  
  const blankLines = lines.filter(l => l.trim().length === 0);
  
  // Calculate average complexity (simplified)
  const decisionPoints = (code.match(/\b(if|else|for|while|case|catch|\?|&&|\|\|)\b/g) || []).length;
  const functions = (code.match(/\b(function|def|fn|func)\s+\w+/g) || []).length || 1;
  const averageComplexity = decisionPoints / functions;
  
  // Detect duplicated code (very simplified - just looks for repeated lines)
  const lineSet = new Set(codeLines.map(l => l.trim()));
  const duplicatedCodeRatio = 1 - (lineSet.size / (codeLines.length || 1));
  
  // Check documentation coverage (count documented functions vs total)
  const totalFunctions = (code.match(/\b(function|def|fn|func|class|interface)\s+\w+/g) || []).length;
  const documentedFunctions = (code.match(/\/\*\*[\s\S]*?\*\/\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface)\s+\w+/g) || []).length;
  const documentationCoverage = totalFunctions > 0 ? documentedFunctions / totalFunctions : 0;
  
  return {
    totalLines: lines.length,
    codeLines: codeLines.length,
    commentLines: commentLines.length,
    blankLines: blankLines.length,
    commentRatio: commentLines.length / (codeLines.length || 1),
    averageComplexity,
    duplicatedCodeRatio,
    documentationCoverage,
  };
}

/**
 * Detect common code issues automatically
 */
function detectIssues(code: string, language: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  
  // Security: SQL Injection risk
  if (code.match(/\bquery\s*\+\s*\w+|SELECT.*\+|sql\s*=\s*['"`].*\+/i)) {
    findings.push({
      severity: 'critical',
      category: 'security',
      title: 'Potential SQL Injection',
      description: 'String concatenation detected in SQL queries',
      suggestion: 'Use parameterized queries or prepared statements',
      autoFixable: false,
      references: ['https://owasp.org/www-community/attacks/SQL_Injection'],
    });
  }
  
  // Security: Eval usage
  if (code.match(/\beval\s*\(/)) {
    findings.push({
      severity: 'critical',
      category: 'security',
      title: 'Dangerous eval() usage',
      description: 'eval() can execute arbitrary code and is a security risk',
      suggestion: 'Avoid eval() - use safer alternatives like JSON.parse() or Function constructor',
      autoFixable: false,
    });
  }
  
  // Performance: Console.log in production
  if (code.match(/console\.(log|debug|info)/)) {
    findings.push({
      severity: 'minor',
      category: 'performance',
      title: 'Console logging in code',
      description: 'Console statements can impact performance in production',
      suggestion: 'Use a proper logger with log levels or remove before production',
      autoFixable: true,
    });
  }
  
  // Correctness: Comparison with ==
  if (language === 'javascript' || language === 'typescript') {
    if (code.match(/[^=!]={2}[^=]/)) {
      findings.push({
        severity: 'minor',
        category: 'best-practices',
        title: 'Loose equality (==) instead of strict equality (===)',
        description: 'Using == can lead to unexpected type coercion',
        suggestion: 'Use === for strict equality checks',
        autoFixable: true,
      });
    }
  }
  
  // Maintainability: Magic numbers
  const magicNumbers = code.match(/\b\d{3,}\b/g) || [];
  if (magicNumbers.length > 5) {
    findings.push({
      severity: 'minor',
      category: 'maintainability',
      title: 'Too many magic numbers',
      description: `${magicNumbers.length} numeric literals found without explanation`,
      suggestion: 'Extract magic numbers to named constants',
      autoFixable: false,
    });
  }
  
  // Reliability: Missing error handling
  if (code.match(/\bawait\s+\w+/) && !code.match(/try\s*{[\s\S]*}catch/)) {
    findings.push({
      severity: 'major',
      category: 'reliability',
      title: 'Missing error handling for async code',
      description: 'Async operations without try-catch can cause unhandled rejections',
      suggestion: 'Wrap async code in try-catch blocks',
      autoFixable: false,
    });
  }
  
  // Architecture: God function
  const functionBodies = code.match(/(?:function|def|fn)\s+\w+[^{]*{([^}]{1000,})}/gs) || [];
  if (functionBodies.length > 0) {
    findings.push({
      severity: 'major',
      category: 'architecture',
      title: 'Overly long function(s)',
      description: `${functionBodies.length} function(s) exceed 50 lines`,
      suggestion: 'Break down large functions into smaller, focused ones',
      autoFixable: false,
    });
  }
  
  // Documentation: Missing JSDoc
  const publicFunctions = (code.match(/\bexport\s+(?:async\s+)?function\s+\w+/g) || []).length;
  const documentedExports = (code.match(/\/\*\*[\s\S]*?\*\/\s*export\s+(?:async\s+)?function\s+\w+/g) || []).length;
  if (publicFunctions > documentedExports && publicFunctions > 0) {
    findings.push({
      severity: 'minor',
      category: 'documentation',
      title: 'Missing documentation for public APIs',
      description: `${publicFunctions - documentedExports} exported functions lack documentation`,
      suggestion: 'Add JSDoc comments to all public functions',
      autoFixable: false,
    });
  }
  
  return findings;
}

/**
 * Calculate grade from score
 */
function scoreToGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 97) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ============================================================================
// Main Review Function
// ============================================================================

/**
 * Comprehensive AI-powered code review
 */
export async function reviewCode(options: CodeReviewOptions): Promise<CodeReviewResult> {
  const timer = createTimer();
  
  const {
    code,
    language,
    filePath,
    checkQuality = true,
    checkSecurity = true,
    checkPerformance = true,
    checkArchitecture = true,
    checkTests = false,
    checkDocumentation = true,
    framework,
    teamStandards,
    pullRequestContext,
  } = CodeReviewOptionsSchema.parse(options);

  logger.info({ language, filePath }, 'Starting code review');

  const warnings: string[] = [];
  
  // Static analysis
  const metrics = calculateQualityMetrics(code, language);
  const staticFindings = detectIssues(code, language);
  
  // Build review prompt
  const aspects: string[] = [];
  if (checkQuality) aspects.push('code quality');
  if (checkSecurity) aspects.push('security vulnerabilities');
  if (checkPerformance) aspects.push('performance optimization');
  if (checkArchitecture) aspects.push('architecture and design patterns');
  if (checkTests) aspects.push('test coverage and quality');
  if (checkDocumentation) aspects.push('documentation quality');
  
  const prompt = `You are a senior code reviewer with 50 years of experience conducting PR reviews. Review this ${language} code.

**Code:**
\`\`\`${language}
${code}
\`\`\`

**Context:**
${filePath ? `- File: ${filePath}` : ''}
${framework ? `- Framework: ${framework}` : ''}
${pullRequestContext ? `- PR Context: ${pullRequestContext}` : ''}
${teamStandards ? `- Team Standards:\n${teamStandards}` : ''}

**Metrics:**
- Total Lines: ${metrics.totalLines}
- Code Lines: ${metrics.codeLines}
- Comment Ratio: ${(metrics.commentRatio * 100).toFixed(1)}%
- Average Complexity: ${metrics.averageComplexity.toFixed(1)}
- Documentation Coverage: ${(metrics.documentationCoverage * 100).toFixed(1)}%

**Review Focus:** ${aspects.join(', ')}

**Static Analysis Findings:** ${staticFindings.length} issues detected

**Instructions:**
Provide a comprehensive code review covering:
1. **Quality** (readability, maintainability, complexity)
2. **Security** (vulnerabilities, input validation, auth)
3. **Performance** (algorithmic efficiency, resource usage)
4. **Architecture** (design patterns, separation of concerns)
5. **Testing** (testability, edge cases)
6. **Documentation** (clarity, completeness)

For each aspect, provide:
- Score (0-100)
- Key strengths
- Key weaknesses
- Specific findings with severity

**Format your response as:**

QUALITY: [score]
Strengths: [strength 1], [strength 2]
Weaknesses: [weakness 1], [weakness 2]

SECURITY: [score]
Strengths: [strength 1]
Weaknesses: [weakness 1]

PERFORMANCE: [score]
Strengths: [strength 1]
Weaknesses: [weakness 1]

ARCHITECTURE: [score]
Strengths: [strength 1]
Weaknesses: [weakness 1]

TESTS: [score]
Strengths: [strength 1]
Weaknesses: [weakness 1]

DOCUMENTATION: [score]
Strengths: [strength 1]
Weaknesses: [weakness 1]

FINDINGS:
- [SEVERITY] [CATEGORY]: [description] - Suggestion: [fix]
...

SUMMARY:
[2-3 sentence overall assessment]`;

  let allFindings = [...staticFindings];
  let suggestions: ReviewSuggestion[] = [];
  let grades: ReviewGrades = {
    quality: { score: 70, letter: 'C', issues: 0, strengths: [], weaknesses: [] },
    security: { score: 70, letter: 'C', issues: 0, strengths: [], weaknesses: [] },
    performance: { score: 70, letter: 'C', issues: 0, strengths: [], weaknesses: [] },
    architecture: { score: 70, letter: 'C', issues: 0, strengths: [], weaknesses: [] },
    tests: { score: 0, letter: 'F', issues: 0, strengths: [], weaknesses: [] },
    documentation: { score: Math.round(metrics.documentationCoverage * 100), letter: scoreToGrade(metrics.documentationCoverage * 100), issues: 0, strengths: [], weaknesses: [] },
  };
  let summary = 'Code review completed with static analysis only.';

  if (isNoLLMMode()) {
    warnings.push('No LLM provider - using static analysis only');
    summary = `Static analysis detected ${staticFindings.length} issues. Install an LLM provider for comprehensive AI-powered review.`;
  } else {
    const provider = await getActiveProvider();
    
    try {
      const response = await provider.complete(prompt, {
        maxTokens: 3000,
        temperature: 0.3,
      });

      const responseText = response.text;

      // Parse grades
      const gradePattern = /(\w+):\s*(\d+)\s*Strengths:\s*([^\n]+)\s*Weaknesses:\s*([^\n]+)/gi;
      let match;
      
      while ((match = gradePattern.exec(responseText)) !== null) {
        const aspect = match[1]?.toLowerCase() || '';
        const score = parseInt(match[2] || '70');
        const strengths = (match[3] || '').split(',').map(s => s.trim()).filter(Boolean);
        const weaknesses = (match[4] || '').split(',').map(s => s.trim()).filter(Boolean);
        
        const grade: Grade = {
          score,
          letter: scoreToGrade(score),
          issues: weaknesses.length,
          strengths,
          weaknesses,
        };
        
        if (aspect in grades) {
          (grades as any)[aspect] = grade;
        }
      }
      
      // Parse findings
      const findingsSection = responseText.match(/FINDINGS:\s*([\s\S]*?)(?:SUMMARY:|$)/i);
      if (findingsSection && findingsSection[1]) {
        const findingLines = findingsSection[1].trim().split('\n')
          .filter((line: string) => line.trim().startsWith('-'));
        
        for (const line of findingLines) {
          const cleanLine = line.replace(/^-\s*/, '').trim();
          const parts = cleanLine.split(' - Suggestion: ');
          
          if (parts.length >= 2 && parts[0]) {
            const [firstPart, suggestion] = parts;
            const [severityCategory, ...descParts] = firstPart.split(': ');
            const [severityStr, categoryStr] = (severityCategory || '').split(' ');
            
            allFindings.push({
              severity: (severityStr?.toLowerCase() as any) || 'minor',
              category: (categoryStr?.toLowerCase() as any) || 'best-practices',
              title: descParts.join(': '),
              description: descParts.join(': '),
              suggestion: suggestion || '',
              autoFixable: false,
            });
          }
        }
      }
      
      // Parse summary
      const summaryMatch = responseText.match(/SUMMARY:\s*([\s\S]+?)$/i);
      if (summaryMatch && summaryMatch[1]) {
        summary = summaryMatch[1].trim();
      }
      
      // Generate suggestions
      const criticalIssues = allFindings.filter(f => f.severity === 'blocker' || f.severity === 'critical');
      if (criticalIssues.length > 0) {
        suggestions.push({
          priority: 'must',
          category: 'Critical Issues',
          description: `Fix ${criticalIssues.length} critical/blocker issues before merging`,
          rationale: 'These issues pose security or correctness risks',
        });
      }
      
      if (metrics.averageComplexity > 10) {
        suggestions.push({
          priority: 'should',
          category: 'Complexity',
          description: 'Reduce cyclomatic complexity',
          rationale: 'High complexity makes code harder to test and maintain',
        });
      }
      
      if (metrics.documentationCoverage < 0.5) {
        suggestions.push({
          priority: 'should',
          category: 'Documentation',
          description: 'Improve documentation coverage',
          rationale: 'Well-documented code is easier for team members to understand',
        });
      }
    } catch (error) {
      logger.error({ error }, 'Review failed');
      warnings.push(`LLM error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  // Calculate overall score
  const scores = [
    grades.quality.score,
    grades.security.score,
    grades.performance.score,
    grades.architecture.score,
    grades.documentation.score,
  ];
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const executionTimeMs = timer.elapsed();
  logger.info({ 
    overallScore,
    findings: allFindings.length,
    executionTimeMs 
  }, 'Code review completed');

  return {
    code,
    overallScore,
    grades,
    findings: allFindings,
    suggestions,
    metrics,
    summary,
    executionTimeMs,
    warnings,
  };
}

// ============================================================================
// Export
// ============================================================================

export default reviewCode;
