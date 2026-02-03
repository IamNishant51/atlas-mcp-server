/**
 * Atlas Server - Task Decomposition Tool
 * 
 * Breaks down complex user requests into:
 * - Smaller, actionable subtasks
 * - Dependency relationships
 * - Priority and complexity estimates
 * - Suggested execution order
 */

import type {
  PipelineContext,
  DecomposedTask,
  DecompositionResult,
  TaskType,
} from '../types.js';
import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { PromptTemplates } from './ollama.js';
import { logger, generateId, extractJson } from '../utils.js';

// ============================================================================
// Configuration
// ============================================================================

const MAX_TASKS = 10;
const MIN_TASKS = 1;

// ============================================================================
// Task Decomposition
// ============================================================================

/**
 * Decompose a complex request into actionable tasks
 */
export async function decomposeTask(
  context: PipelineContext
): Promise<DecompositionResult> {
  logger.debug(
    { intent: context.intent.primaryIntent },
    'Starting task decomposition'
  );

  const { intent, codeSnippets, projectInfo } = context;

  // For simple, high-confidence intents, use rule-based decomposition
  if (intent.confidence >= 0.9 && isSimpleIntent(intent.primaryIntent)) {
    return ruleBasedDecomposition(context);
  }

  // For complex requests, use LLM-based decomposition
  return llmDecomposition(context);
}

/**
 * Check if intent is simple enough for rule-based decomposition
 */
function isSimpleIntent(intentType: string): boolean {
  return ['explanation', 'documentation', 'general_question'].includes(intentType);
}

/**
 * Rule-based decomposition for simple intents
 */
function ruleBasedDecomposition(context: PipelineContext): DecompositionResult {
  const { intent } = context;
  const tasks: DecomposedTask[] = [];

  switch (intent.primaryIntent) {
    case 'explanation':
      tasks.push(
        createTask('research', 'Research the concept', 1, 'low'),
        createTask('implementation', 'Prepare clear explanation', 2, 'low', ['1'])
      );
      break;

    case 'documentation':
      tasks.push(
        createTask('research', 'Analyze code to document', 1, 'low'),
        createTask('documentation', 'Write documentation', 2, 'medium', ['1']),
        createTask('review', 'Review for clarity', 3, 'low', ['2'])
      );
      break;

    case 'general_question':
      tasks.push(
        createTask('research', 'Research the answer', 1, 'low'),
        createTask('implementation', 'Formulate response', 2, 'low', ['1'])
      );
      break;

    default:
      tasks.push(
        createTask('research', 'Understand requirements', 1, 'low'),
        createTask('implementation', 'Implement solution', 2, 'medium', ['1'])
      );
  }

  return {
    summary: summarizeIntent(context),
    tasks,
    executionOrder: tasks.map((t) => t.id),
    overallComplexity: 'low',
  };
}

/**
 * LLM-based decomposition for complex requests
 */
async function llmDecomposition(
  context: PipelineContext
): Promise<DecompositionResult> {
  // Check if we're in no-LLM mode - use fallback immediately
  if (isNoLLMMode()) {
    logger.debug('No LLM available, using fallback decomposition');
    return fallbackDecomposition(context);
  }

  try {
    const provider = await getActiveProvider();
    const prompt = buildDecompositionPrompt(context);

    const response = await provider.completeJson<{
      summary: string;
      tasks: Array<{
        description: string;
        type: TaskType;
        priority: number;
        complexity: string;
        dependencies: string[];
        approach?: string;
      }>;
      overallComplexity: string;
    }>(prompt, {
      systemPrompt: PromptTemplates.taskDecomposition,
      temperature: 0.4,
    });

  if (response.data) {
    const tasks = response.data.tasks
      .slice(0, MAX_TASKS)
      .map((t, index) => ({
        id: (index + 1).toString(),
        description: t.description,
        type: t.type,
        priority: Math.min(5, Math.max(1, t.priority)) as 1 | 2 | 3 | 4 | 5,
        dependencies: t.dependencies,
        complexity: normalizeComplexity(t.complexity),
        approach: t.approach,
      }));

    return {
      summary: response.data.summary,
      tasks,
      executionOrder: calculateExecutionOrder(tasks),
      overallComplexity: normalizeComplexity(response.data.overallComplexity),
    };
  }

  // Fallback to simple decomposition
  logger.warn('LLM decomposition failed (no valid data), using fallback');
  return fallbackDecomposition(context);
  } catch (error) {
    logger.warn({ error }, 'LLM decomposition failed, using fallback');
    return fallbackDecomposition(context);
  }
}

/**
 * Build the decomposition prompt with context
 */
function buildDecompositionPrompt(context: PipelineContext): string {
  const { intent, codeSnippets, projectInfo, gitContext } = context;

  let prompt = `Decompose this development task into actionable subtasks.

## User Intent
- Type: ${intent.primaryIntent}
- Keywords: ${intent.keywords.join(', ')}
- Entities: ${intent.entities.map((e) => `${e.type}: ${e.value}`).join(', ')}
`;

  if (projectInfo) {
    prompt += `
## Project Context
- Languages: ${projectInfo.languages.join(', ')}
- Frameworks: ${projectInfo.frameworks.join(', ')}
- Package Manager: ${projectInfo.packageManager ?? 'unknown'}
`;
  }

  if (gitContext) {
    prompt += `
## Git Context
- Branch: ${gitContext.currentBranch}
- Has uncommitted changes: ${gitContext.isDirty}
- Recent commits: ${gitContext.recentCommits.slice(0, 3).map((c) => c.message).join('; ')}
`;
  }

  if (codeSnippets.length > 0) {
    prompt += `
## Relevant Code
${codeSnippets.slice(0, 2).map((s) => `File: ${s.filePath}\n\`\`\`${s.language}\n${s.content.substring(0, 500)}\n\`\`\``).join('\n\n')}
`;
  }

  prompt += `
## Output Format
Provide a JSON object with:
{
  "summary": "Brief description of the overall task",
  "tasks": [
    {
      "description": "Task description",
      "type": "research|design|implementation|testing|documentation|review",
      "priority": 1-5,
      "complexity": "low|medium|high",
      "dependencies": ["task_ids this depends on"],
      "approach": "Suggested approach (optional)"
    }
  ],
  "overallComplexity": "low|medium|high"
}`;

  return prompt;
}

/**
 * Calculate optimal execution order based on dependencies
 */
function calculateExecutionOrder(tasks: DecomposedTask[]): string[] {
  const order: string[] = [];
  const completed = new Set<string>();
  const remaining = new Set(tasks.map((t) => t.id));

  // Topological sort
  while (remaining.size > 0) {
    let progress = false;

    for (const taskId of remaining) {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) continue;

      // Check if all dependencies are completed
      const dependenciesMet = task.dependencies.every((dep) => completed.has(dep));
      
      if (dependenciesMet) {
        order.push(taskId);
        completed.add(taskId);
        remaining.delete(taskId);
        progress = true;
      }
    }

    // If no progress, we have a cycle - just add remaining in order
    if (!progress) {
      for (const taskId of remaining) {
        order.push(taskId);
      }
      break;
    }
  }

  return order;
}

/**
 * Fallback decomposition when LLM fails
 */
function fallbackDecomposition(context: PipelineContext): DecompositionResult {
  const { intent } = context;

  const tasks: DecomposedTask[] = [
    createTask('research', 'Understand requirements and gather context', 1, 'low'),
    createTask('design', 'Design solution approach', 2, 'medium', ['1']),
    createTask('implementation', 'Implement the solution', 3, 'medium', ['2']),
    createTask('testing', 'Test and validate', 4, 'low', ['3']),
    createTask('review', 'Review and refine', 5, 'low', ['4']),
  ];

  return {
    summary: summarizeIntent(context),
    tasks,
    executionOrder: tasks.map((t) => t.id),
    overallComplexity: 'medium',
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a task with defaults
 */
function createTask(
  type: TaskType,
  description: string,
  priority: 1 | 2 | 3 | 4 | 5,
  complexity: 'low' | 'medium' | 'high',
  dependencies: string[] = []
): DecomposedTask {
  return {
    id: priority.toString(),
    description,
    type,
    priority,
    dependencies,
    complexity,
  };
}

/**
 * Normalize complexity string to valid value
 */
function normalizeComplexity(value: string): 'low' | 'medium' | 'high' {
  const normalized = value.toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return 'medium';
}

/**
 * Create a summary from intent
 */
function summarizeIntent(context: PipelineContext): string {
  const { intent } = context;
  const action = intent.primaryIntent.replace(/_/g, ' ');
  const entities = intent.entities.map((e) => e.value).join(', ');
  
  if (entities) {
    return `${action} involving ${entities}`;
  }
  
  return action;
}

// ============================================================================
// Task Utilities
// ============================================================================

/**
 * Estimate total effort from tasks
 */
export function estimateTotalEffort(tasks: DecomposedTask[]): {
  minHours: number;
  maxHours: number;
  averageHours: number;
} {
  const efforts = tasks.map((task) => {
    switch (task.complexity) {
      case 'low': return { min: 0.5, max: 2 };
      case 'medium': return { min: 2, max: 8 };
      case 'high': return { min: 8, max: 24 };
    }
  });

  const minHours = efforts.reduce((sum, e) => sum + e.min, 0);
  const maxHours = efforts.reduce((sum, e) => sum + e.max, 0);

  return {
    minHours,
    maxHours,
    averageHours: (minHours + maxHours) / 2,
  };
}

/**
 * Get critical path (longest dependency chain)
 */
export function getCriticalPath(tasks: DecomposedTask[]): string[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  let longestPath: string[] = [];

  function findPath(taskId: string, currentPath: string[]): void {
    const task = taskMap.get(taskId);
    if (!task) return;

    const newPath = [...currentPath, taskId];
    
    if (newPath.length > longestPath.length) {
      longestPath = newPath;
    }

    // Find tasks that depend on this one
    for (const t of tasks) {
      if (t.dependencies.includes(taskId)) {
        findPath(t.id, newPath);
      }
    }
  }

  // Start from tasks with no dependencies
  for (const task of tasks) {
    if (task.dependencies.length === 0) {
      findPath(task.id, []);
    }
  }

  return longestPath;
}

/**
 * Check if tasks form a valid DAG (no cycles)
 */
export function validateTaskGraph(tasks: DecomposedTask[]): {
  valid: boolean;
  cycleNodes?: string[];
} {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function hasCycle(taskId: string): string[] | null {
    visited.add(taskId);
    recursionStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task) {
      for (const depId of task.dependencies) {
        if (!visited.has(depId)) {
          const cycle = hasCycle(depId);
          if (cycle) return cycle;
        } else if (recursionStack.has(depId)) {
          return [depId, taskId];
        }
      }
    }

    recursionStack.delete(taskId);
    return null;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      const cycle = hasCycle(task.id);
      if (cycle) {
        return { valid: false, cycleNodes: cycle };
      }
    }
  }

  return { valid: true };
}
