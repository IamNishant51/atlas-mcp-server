import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getActiveProvider } from '../providers/llm-provider.js';

export const contextPrioritizerTool = {
  name: 'atlas_context_prioritizer',
  description: 'Automatically determines what files, functions, and context matter most for a given task. Provides relevance scoring and suggests optimal context to include.',
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Description of the task or problem'
      },
      projectPath: {
        type: 'string',
        description: 'Path to project root'
      },
      currentFile: {
        type: 'string',
        description: 'Current file being worked on'
      },
      maxFiles: {
        type: 'number',
        description: 'Maximum number of files to include (default: 10)'
      },
      includeTests: {
        type: 'boolean',
        description: 'Whether to include test files in priority scoring'
      }
    },
    required: ['task', 'projectPath']
  }
};

export async function handleContextPrioritizer(args: any) {
  const { task, projectPath, currentFile, maxFiles = 10, includeTests = true } = args;

  try {
    // Get all source files
    const files = await getAllFiles(projectPath);
    const filteredFiles = includeTests ? files : files.filter(f => !isTestFile(f));

    // Quick statistical analysis
    const stats = await analyzeFiles(filteredFiles, projectPath);

    // Use AI to prioritize based on task
    const provider = await getActiveProvider();
    
    const filesList = stats.slice(0, 50).map(s => // Limit to first 50 for token efficiency
      `${s.relativePath} (${s.lines} lines, ${s.imports.length} imports, modified: ${s.lastModified})`
    ).join('\n');

    const prompt = `Given this task: "${task}"

And these project files:
${filesList}

Current file: ${currentFile || 'none'}

Prioritize the most relevant files for this task. Consider:
- Direct relevance to the task
- Dependencies and imports
- Architectural importance
- Recent modifications

Return JSON array of top ${maxFiles} files with relevance scores:
[
  {
    "file": "relative/path",
    "relevanceScore": number (0-100),
    "reason": "why it's relevant",
    "priority": "critical|high|medium|low"
  }
]`;

    const response = await provider.complete(prompt, { temperature: 0.4 });
    
    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Fallback to heuristic scoring
      return heuristicPrioritization(stats, task, currentFile, maxFiles);
    }

    const prioritized = JSON.parse(jsonMatch[0]);

    return {
      task,
      prioritizedFiles: prioritized,
      totalFilesAnalyzed: filteredFiles.length,
      suggestion: `Focus on ${prioritized.filter((f: any) => f.priority === 'critical' || f.priority === 'high').length} high-priority files`,
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    return {
      error: 'Context prioritization failed',
      details: error.message
    };
  }
}

async function getAllFiles(dir: string, fileList: string[] = []): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip common directories
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
          await getAllFiles(fullPath, fileList);
        }
      } else if (isSourceFile(entry.name)) {
        fileList.push(fullPath);
      }
    }
  } catch (error) {
    // Skip inaccessible directories
  }
  
  return fileList;
}

function isSourceFile(filename: string): boolean {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.rb'];
  return extensions.some(ext => filename.endsWith(ext));
}

function isTestFile(filepath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filepath) || filepath.includes('__tests__');
}

async function analyzeFiles(files: string[], projectPath: string) {
  const stats = await Promise.all(files.map(async (file) => {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const stat = await fs.stat(file);
      const lines = content.split('\n').length;
      const imports = content.match(/^import .+from/gm) || [];
      
      return {
        fullPath: file,
        relativePath: path.relative(projectPath, file),
        lines,
        imports,
        lastModified: stat.mtime.toISOString(),
        size: stat.size
      };
    } catch {
      return null;
    }
  }));

  return stats.filter(Boolean) as any[];
}

function heuristicPrioritization(stats: any[], task: string, currentFile: string | undefined, maxFiles: number) {
  const taskLower = task.toLowerCase();
  const taskWords = taskLower.split(/\s+/);

  const scored = stats.map(stat => {
    let score = 0;
    const filepath = stat.relativePath.toLowerCase();

    // Current file gets boost
    if (currentFile && stat.fullPath.includes(currentFile)) {
      score += 50;
    }

    // Match task keywords in path
    for (const word of taskWords) {
      if (filepath.includes(word)) {
        score += 20;
      }
    }

    // Recent modifications
    const daysSinceModified = (Date.now() - new Date(stat.lastModified).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 7) score += 15;
    else if (daysSinceModified < 30) score += 5;

    // File size/complexity
    if (stat.lines > 100 && stat.lines < 500) score += 10; // Sweet spot
    if (stat.imports.length > 5) score += 5; // Important file

    return { ...stat, score };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles);

  return {
    task,
    prioritizedFiles: top.map(s => ({
      file: s.relativePath,
      relevanceScore: Math.min(100, s.score),
      reason: 'Heuristic scoring based on file characteristics',
      priority: s.score > 50 ? 'high' : s.score > 25 ? 'medium' : 'low'
    })),
    totalFilesAnalyzed: stats.length,
    method: 'heuristic-fallback'
  };
}
