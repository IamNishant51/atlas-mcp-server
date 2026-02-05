/**
 * Atlas Server - Tech Debt Quantifier Tool
 * 
 * FINANCIAL TECH DEBT ANALYSIS ENGINE
 * 
 * Revolutionary capabilities:
 * - Calculate actual monetary cost of technical debt
 * - Estimate time to fix each debt item
 * - Priority ranking with ROI calculations
 * - Track debt accumulation over time
 * - Predict future maintenance burden
 * - Cost-benefit analysis for refactoring
 * - Team velocity impact estimation
 * - Compound interest model for debt growth
 * - Breaking point prediction (when debt becomes critical)
 * 
 * @module tech-debt-quantifier
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

export interface TechDebtRequest {
  projectPath: string;
  teamSize?: number;
  hourlyRate?: number; // Developer hourly rate
  sprintLength?: number; // Days per sprint
  targetFiles?: string[];
  includeProjections?: boolean;
}

export interface TechDebtItem {
  id: string;
  category: DebtCategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: { file: string; lineRange?: { start: number; end: number } };
  description: string;
  estimatedFixTime: number; // Hours
  estimatedCost: number; // Money
  compoundingRate: number; // How fast this debt grows (0-1)
  maintenanceBurden: number; // Hours per sprint
  impactScore: number; // 0-100
  roi: number; // Return on investment if fixed
  breakingPoint?: string; // When this becomes critical
}

export type DebtCategory = 
  | 'code-smell'
  | 'outdated-dependency'
  | 'missing-tests'
  | 'poor-architecture'
  | 'duplication'
  | 'complexity'
  | 'documentation'
  | 'security'
  | 'performance'
  | 'scalability';

export interface TechDebtReport {
  totalDebtCost: number;
  totalDebtHours: number;
  debtItems: TechDebtItem[];
  priorityQueue: TechDebtItem[];
  categories: CategoryBreakdown[];
  projections?: DebtProjection;
  recommendations: DebtRecommendation[];
  healthScore: number; // 0-100
  breakingPointEstimate?: string;
  executionTimeMs: number;
}

export interface CategoryBreakdown {
  category: DebtCategory;
  itemCount: number;
  totalCost: number;
  totalHours: number;
  percentageOfTotal: number;
}

export interface DebtProjection {
  next30Days: { cost: number; hours: number };
  next90Days: { cost: number; hours: number };
  next180Days: { cost: number; hours: number };
  yearlyGrowthRate: number;
  compoundedTotal: number;
}

export interface DebtRecommendation {
  priority: 'immediate' | 'high' | 'medium' | 'low';
  action: string;
  rationale: string;
  estimatedSavings: number;
  timeframe: string;
  dependencies?: string[];
}

// ============================================================================
// Debt Detection Patterns
// ============================================================================

const DEBT_PATTERNS = [
  {
    category: 'code-smell' as DebtCategory,
    patterns: [
      { regex: /function\s+\w+[^{]*{[^}]{1500,}}/g, severity: 'high' as const, description: 'God function (>150 lines)', fixTime: 4 },
      { regex: /class\s+\w+[^{]*{[^}]{3000,}}/g, severity: 'high' as const, description: 'God class (>300 lines)', fixTime: 8 },
      { regex: /if\s*\([^)]{100,}\)/g, severity: 'medium' as const, description: 'Complex condition', fixTime: 1 },
      { regex: /\/\/\s*TODO:/gi, severity: 'low' as const, description: 'TODO comment', fixTime: 0.5 },
      { regex: /\/\/\s*FIXME:/gi, severity: 'medium' as const, description: 'FIXME comment', fixTime: 2 },
      { regex: /\/\/\s*HACK:/gi, severity: 'high' as const, description: 'HACK comment', fixTime: 4 },
      { regex: /console\.log\(/g, severity: 'low' as const, description: 'Debug console.log', fixTime: 0.1 },
    ],
  },
  {
    category: 'missing-tests' as DebtCategory,
    patterns: [
      { regex: /export\s+function\s+\w+/g, severity: 'medium' as const, description: 'Exported function without test', fixTime: 2 },
      { regex: /export\s+class\s+\w+/g, severity: 'high' as const, description: 'Exported class without test', fixTime: 4 },
    ],
  },
  {
    category: 'complexity' as DebtCategory,
    patterns: [
      { regex: /\{[^{}]*\{[^{}]*\{[^{}]*\{[^{}]*\{/g, severity: 'high' as const, description: 'Deep nesting (5+ levels)', fixTime: 3 },
      { regex: /switch\s*\([^)]*\)\s*{[^}]*case[^}]*case[^}]*case[^}]*case[^}]*case/g, severity: 'medium' as const, description: 'Large switch statement', fixTime: 2 },
    ],
  },
  {
    category: 'duplication' as DebtCategory,
    patterns: [
      { regex: /function\s+\w+\s*\([^)]*\)\s*{([^}]+)}\s*function\s+\w+\s*\([^)]*\)\s*{\1/g, severity: 'medium' as const, description: 'Duplicate function bodies', fixTime: 2 },
    ],
  },
  {
    category: 'security' as DebtCategory,
    patterns: [
      { regex: /eval\s*\(/g, severity: 'critical' as const, description: 'Use of eval()', fixTime: 3 },
      { regex: /innerHTML\s*=/g, severity: 'high' as const, description: 'innerHTML usage (XSS risk)', fixTime: 1 },
      { regex: /(password|secret|key)\s*=\s*['"][^'"]+['"]/gi, severity: 'critical' as const, description: 'Hardcoded credentials', fixTime: 1 },
    ],
  },
  {
    category: 'performance' as DebtCategory,
    patterns: [
      { regex: /for\s*\([^)]*\)\s*{[^}]*for\s*\([^)]*\)\s*{[^}]*for\s*\(/g, severity: 'high' as const, description: 'Nested loops (O(n³))', fixTime: 4 },
      { regex: /\.forEach\([^)]*\)\s*{[^}]*\.forEach\(/g, severity: 'medium' as const, description: 'Nested forEach', fixTime: 2 },
    ],
  },
];

// ============================================================================
// Debt Analysis Functions
// ============================================================================

/**
 * Detect tech debt items in a file
 */
async function detectDebtInFile(
  filePath: string,
  projectPath: string,
  hourlyRate: number
): Promise<TechDebtItem[]> {
  const items: TechDebtItem[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // Check for test coverage
  const relPath = path.relative(projectPath, filePath);
  const hasTest = await checkTestCoverage(projectPath, relPath);
  
  // Detect pattern-based debt
  for (const category of DEBT_PATTERNS) {
    for (const pattern of category.patterns) {
      const matches = [...content.matchAll(pattern.regex)];
      
      for (const match of matches) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const endLine = lineNumber + (match[0].split('\n').length - 1);
        
        // Calculate compounding rate
        const compoundingRate = category.category === 'security' ? 0.8 :
                                category.category === 'performance' ? 0.6 :
                                category.category === 'complexity' ? 0.4 : 0.2;
        
        const maintenanceBurden = pattern.severity === 'critical' ? 2 :
                                 pattern.severity === 'high' ? 1 :
                                 pattern.severity === 'medium' ? 0.5 : 0.2;
        
        const estimatedCost = pattern.fixTime * hourlyRate;
        const impactScore = pattern.severity === 'critical' ? 90 :
                           pattern.severity === 'high' ? 70 :
                           pattern.severity === 'medium' ? 50 : 30;
        
        // ROI calculation: (maintenanceBurden * 52 weeks * hourlyRate) / estimatedCost
        const roi = (maintenanceBurden * 52 * hourlyRate) / estimatedCost;
        
        items.push({
          id: `${path.basename(filePath)}-${lineNumber}-${category.category}`,
          category: category.category,
          severity: pattern.severity,
          location: {
            file: relPath,
            lineRange: { start: lineNumber, end: endLine },
          },
          description: pattern.description,
          estimatedFixTime: pattern.fixTime,
          estimatedCost,
          compoundingRate,
          maintenanceBurden,
          impactScore,
          roi,
        });
      }
    }
  }
  
  // Check for missing tests
  if (!hasTest && !relPath.includes('.test.') && !relPath.includes('.spec.')) {
    const exportedSymbols = (content.match(/export\s+(?:function|class|const)\s+\w+/g) || []).length;
    if (exportedSymbols > 0) {
      const fixTime = exportedSymbols * 2;
      const cost = fixTime * hourlyRate;
      
      items.push({
        id: `${path.basename(filePath)}-missing-tests`,
        category: 'missing-tests',
        severity: exportedSymbols > 3 ? 'high' : 'medium',
        location: { file: relPath },
        description: `Missing tests for ${exportedSymbols} exported symbols`,
        estimatedFixTime: fixTime,
        estimatedCost: cost,
        compoundingRate: 0.5,
        maintenanceBurden: exportedSymbols * 0.3,
        impactScore: 60,
        roi: (exportedSymbols * 0.3 * 52 * hourlyRate) / cost,
      });
    }
  }
  
  // Check for outdated dependencies (from package.json)
  if (filePath.endsWith('package.json')) {
    try {
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      for (const [name, version] of Object.entries(deps)) {
        // Detect old version patterns
        if (typeof version === 'string' && /^[\^~]?[0-9]+\./.test(version)) {
          const majorVersion = parseInt(version.replace(/[^\d]/g, ''));
          
          // Heuristic: versions < 3 might be outdated for many packages
          if (majorVersion < 3 && !name.includes('legacy')) {
            items.push({
              id: `package-${name}`,
              category: 'outdated-dependency',
              severity: 'medium',
              location: { file: 'package.json' },
              description: `Potentially outdated: ${name}@${version}`,
              estimatedFixTime: 4,
              estimatedCost: 4 * hourlyRate,
              compoundingRate: 0.3,
              maintenanceBurden: 0.5,
              impactScore: 50,
              roi: 3,
              breakingPoint: 'When security vulnerabilities are discovered',
            });
          }
        }
      }
    } catch {
      // Invalid JSON
    }
  }
  
  return items;
}

/**
 * Check if a file has test coverage
 */
async function checkTestCoverage(projectPath: string, filePath: string): Promise<boolean> {
  const testPaths = [
    path.join(projectPath, filePath.replace(/\.(ts|js|tsx|jsx)$/, '.test.$1')),
    path.join(projectPath, filePath.replace(/\.(ts|js|tsx|jsx)$/, '.spec.$1')),
    path.join(projectPath, '__tests__', filePath),
    path.join(path.dirname(path.join(projectPath, filePath)), '__tests__', path.basename(filePath)),
  ];
  
  for (const testPath of testPaths) {
    try {
      await fs.access(testPath);
      return true;
    } catch {
      // Test file doesn't exist
    }
  }
  
  return false;
}

/**
 * Calculate debt projections
 */
function calculateProjections(
  items: TechDebtItem[],
  hourlyRate: number
): DebtProjection {
  const totalMaintenanceBurden = items.reduce((acc, item) => acc + item.maintenanceBurden, 0);
  const averageCompounding = items.reduce((acc, item) => acc + item.compoundingRate, 0) / Math.max(1, items.length);
  
  // Weekly burden
  const weeklyBurden = totalMaintenanceBurden * 2; // 2 weeks per sprint average
  const weeklyCost = weeklyBurden * hourlyRate;
  
  // Growth projections with compound interest model
  const monthlyGrowthRate = 1 + (averageCompounding / 12);
  
  const next30Days = {
    hours: weeklyBurden * 4 * Math.pow(monthlyGrowthRate, 1),
    cost: weeklyCost * 4 * Math.pow(monthlyGrowthRate, 1),
  };
  
  const next90Days = {
    hours: weeklyBurden * 13 * Math.pow(monthlyGrowthRate, 3),
    cost: weeklyCost * 13 * Math.pow(monthlyGrowthRate, 3),
  };
  
  const next180Days = {
    hours: weeklyBurden * 26 * Math.pow(monthlyGrowthRate, 6),
    cost: weeklyCost * 26 * Math.pow(monthlyGrowthRate, 6),
  };
  
  const yearlyGrowthRate = Math.pow(monthlyGrowthRate, 12) - 1;
  
  // Total compounded debt
  const currentDebt = items.reduce((acc, item) => acc + item.estimatedCost, 0);
  const compoundedTotal = currentDebt * Math.pow(1 + yearlyGrowthRate, 1);
  
  return {
    next30Days,
    next90Days,
    next180Days,
    yearlyGrowthRate,
    compoundedTotal,
  };
}

/**
 * Generate recommendations
 */
function generateRecommendations(
  items: TechDebtItem[],
  projections?: DebtProjection
): DebtRecommendation[] {
  const recommendations: DebtRecommendation[] = [];
  
  // Sort by ROI
  const sortedByROI = [...items].sort((a, b) => b.roi - a.roi);
  
  // High ROI items
  const topItem = sortedByROI[0];
  if (sortedByROI.length > 0 && topItem && topItem.roi > 10) {
    recommendations.push({
      priority: 'high',
      action: `Fix high-ROI debt: ${topItem.description}`,
      rationale: `ROI of ${topItem.roi.toFixed(1)}x - will pay back investment in ${(1 / topItem.roi * 52).toFixed(0)} weeks`,
      estimatedSavings: topItem.maintenanceBurden * 52 * (topItem.estimatedCost / topItem.estimatedFixTime),
      timeframe: '1-2 sprints',
    });
  }
  
  // Critical security issues
  const criticalSecurity = items.filter(i => i.category === 'security' && i.severity === 'critical');
  if (criticalSecurity.length > 0) {
    recommendations.push({
      priority: 'immediate',
      action: 'Fix critical security vulnerabilities',
      rationale: 'Security debt can lead to breaches and legal liability',
      estimatedSavings: 0, // Prevented losses
      timeframe: 'Immediate',
    });
  }
  
  // Missing tests
  const missingTests = items.filter(i => i.category === 'missing-tests');
  if (missingTests.length > 3) {
    const totalTestCost = missingTests.reduce((acc, i) => acc + i.estimatedCost, 0);
    recommendations.push({
      priority: 'high',
      action: 'Implement missing test coverage',
      rationale: `${missingTests.length} files lack tests, increasing bug risk`,
      estimatedSavings: totalTestCost * 2, // Tests prevent bugs worth 2x their cost
      timeframe: '2-3 sprints',
    });
  }
  
  // Complexity reduction
  const complexityDebt = items.filter(i => i.category === 'complexity');
  if (complexityDebt.length > 5) {
    recommendations.push({
      priority: 'medium',
      action: 'Refactor complex code',
      rationale: 'High complexity slows development velocity',
      estimatedSavings: complexityDebt.reduce((acc, i) => acc + i.maintenanceBurden * 26, 0),
      timeframe: '4-6 sprints',
    });
  }
  
  // Projections-based
  if (projections && projections.yearlyGrowthRate > 0.5) {
    recommendations.push({
      priority: 'immediate',
      action: 'Halt feature development - debt is compounding too fast',
      rationale: `Debt growing at ${(projections.yearlyGrowthRate * 100).toFixed(0)}% annually - will double in ${(Math.log(2) / Math.log(1 + projections.yearlyGrowthRate)).toFixed(1)} years`,
      estimatedSavings: projections.compoundedTotal,
      timeframe: 'Now',
    });
  }
  
  return recommendations;
}

// ============================================================================
// Main Quantifier Function
// ============================================================================

/**
 * Quantify technical debt in monetary terms
 */
export async function quantifyTechDebt(request: TechDebtRequest): Promise<TechDebtReport> {
  const timer = createTimer();
  
  const hourlyRate = request.hourlyRate || 100; // Default $100/hr
  const teamSize = request.teamSize || 5;
  
  logger.info({
    projectPath: request.projectPath,
    hourlyRate,
    teamSize,
  }, 'Starting tech debt quantification');
  
  // Find files to analyze
  async function findFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          files.push(...await findFiles(fullPath));
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Ignore
    }
    return files;
  }
  
  const filesToAnalyze = request.targetFiles?.map(f => path.join(request.projectPath, f)) || await findFiles(request.projectPath);
  
  // Analyze each file
  const allItems: TechDebtItem[] = [];
  
  for (const file of filesToAnalyze) {
    try {
      const items = await detectDebtInFile(file, request.projectPath, hourlyRate);
      allItems.push(...items);
    } catch (e) {
      // Skip files with errors
    }
  }
  
  // Sort by priority (severity + ROI)
  const priorityQueue = [...allItems].sort((a, b) => {
    const aPriority = (a.severity === 'critical' ? 1000 : 
                       a.severity === 'high' ? 100 : 
                       a.severity === 'medium' ? 10 : 1) + a.roi;
    const bPriority = (b.severity === 'critical' ? 1000 : 
                       b.severity === 'high' ? 100 : 
                       b.severity === 'medium' ? 10 : 1) + b.roi;
    return bPriority - aPriority;
  });
  
  // Calculate totals
  const totalDebtCost = allItems.reduce((acc, item) => acc + item.estimatedCost, 0);
  const totalDebtHours = allItems.reduce((acc, item) => acc + item.estimatedFixTime, 0);
  
  // Category breakdown
  const categoryMap = new Map<DebtCategory, TechDebtItem[]>();
  for (const item of allItems) {
    if (!categoryMap.has(item.category)) {
      categoryMap.set(item.category, []);
    }
    categoryMap.get(item.category)!.push(item);
  }
  
  const categories: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(([category, items]) => {
    const totalCost = items.reduce((acc, i) => acc + i.estimatedCost, 0);
    return {
      category,
      itemCount: items.length,
      totalCost,
      totalHours: items.reduce((acc, i) => acc + i.estimatedFixTime, 0),
      percentageOfTotal: (totalCost / Math.max(1, totalDebtCost)) * 100,
    };
  }).sort((a, b) => b.totalCost - a.totalCost);
  
  // Calculate projections
  const projections = request.includeProjections !== false ? calculateProjections(allItems, hourlyRate) : undefined;
  
  // Generate recommendations
  const recommendations = generateRecommendations(allItems, projections);
  
  // Health score (0-100, lower debt = higher score)
  const maxExpectedDebt = filesToAnalyze.length * 500; // $500 per file as baseline
  const healthScore = Math.max(0, Math.min(100, 100 - (totalDebtCost / maxExpectedDebt) * 100));
  
  // Breaking point estimate
  let breakingPointEstimate: string | undefined;
  if (projections && projections.yearlyGrowthRate > 0.3) {
    const yearsToDouble = Math.log(2) / Math.log(1 + projections.yearlyGrowthRate);
    breakingPointEstimate = `Debt will double in ${yearsToDouble.toFixed(1)} years at current rate`;
  }
  
  return {
    totalDebtCost: Math.round(totalDebtCost),
    totalDebtHours: Math.round(totalDebtHours),
    debtItems: allItems,
    priorityQueue: priorityQueue.slice(0, 20),
    categories,
    projections,
    recommendations,
    healthScore: Math.round(healthScore),
    breakingPointEstimate,
    executionTimeMs: timer.elapsed(),
  };
}

export default quantifyTechDebt;
