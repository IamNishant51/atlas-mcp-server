/**
 * Bug Probability Analysis for Atlas Server
 * 
 * Comprehensive analysis of the entire codebase to predict bug probability
 * using ML-based static analysis
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { predictCodeIssues } from './src/tools/ml-predictor.js';

interface FileAnalysis {
  file: string;
  bugProbability: number;
  performanceRisk: number;
  technicalDebt: number;
  overallRisk: string;
  topIssues: string[];
  complexity: {
    cyclomatic: number;
    cognitive: number;
    linesOfCode: number;
  };
}

interface ProjectReport {
  totalFiles: number;
  highRiskFiles: FileAnalysis[];
  mediumRiskFiles: FileAnalysis[];
  lowRiskFiles: FileAnalysis[];
  overallMetrics: {
    averageBugProbability: number;
    averageComplexity: number;
    totalLinesOfCode: number;
    totalTechnicalDebtHours: number;
    highestRiskFile: string;
  };
  recommendations: string[];
}

async function getAllTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      
      // Skip node_modules and dist
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  await scan(dir);
  return files;
}

async function analyzeProject(projectPath: string): Promise<ProjectReport> {
  console.log('🔍 Scanning atlas-server for TypeScript files...\n');
  
  const allFiles = await getAllTypeScriptFiles(projectPath);
  console.log(`Found ${allFiles.length} TypeScript files\n`);
  
  const analyses: FileAnalysis[] = [];
  let totalLinesOfCode = 0;
  let totalComplexity = 0;
  let totalTechnicalDebt = 0;
  
  // Analyze each file
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const relativeFile = file.replace(projectPath + '\\', '').replace(/\\/g, '/');
    
    process.stdout.write(`\rAnalyzing [${i + 1}/${allFiles.length}] ${relativeFile.padEnd(60).substring(0, 60)}`);
    
    try {
      const result = await predictCodeIssues({
        projectPath,
        filePath: file,
        predictions: ['bug-probability', 'performance-issues', 'technical-debt'],
        modelType: 'hybrid',
        confidenceThreshold: 0.3,
        gitHistory: false,
        includeMetrics: true,
      });
      
      const bugPred = result.predictions.find(p => p.type === 'bug-probability');
      const perfPred = result.predictions.find(p => p.type === 'performance-issues');
      const debtPred = result.predictions.find(p => p.type === 'technical-debt');
      
      const topIssues: string[] = [];
      if (bugPred) topIssues.push(`Bug Risk: ${(bugPred.probability * 100).toFixed(0)}%`);
      if (perfPred && perfPred.probability > 0.3) topIssues.push(`Performance: ${perfPred.severity}`);
      if (debtPred) topIssues.push(`Tech Debt: ${debtPred.explanation.match(/(\d+\.?\d*)\s*hours?/)?.[1] || '0'} hrs`);
      
      totalLinesOfCode += result.features.linesOfCode || 0;
      totalComplexity += result.features.cyclomaticComplexity || 0;
      totalTechnicalDebt += parseFloat(debtPred?.explanation.match(/(\d+\.?\d*)\s*hours?/)?.[1] || '0');
      
      analyses.push({
        file: relativeFile,
        bugProbability: bugPred?.probability || 0,
        performanceRisk: perfPred?.probability || 0,
        technicalDebt: parseFloat(debtPred?.explanation.match(/(\d+\.?\d*)\s*hours?/)?.[1] || '0'),
        overallRisk: result.overallRisk,
        topIssues,
        complexity: {
          cyclomatic: result.features.cyclomaticComplexity || 0,
          cognitive: result.features.cognitiveComplexity || 0,
          linesOfCode: result.features.linesOfCode || 0,
        },
      });
    } catch (error) {
      // Skip files that can't be analyzed
      console.error(`\nError analyzing ${relativeFile}:`, error);
    }
  }
  
  console.log('\n\n✅ Analysis complete!\n');
  
  // Sort by bug probability
  analyses.sort((a, b) => b.bugProbability - a.bugProbability);
  
  const highRiskFiles = analyses.filter(a => a.overallRisk === 'critical' || a.overallRisk === 'high');
  const mediumRiskFiles = analyses.filter(a => a.overallRisk === 'moderate');
  const lowRiskFiles = analyses.filter(a => a.overallRisk === 'low' || a.overallRisk === 'minimal');
  
  const avgBugProbability = analyses.reduce((sum, a) => sum + a.bugProbability, 0) / analyses.length;
  const avgComplexity = totalComplexity / analyses.length;
  
  return {
    totalFiles: analyses.length,
    highRiskFiles: highRiskFiles.slice(0, 10),
    mediumRiskFiles: mediumRiskFiles.slice(0, 10),
    lowRiskFiles: lowRiskFiles.slice(0, 5),
    overallMetrics: {
      averageBugProbability: avgBugProbability,
      averageComplexity: avgComplexity,
      totalLinesOfCode,
      totalTechnicalDebtHours: totalTechnicalDebt,
      highestRiskFile: analyses[0]?.file || 'N/A',
    },
    recommendations: [
      'Focus refactoring efforts on high-risk files listed above',
      'Add comprehensive unit tests for files with bug probability > 50%',
      'Reduce cyclomatic complexity in files with complexity > 15',
      'Document complex logic in high cognitive complexity files',
      'Consider breaking down large files (>500 LOC) into smaller modules',
      'Implement code reviews for changes to high-risk files',
      'Add integration tests for critical pipeline components',
      'Monitor performance of files flagged with performance risks',
    ],
  };
}

function printReport(report: ProjectReport) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   ATLAS SERVER - BUG PROBABILITY ANALYSIS REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('📊 OVERALL PROJECT METRICS');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`Total Files Analyzed:       ${report.totalFiles}`);
  console.log(`Total Lines of Code:        ${report.overallMetrics.totalLinesOfCode.toLocaleString()}`);
  console.log(`Average Bug Probability:    ${(report.overallMetrics.averageBugProbability * 100).toFixed(1)}%`);
  console.log(`Average Complexity:         ${report.overallMetrics.averageComplexity.toFixed(1)}`);
  console.log(`Total Technical Debt:       ${report.overallMetrics.totalTechnicalDebtHours.toFixed(1)} hours`);
  console.log(`Highest Risk File:          ${report.overallMetrics.highestRiskFile}\n`);
  
  console.log('🚨 HIGH RISK FILES (Top 10)');
  console.log('─────────────────────────────────────────────────────────────');
  if (report.highRiskFiles.length === 0) {
    console.log('✅ No high-risk files detected!\n');
  } else {
    report.highRiskFiles.forEach((file, i) => {
      console.log(`${i + 1}. ${file.file}`);
      console.log(`   Bug Probability: ${(file.bugProbability * 100).toFixed(0)}% | Risk: ${file.overallRisk.toUpperCase()}`);
      console.log(`   Complexity: ${file.complexity.cyclomatic} | LOC: ${file.complexity.linesOfCode}`);
      console.log(`   Issues: ${file.topIssues.join(', ')}\n`);
    });
  }
  
  console.log('⚠️  MEDIUM RISK FILES (Top 10)');
  console.log('─────────────────────────────────────────────────────────────');
  if (report.mediumRiskFiles.length === 0) {
    console.log('✅ No medium-risk files detected!\n');
  } else {
    report.mediumRiskFiles.slice(0, 5).forEach((file, i) => {
      console.log(`${i + 1}. ${file.file} - Bug Prob: ${(file.bugProbability * 100).toFixed(0)}%, Complexity: ${file.complexity.cyclomatic}`);
    });
    if (report.mediumRiskFiles.length > 5) {
      console.log(`   ... and ${report.mediumRiskFiles.length - 5} more\n`);
    } else {
      console.log('');
    }
  }
  
  console.log('✅ LOW RISK FILES (Sample)');
  console.log('─────────────────────────────────────────────────────────────');
  report.lowRiskFiles.slice(0, 5).forEach((file, i) => {
    console.log(`${i + 1}. ${file.file} - Bug Prob: ${(file.bugProbability * 100).toFixed(0)}%`);
  });
  console.log('');
  
  console.log('💡 RECOMMENDATIONS');
  console.log('─────────────────────────────────────────────────────────────');
  report.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   Analysis Complete - Review high-risk files for refactoring');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Main execution
const projectPath = process.cwd();
analyzeProject(projectPath)
  .then(printReport)
  .catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
