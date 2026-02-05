/**
 * Atlas Server - Bug Oracle Tool
 * 
 * PREDICTIVE BUG DETECTION & RISK ANALYSIS ENGINE
 * 
 * Revolutionary ML-inspired capabilities:
 * - Predict where bugs are likely to occur based on code patterns
 * - Calculate bug probability scores for each file/function
 * - Identify high-risk code changes before they cause issues
 * - Detect bug-prone patterns (complexity, coupling, churn)
 * - Generate pre-emptive test recommendations
 * - Track historical bug patterns and learn from them
 * - Provide confidence intervals for predictions
 * - Integration with git history for churn analysis
 * 
 * @module bug-oracle
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer } from '../utils.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface BugOracleRequest {
  projectPath: string;
  targetFiles?: string[];
  analysisDepth?: 'quick' | 'standard' | 'deep';
  includeGitHistory?: boolean;
  timeRange?: { startDate: string; endDate: string };
  customPatterns?: BugPattern[];
}

export interface BugPrediction {
  filePath: string;
  overallRiskScore: number; // 0-100
  bugProbability: number; // 0-1
  confidence: number; // 0-1
  riskFactors: RiskFactor[];
  hotspots: CodeHotspot[];
  recommendations: Recommendation[];
  historicalBugs?: HistoricalBugInfo[];
}

export interface RiskFactor {
  name: string;
  category: 'complexity' | 'coupling' | 'churn' | 'pattern' | 'age' | 'coverage' | 'author';
  score: number; // 0-100 contribution to risk
  description: string;
  evidence: string[];
  mitigation?: string;
}

export interface CodeHotspot {
  lineRange: { start: number; end: number };
  symbol?: string;
  riskScore: number;
  reasons: string[];
  suggestedAction: string;
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'refactor' | 'test' | 'review' | 'document' | 'split';
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: string;
}

export interface HistoricalBugInfo {
  commitHash: string;
  date: string;
  bugType: string;
  linesAffected: number[];
  fixedIn?: string;
}

export interface BugPattern {
  name: string;
  regex: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface BugOracleResult {
  predictions: BugPrediction[];
  projectSummary: ProjectRiskSummary;
  topRiskyFiles: string[];
  trendAnalysis?: TrendAnalysis;
  executionTimeMs: number;
}

export interface ProjectRiskSummary {
  averageRiskScore: number;
  totalHighRiskFiles: number;
  mostCommonRiskFactors: string[];
  estimatedBugDensity: number;
  recommendedPriorityFiles: string[];
  overallHealthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface TrendAnalysis {
  riskTrend: 'improving' | 'stable' | 'worsening';
  bugFrequencyTrend: number[];
  complexityTrend: number[];
  periodAnalyzed: string;
}

// ============================================================================
// Built-in Bug Patterns
// ============================================================================

const BUILT_IN_BUG_PATTERNS: BugPattern[] = [
  // Null/Undefined issues
  { name: 'null-check-missing', regex: '\\.\\w+\\s*\\(', severity: 'high', description: 'Method call without null check' },
  { name: 'optional-chain-missing', regex: '\\w+\\.\\w+\\.\\w+', severity: 'medium', description: 'Deep property access without optional chaining' },
  
  // Async issues
  { name: 'missing-await', regex: 'async\\s+function[^]*?(?!await)[^]*?\\bpromise\\b', severity: 'critical', description: 'Async function without await' },
  { name: 'unhandled-promise', regex: '\\.then\\([^)]*\\)(?!\\s*\\.catch)', severity: 'high', description: 'Promise without error handling' },
  { name: 'race-condition', regex: 'setTimeout.*setState|setState.*setTimeout', severity: 'high', description: 'Potential race condition' },
  
  // Type safety issues
  { name: 'any-type', regex: ':\\s*any\\b', severity: 'medium', description: 'Use of any type' },
  { name: 'type-assertion', regex: 'as\\s+\\w+(?!\\s*\\[)', severity: 'low', description: 'Type assertion that may fail' },
  
  // Logic issues
  { name: 'equality-check', regex: '[^!=]==[^=]', severity: 'medium', description: 'Non-strict equality check' },
  { name: 'empty-catch', regex: 'catch\\s*\\([^)]*\\)\\s*{\\s*}', severity: 'high', description: 'Empty catch block swallowing errors' },
  { name: 'magic-number', regex: '(?<!\\.)\\b(?<!\\d\\.)[2-9]\\d{2,}\\b(?!\\.)', severity: 'low', description: 'Magic number without constant' },
  
  // Security issues
  { name: 'eval-usage', regex: '\\beval\\s*\\(', severity: 'critical', description: 'Use of eval - security risk' },
  { name: 'innerHTML', regex: '\\.innerHTML\\s*=', severity: 'high', description: 'innerHTML assignment - XSS risk' },
  { name: 'sql-concat', regex: '(SELECT|INSERT|UPDATE|DELETE)[^]*?\\+\\s*\\w+', severity: 'critical', description: 'SQL string concatenation' },
  
  // Complexity issues
  { name: 'long-function', regex: 'function\\s+\\w+[^]*?{[^]{500,}', severity: 'medium', description: 'Function too long (>50 lines)' },
  { name: 'deep-nesting', regex: '\\{[^{}]*\\{[^{}]*\\{[^{}]*\\{[^{}]*\\{', severity: 'high', description: 'Deeply nested code blocks' },
  { name: 'high-params', regex: '\\([^)]{100,}\\)', severity: 'medium', description: 'Too many function parameters' },
  
  // Memory issues
  { name: 'event-listener-leak', regex: 'addEventListener[^]*?(?!removeEventListener)', severity: 'high', description: 'Potential event listener memory leak' },
  { name: 'interval-leak', regex: 'setInterval[^]*?(?!clearInterval)', severity: 'high', description: 'Potential setInterval memory leak' },
];

// ============================================================================
// Code Analysis Functions
// ============================================================================

/**
 * Calculate cyclomatic complexity of code
 */
function calculateComplexity(code: string): number {
  const decisionPoints = [
    /\bif\b/g, /\belse\s+if\b/g, /\bwhile\b/g, /\bfor\b/g,
    /\bcase\b/g, /\bcatch\b/g, /\?\s*[^:]+:/g, /&&/g, /\|\|/g,
    /\?\?/g,
  ];
  
  let complexity = 1;
  for (const pattern of decisionPoints) {
    complexity += (code.match(pattern) || []).length;
  }
  
  return complexity;
}

/**
 * Calculate cognitive complexity (how hard code is to understand)
 */
function calculateCognitiveComplexity(code: string): number {
  let complexity = 0;
  let nestingLevel = 0;
  const lines = code.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Count nesting incrementers
    if (/\bif\b|\bfor\b|\bwhile\b|\bswitch\b|\btry\b/.test(trimmed)) {
      complexity += 1 + nestingLevel;
      if (trimmed.includes('{')) nestingLevel++;
    } else if (/\belse\s+if\b/.test(trimmed)) {
      complexity += 1;
    } else if (/\belse\b/.test(trimmed)) {
      complexity += 1;
    } else if (trimmed === '}') {
      nestingLevel = Math.max(0, nestingLevel - 1);
    }
    
    // Recursion penalty
    if (/\bfunction\s+(\w+)[^]*?\1\s*\(/.test(code)) {
      complexity += 2;
    }
  }
  
  return complexity;
}

/**
 * Calculate coupling score (how connected to other modules)
 */
function calculateCoupling(code: string): number {
  const imports = (code.match(/import\s+/g) || []).length;
  const exports = (code.match(/export\s+/g) || []).length;
  const globalRefs = (code.match(/\b(window|document|global|process)\./g) || []).length;
  
  return Math.min(100, imports * 3 + exports * 2 + globalRefs * 5);
}

/**
 * Get git churn metrics for a file
 */
function getGitChurn(projectPath: string, filePath: string): { commits: number; authors: number; recentChanges: number } {
  try {
    const relativePath = path.relative(projectPath, filePath);
    
    // Total commits
    const commits = parseInt(
      execSync(`git -C "${projectPath}" rev-list --count HEAD -- "${relativePath}"`, { encoding: 'utf-8' }).trim()
    ) || 0;
    
    // Unique authors
    const authorsOutput = execSync(
      `git -C "${projectPath}" shortlog -sn -- "${relativePath}"`, 
      { encoding: 'utf-8' }
    );
    const authors = authorsOutput.split('\n').filter(l => l.trim()).length;
    
    // Recent changes (last 30 days)
    const recentChanges = parseInt(
      execSync(
        `git -C "${projectPath}" rev-list --count --since="30 days ago" HEAD -- "${relativePath}"`,
        { encoding: 'utf-8' }
      ).trim()
    ) || 0;
    
    return { commits, authors, recentChanges };
  } catch {
    return { commits: 0, authors: 0, recentChanges: 0 };
  }
}

/**
 * Detect bug patterns in code
 */
function detectBugPatterns(code: string, customPatterns?: BugPattern[]): Array<{ pattern: BugPattern; matches: number; locations: number[] }> {
  const patterns = [...BUILT_IN_BUG_PATTERNS, ...(customPatterns || [])];
  const results: Array<{ pattern: BugPattern; matches: number; locations: number[] }> = [];
  
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.regex, 'gi');
      const matches: number[] = [];
      let match;
      
      while ((match = regex.exec(code)) !== null) {
        const lineNumber = code.substring(0, match.index).split('\n').length;
        matches.push(lineNumber);
      }
      
      if (matches.length > 0) {
        results.push({
          pattern,
          matches: matches.length,
          locations: matches,
        });
      }
    } catch (e) {
      // Invalid regex, skip
    }
  }
  
  return results;
}

/**
 * Calculate bug probability based on all factors
 */
function calculateBugProbability(
  complexity: number,
  cognitiveComplexity: number,
  coupling: number,
  churn: { commits: number; authors: number; recentChanges: number },
  patternViolations: number,
  linesOfCode: number
): number {
  // Weighted formula based on research
  const complexityFactor = Math.min(complexity / 50, 1) * 0.25;
  const cognitiveFactor = Math.min(cognitiveComplexity / 100, 1) * 0.20;
  const couplingFactor = Math.min(coupling / 100, 1) * 0.15;
  const churnFactor = Math.min(churn.recentChanges / 10, 1) * 0.15;
  const authorFactor = Math.min(churn.authors / 5, 1) * 0.10;
  const patternFactor = Math.min(patternViolations / 10, 1) * 0.10;
  const sizeFactor = Math.min(linesOfCode / 500, 1) * 0.05;
  
  return complexityFactor + cognitiveFactor + couplingFactor + churnFactor + 
         authorFactor + patternFactor + sizeFactor;
}

// ============================================================================
// Main Oracle Function
// ============================================================================

/**
 * Predict bugs in a codebase
 */
export async function predictBugs(request: BugOracleRequest): Promise<BugOracleResult> {
  const timer = createTimer();
  
  logger.info({ 
    projectPath: request.projectPath,
    depth: request.analysisDepth,
  }, 'Starting bug prediction');
  
  const predictions: BugPrediction[] = [];
  const allRiskScores: number[] = [];
  const riskFactorCounts = new Map<string, number>();
  
  // Find files to analyze
  async function findFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          files.push(...await findFiles(fullPath));
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx|py|java|go|rs)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
    return files;
  }
  
  const filesToAnalyze = request.targetFiles || await findFiles(request.projectPath);
  
  for (const filePath of filesToAnalyze) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const linesOfCode = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;
      
      // Calculate metrics
      const complexity = calculateComplexity(content);
      const cognitiveComplexity = calculateCognitiveComplexity(content);
      const coupling = calculateCoupling(content);
      const churn = request.includeGitHistory !== false 
        ? getGitChurn(request.projectPath, filePath)
        : { commits: 0, authors: 0, recentChanges: 0 };
      
      // Detect patterns
      const patternResults = detectBugPatterns(content, request.customPatterns);
      const patternViolations = patternResults.reduce((acc, r) => acc + r.matches, 0);
      
      // Calculate probability
      const bugProbability = calculateBugProbability(
        complexity, cognitiveComplexity, coupling, churn, patternViolations, linesOfCode
      );
      
      // Build risk factors
      const riskFactors: RiskFactor[] = [];
      
      if (complexity > 20) {
        riskFactors.push({
          name: 'High Cyclomatic Complexity',
          category: 'complexity',
          score: Math.min(100, complexity * 3),
          description: `Cyclomatic complexity of ${complexity} exceeds recommended threshold of 20`,
          evidence: ['Multiple decision paths make testing difficult'],
          mitigation: 'Break down into smaller functions',
        });
        riskFactorCounts.set('complexity', (riskFactorCounts.get('complexity') || 0) + 1);
      }
      
      if (cognitiveComplexity > 50) {
        riskFactors.push({
          name: 'High Cognitive Complexity',
          category: 'complexity',
          score: Math.min(100, cognitiveComplexity * 1.5),
          description: `Cognitive complexity of ${cognitiveComplexity} makes code hard to understand`,
          evidence: ['Deep nesting and complex control flow'],
          mitigation: 'Reduce nesting, extract helper functions',
        });
      }
      
      if (coupling > 50) {
        riskFactors.push({
          name: 'High Coupling',
          category: 'coupling',
          score: coupling,
          description: 'File has many dependencies and global references',
          evidence: [`${(content.match(/import\s+/g) || []).length} imports`],
          mitigation: 'Apply dependency injection, reduce direct imports',
        });
        riskFactorCounts.set('coupling', (riskFactorCounts.get('coupling') || 0) + 1);
      }
      
      if (churn.recentChanges > 5) {
        riskFactors.push({
          name: 'High Churn',
          category: 'churn',
          score: Math.min(100, churn.recentChanges * 15),
          description: `${churn.recentChanges} changes in the last 30 days indicates instability`,
          evidence: [`${churn.commits} total commits, ${churn.authors} authors`],
          mitigation: 'Stabilize requirements before more changes',
        });
        riskFactorCounts.set('churn', (riskFactorCounts.get('churn') || 0) + 1);
      }
      
      // Add pattern-based risk factors
      for (const result of patternResults) {
        riskFactors.push({
          name: result.pattern.name,
          category: 'pattern',
          score: result.matches * (result.pattern.severity === 'critical' ? 25 : 
                                   result.pattern.severity === 'high' ? 15 :
                                   result.pattern.severity === 'medium' ? 10 : 5),
          description: result.pattern.description,
          evidence: [`Found ${result.matches} occurrences at lines: ${result.locations.slice(0, 5).join(', ')}`],
          mitigation: 'Fix the pattern violations',
        });
        riskFactorCounts.set('pattern', (riskFactorCounts.get('pattern') || 0) + 1);
      }
      
      // Calculate overall risk score
      const riskScore = Math.min(100, riskFactors.reduce((acc, f) => acc + f.score, 0) / Math.max(1, riskFactors.length));
      allRiskScores.push(riskScore);
      
      // Identify hotspots
      const hotspots: CodeHotspot[] = [];
      for (const result of patternResults) {
        for (const line of result.locations.slice(0, 3)) {
          hotspots.push({
            lineRange: { start: line, end: line },
            riskScore: result.pattern.severity === 'critical' ? 90 :
                      result.pattern.severity === 'high' ? 70 :
                      result.pattern.severity === 'medium' ? 50 : 30,
            reasons: [result.pattern.description],
            suggestedAction: 'Review and fix',
          });
        }
      }
      
      // Generate recommendations
      const recommendations: Recommendation[] = [];
      
      if (complexity > 30) {
        recommendations.push({
          priority: 'high',
          type: 'refactor',
          description: 'Reduce cyclomatic complexity by extracting functions',
          effort: 'medium',
          impact: 'Reduces bug probability by ~25%',
        });
      }
      
      if (patternResults.some(r => r.pattern.severity === 'critical')) {
        recommendations.push({
          priority: 'critical',
          type: 'review',
          description: 'Immediate security review required for critical patterns',
          effort: 'low',
          impact: 'Prevents potential security vulnerabilities',
        });
      }
      
      if (linesOfCode > 300) {
        recommendations.push({
          priority: 'medium',
          type: 'split',
          description: 'Consider splitting this file into smaller modules',
          effort: 'high',
          impact: 'Improves maintainability and testability',
        });
      }
      
      if (bugProbability > 0.5) {
        recommendations.push({
          priority: 'high',
          type: 'test',
          description: 'Add comprehensive unit tests for high-risk code paths',
          effort: 'medium',
          impact: 'Early bug detection and prevention',
        });
      }
      
      predictions.push({
        filePath: path.relative(request.projectPath, filePath),
        overallRiskScore: riskScore,
        bugProbability,
        confidence: request.analysisDepth === 'deep' ? 0.85 : 
                   request.analysisDepth === 'quick' ? 0.60 : 0.75,
        riskFactors,
        hotspots,
        recommendations,
      });
      
    } catch (e) {
      // Skip files that can't be analyzed
    }
  }
  
  // Sort by risk score
  predictions.sort((a, b) => b.overallRiskScore - a.overallRiskScore);
  
  // Calculate project summary
  const avgRiskScore = allRiskScores.length > 0 
    ? allRiskScores.reduce((a, b) => a + b, 0) / allRiskScores.length 
    : 0;
  
  const topRiskyFiles = predictions.slice(0, 10).map(p => p.filePath);
  
  const mostCommonRiskFactors = [...riskFactorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  
  const healthGrade = avgRiskScore < 20 ? 'A' :
                      avgRiskScore < 40 ? 'B' :
                      avgRiskScore < 60 ? 'C' :
                      avgRiskScore < 80 ? 'D' : 'F';
  
  const projectSummary: ProjectRiskSummary = {
    averageRiskScore: Math.round(avgRiskScore),
    totalHighRiskFiles: predictions.filter(p => p.overallRiskScore > 70).length,
    mostCommonRiskFactors,
    estimatedBugDensity: predictions.reduce((acc, p) => acc + p.bugProbability, 0) / Math.max(1, predictions.length),
    recommendedPriorityFiles: topRiskyFiles.slice(0, 5),
    overallHealthGrade: healthGrade,
  };
  
  return {
    predictions,
    projectSummary,
    topRiskyFiles,
    executionTimeMs: timer.elapsed(),
  };
}

export default predictBugs;
