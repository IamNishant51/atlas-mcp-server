/**
 * Atlas Server - Code Explanation Tool
 * 
 * Intelligent code explanation capabilities:
 * - Line-by-line explanation
 * - Algorithm analysis
 * - Complexity analysis (Big O)
 * - Design pattern identification
 * - Dependency explanation
 * - Beginner-friendly mode
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types
// ============================================================================

export type ExplanationLevel = 'beginner' | 'intermediate' | 'expert';
export type ExplanationType = 'overview' | 'detailed' | 'line-by-line' | 'algorithm';

export interface ExplanationOptions {
  level?: ExplanationLevel;
  type?: ExplanationType;
  language?: string;
  focusArea?: string;
  includeComplexity?: boolean;
  includePatterns?: boolean;
}

export interface CodeExplanation {
  summary: string;
  purpose: string;
  howItWorks: string;
  sections: ExplanationSection[];
  complexity?: ComplexityAnalysis;
  patterns?: DesignPattern[];
  dependencies?: DependencyInfo[];
  suggestions?: string[];
  glossary?: GlossaryTerm[];
}

export interface ExplanationSection {
  title: string;
  lineRange: { start: number; end: number };
  code: string;
  explanation: string;
  keyPoints: string[];
}

export interface ComplexityAnalysis {
  time: string;
  space: string;
  explanation: string;
  bestCase?: string;
  worstCase?: string;
  averageCase?: string;
}

export interface DesignPattern {
  name: string;
  type: 'creational' | 'structural' | 'behavioral' | 'architectural';
  description: string;
  locationHint: string;
}

export interface DependencyInfo {
  name: string;
  type: 'import' | 'external' | 'internal';
  purpose: string;
  required: boolean;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
  example?: string;
}

export interface ExplanationResult {
  explanation: CodeExplanation;
  metadata: {
    level: ExplanationLevel;
    type: ExplanationType;
    language: string;
    lineCount: number;
  };
  generatedAt: string;
}

// ============================================================================
// Code Explanation
// ============================================================================

/**
 * Generate an explanation for the given code
 */
export async function explainCode(
  code: string,
  options: ExplanationOptions = {}
): Promise<ExplanationResult> {
  const {
    level = 'intermediate',
    type = 'overview',
    language,
    focusArea,
    includeComplexity = true,
    includePatterns = true,
  } = options;

  logger.debug({ level, type, codeLength: code.length }, 'Starting code explanation');

  // Detect language
  const detectedLanguage = language ?? detectLanguage(code);

  // Analyze code structure
  const structure = analyzeCodeStructure(code, detectedLanguage);

  // Generate explanation
  let explanation: CodeExplanation;

  if (!isNoLLMMode()) {
    try {
      explanation = await explainWithAI(code, {
        level,
        type,
        language: detectedLanguage,
        focusArea,
        includeComplexity,
        includePatterns,
        structure,
      });
    } catch (error) {
      logger.warn({ error }, 'AI explanation failed, using heuristic explanation');
      explanation = generateHeuristicExplanation(code, detectedLanguage, level, type, structure);
    }
  } else {
    explanation = generateHeuristicExplanation(code, detectedLanguage, level, type, structure);
  }

  return {
    explanation,
    metadata: {
      level,
      type,
      language: detectedLanguage,
      lineCount: code.split('\n').length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Code Analysis
// ============================================================================

interface CodeStructure {
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  controlFlow: string[];
  loops: LoopInfo[];
  conditionals: number;
  complexity: number;
}

interface FunctionInfo {
  name: string;
  params: string[];
  returnType?: string;
  isAsync: boolean;
  lineStart: number;
  lineEnd: number;
}

interface ClassInfo {
  name: string;
  methods: string[];
  properties: string[];
  lineStart: number;
}

interface ImportInfo {
  module: string;
  items: string[];
  isDefault: boolean;
}

interface LoopInfo {
  type: 'for' | 'while' | 'for-of' | 'for-in' | 'forEach' | 'map' | 'reduce';
  lineNumber: number;
  nested: boolean;
}

function analyzeCodeStructure(code: string, language: string): CodeStructure {
  const structure: CodeStructure = {
    functions: [],
    classes: [],
    imports: [],
    controlFlow: [],
    loops: [],
    conditionals: 0,
    complexity: 1, // Base complexity
  };

  const lines = code.split('\n');

  if (['typescript', 'javascript'].includes(language.toLowerCase())) {
    // Analyze functions
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      const lineStart = code.substring(0, match.index).split('\n').length;
      structure.functions.push({
        name: match[1]!,
        params: match[2] ? match[2].split(',').map(p => p.trim()) : [],
        returnType: match[3]?.trim(),
        isAsync: match[0].includes('async'),
        lineStart,
        lineEnd: lineStart + 10, // Approximate
      });
    }

    // Analyze arrow functions
    const arrowRegex = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g;
    while ((match = arrowRegex.exec(code)) !== null) {
      const lineStart = code.substring(0, match.index).split('\n').length;
      structure.functions.push({
        name: match[1]!,
        params: [],
        isAsync: match[0].includes('async'),
        lineStart,
        lineEnd: lineStart + 10,
      });
    }

    // Analyze imports
    const importRegex = /import\s+(?:(\w+)|{([^}]+)}|(\*\s+as\s+\w+))\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(code)) !== null) {
      structure.imports.push({
        module: match[4]!,
        items: match[2] ? match[2].split(',').map(i => i.trim()) : [match[1] ?? match[3] ?? 'default'],
        isDefault: !!match[1],
      });
    }

    // Analyze classes
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(code)) !== null) {
      const lineStart = code.substring(0, match.index).split('\n').length;
      structure.classes.push({
        name: match[1]!,
        methods: [],
        properties: [],
        lineStart,
      });
    }

    // Analyze loops
    const forLoopRegex = /\bfor\s*\(/g;
    let depth = 0;
    while ((match = forLoopRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      // Check if nested by looking at bracket depth
      const beforeCode = code.substring(0, match.index);
      const openBrackets = (beforeCode.match(/{/g) || []).length;
      const closeBrackets = (beforeCode.match(/}/g) || []).length;
      const nested = openBrackets - closeBrackets > 1;
      
      structure.loops.push({
        type: 'for',
        lineNumber,
        nested,
      });
      if (nested) structure.complexity += 2;
      else structure.complexity += 1;
    }

    const whileRegex = /\bwhile\s*\(/g;
    while ((match = whileRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      structure.loops.push({
        type: 'while',
        lineNumber,
        nested: false,
      });
      structure.complexity += 1;
    }

    // Count conditionals
    structure.conditionals = (code.match(/\bif\s*\(|\belse\s+if\s*\(|\?\s*[^:]+\s*:/g) || []).length;
    structure.complexity += structure.conditionals;

    // Analyze control flow
    if (code.includes('try')) structure.controlFlow.push('exception handling');
    if (code.includes('async')) structure.controlFlow.push('async/await');
    if (code.includes('.then')) structure.controlFlow.push('promises');
    if (code.includes('callback')) structure.controlFlow.push('callbacks');
    if (code.includes('yield')) structure.controlFlow.push('generators');
    if (code.includes('Observable') || code.includes('subscribe')) structure.controlFlow.push('reactive');
  }

  return structure;
}

// ============================================================================
// AI Explanation
// ============================================================================

async function explainWithAI(
  code: string,
  options: {
    level: ExplanationLevel;
    type: ExplanationType;
    language: string;
    focusArea?: string;
    includeComplexity: boolean;
    includePatterns: boolean;
    structure: CodeStructure;
  }
): Promise<CodeExplanation> {
  const provider = await getActiveProvider();

  const levelInstructions = {
    beginner: 'Explain like I\'m new to programming. Define all technical terms. Use simple analogies.',
    intermediate: 'Assume basic programming knowledge. Focus on the logic and architecture.',
    expert: 'Be concise and technical. Focus on advanced patterns, edge cases, and optimizations.',
  };

  const prompt = `Explain this ${options.language} code.

## Code
\`\`\`${options.language}
${code}
\`\`\`

## Explanation Level
${levelInstructions[options.level]}

## Explanation Type
${options.type === 'line-by-line' ? 'Explain each significant line or block of code.' : ''}
${options.type === 'algorithm' ? 'Focus on the algorithm, data structures, and computational logic.' : ''}
${options.type === 'detailed' ? 'Provide comprehensive explanation of all aspects.' : ''}
${options.type === 'overview' ? 'Provide a high-level overview of what the code does.' : ''}

${options.focusArea ? `## Focus on: ${options.focusArea}` : ''}

## Code Structure Found
- Functions: ${options.structure.functions.map(f => f.name).join(', ') || 'none'}
- Classes: ${options.structure.classes.map(c => c.name).join(', ') || 'none'}
- Loops: ${options.structure.loops.length}
- Conditionals: ${options.structure.conditionals}
- Estimated complexity: ${options.structure.complexity}

## Output Format
{
  "summary": "One-line summary",
  "purpose": "What problem does this code solve?",
  "howItWorks": "Step-by-step explanation of the logic",
  "sections": [
    {
      "title": "Section name",
      "lineRange": {"start": 1, "end": 10},
      "code": "relevant code snippet",
      "explanation": "what this section does",
      "keyPoints": ["key point 1", "key point 2"]
    }
  ],
  ${options.includeComplexity ? `"complexity": {
    "time": "O(n)",
    "space": "O(1)",
    "explanation": "Why this complexity"
  },` : ''}
  ${options.includePatterns ? `"patterns": [
    {"name": "pattern name", "type": "creational|structural|behavioral|architectural", "description": "how it's used", "locationHint": "where in the code"}
  ],` : ''}
  "dependencies": [
    {"name": "module", "type": "import|external|internal", "purpose": "why it's needed", "required": true}
  ],
  "suggestions": ["improvement suggestion"],
  "glossary": [
    {"term": "technical term", "definition": "simple definition", "example": "usage example"}
  ]
}`;

  const response = await provider.completeJson<CodeExplanation>(prompt, {
    systemPrompt: `You are a patient, expert programming tutor. Explain code clearly at the ${options.level} level. Return valid JSON only.`,
    temperature: 0.4,
    maxTokens: 4096,
  });

  if (response.data) {
    return response.data;
  }

  throw new Error('Failed to generate explanation with AI');
}

// ============================================================================
// Heuristic Explanation
// ============================================================================

function generateHeuristicExplanation(
  code: string,
  language: string,
  level: ExplanationLevel,
  type: ExplanationType,
  structure: CodeStructure
): CodeExplanation {
  const lines = code.split('\n');

  // Generate summary
  const summary = generateSummary(structure);

  // Generate purpose
  const purpose = generatePurpose(structure);

  // Generate how it works
  const howItWorks = generateHowItWorks(structure, language);

  // Generate sections
  const sections = generateSections(code, structure, level);

  // Generate complexity analysis
  const complexity = generateComplexityAnalysis(structure);

  // Generate patterns
  const patterns = detectPatterns(code, language);

  // Generate dependency info
  const dependencies = structure.imports.map(imp => ({
    name: imp.module,
    type: imp.module.startsWith('.') ? 'internal' as const : 'external' as const,
    purpose: `Imports ${imp.items.join(', ')}`,
    required: true,
  }));

  // Generate suggestions
  const suggestions = generateSuggestions(structure, code);

  // Generate glossary for beginners
  const glossary = level === 'beginner' ? generateGlossary(code, language) : undefined;

  return {
    summary,
    purpose,
    howItWorks,
    sections,
    complexity,
    patterns,
    dependencies,
    suggestions,
    glossary,
  };
}

function generateSummary(structure: CodeStructure): string {
  const parts: string[] = [];

  if (structure.functions.length > 0) {
    parts.push(`${structure.functions.length} function(s)`);
  }
  if (structure.classes.length > 0) {
    parts.push(`${structure.classes.length} class(es)`);
  }
  if (structure.loops.length > 0) {
    parts.push(`iterative logic`);
  }
  if (structure.controlFlow.includes('async/await')) {
    parts.push(`async operations`);
  }

  return `This code contains ${parts.join(', ') || 'basic logic'}.`;
}

function generatePurpose(structure: CodeStructure): string {
  const mainFunc = structure.functions[0];
  if (mainFunc) {
    return `The main purpose is to implement ${humanizeName(mainFunc.name)} functionality.`;
  }
  if (structure.classes.length > 0) {
    return `Defines the ${structure.classes[0]!.name} class for encapsulating related functionality.`;
  }
  return 'This code implements specific business logic or utility functions.';
}

function generateHowItWorks(structure: CodeStructure, language: string): string {
  const steps: string[] = [];

  if (structure.imports.length > 0) {
    steps.push(`1. Imports dependencies: ${structure.imports.map(i => i.module).join(', ')}`);
  }

  if (structure.classes.length > 0) {
    steps.push(`2. Defines class(es): ${structure.classes.map(c => c.name).join(', ')}`);
  }

  if (structure.functions.length > 0) {
    for (const [i, func] of structure.functions.entries()) {
      steps.push(`${steps.length + 1}. Function \`${func.name}\`: ${humanizeName(func.name)}`);
    }
  }

  if (structure.loops.length > 0) {
    steps.push(`${steps.length + 1}. Uses ${structure.loops.length} loop(s) for iteration`);
  }

  if (structure.controlFlow.length > 0) {
    steps.push(`${steps.length + 1}. Control flow includes: ${structure.controlFlow.join(', ')}`);
  }

  return steps.join('\n') || 'The code executes sequentially from top to bottom.';
}

function generateSections(
  code: string,
  structure: CodeStructure,
  level: ExplanationLevel
): ExplanationSection[] {
  const sections: ExplanationSection[] = [];
  const lines = code.split('\n');

  // Imports section
  if (structure.imports.length > 0) {
    const importLines = lines.filter(l => l.includes('import '));
    sections.push({
      title: 'Dependencies',
      lineRange: { start: 1, end: Math.min(structure.imports.length + 1, lines.length) },
      code: importLines.join('\n'),
      explanation: 'This section imports external modules and dependencies needed by the code.',
      keyPoints: structure.imports.map(i => `${i.module}: provides ${i.items.join(', ')}`),
    });
  }

  // Function sections
  for (const func of structure.functions) {
    const funcCode = lines.slice(func.lineStart - 1, func.lineEnd).join('\n');
    sections.push({
      title: `Function: ${func.name}`,
      lineRange: { start: func.lineStart, end: func.lineEnd },
      code: funcCode,
      explanation: `${humanizeName(func.name)}. ${func.isAsync ? 'This is an async function that returns a Promise.' : ''}`,
      keyPoints: [
        `Parameters: ${func.params.length > 0 ? func.params.join(', ') : 'none'}`,
        `Returns: ${func.returnType ?? 'unspecified'}`,
        func.isAsync ? 'Asynchronous execution' : 'Synchronous execution',
      ],
    });
  }

  // Class sections
  for (const cls of structure.classes) {
    sections.push({
      title: `Class: ${cls.name}`,
      lineRange: { start: cls.lineStart, end: cls.lineStart + 20 },
      code: `class ${cls.name} { ... }`,
      explanation: `Defines the ${cls.name} class which encapsulates related data and behavior.`,
      keyPoints: [
        'Classes group related functionality together',
        'Methods define what actions the class can perform',
        'Properties store the class state',
      ],
    });
  }

  return sections;
}

function generateComplexityAnalysis(structure: CodeStructure): ComplexityAnalysis {
  // Estimate time complexity based on loops
  let timeComplexity = 'O(1)';
  let spaceComplexity = 'O(1)';
  let explanation = 'Constant time - no significant loops or recursion detected.';

  const nestedLoops = structure.loops.filter(l => l.nested).length;
  const regularLoops = structure.loops.filter(l => !l.nested).length;

  if (nestedLoops > 0) {
    timeComplexity = `O(n^${nestedLoops + 1})`;
    explanation = `Polynomial time due to ${nestedLoops + 1} nested loops.`;
  } else if (regularLoops > 0) {
    timeComplexity = 'O(n)';
    explanation = 'Linear time - iterates through input once.';
  }

  if (regularLoops > 0) {
    spaceComplexity = 'O(n)';
  }

  return {
    time: timeComplexity,
    space: spaceComplexity,
    explanation,
    bestCase: timeComplexity,
    worstCase: timeComplexity,
    averageCase: timeComplexity,
  };
}

function detectPatterns(code: string, language: string): DesignPattern[] {
  const patterns: DesignPattern[] = [];

  // Singleton pattern
  if (code.includes('getInstance') || code.includes('static instance')) {
    patterns.push({
      name: 'Singleton',
      type: 'creational',
      description: 'Ensures only one instance of a class exists.',
      locationHint: 'Look for getInstance() method or static instance property.',
    });
  }

  // Factory pattern
  if (code.includes('create') && code.includes('return new')) {
    patterns.push({
      name: 'Factory',
      type: 'creational',
      description: 'Creates objects without specifying exact class.',
      locationHint: 'Functions that return new instances of different types.',
    });
  }

  // Observer pattern
  if (code.includes('subscribe') || code.includes('addEventListener') || code.includes('emit')) {
    patterns.push({
      name: 'Observer',
      type: 'behavioral',
      description: 'Objects subscribe to events and get notified of changes.',
      locationHint: 'Look for subscribe/emit or addEventListener methods.',
    });
  }

  // Strategy pattern
  if (code.includes('strategy') || (code.includes('interface') && code.match(/execute|run|process/))) {
    patterns.push({
      name: 'Strategy',
      type: 'behavioral',
      description: 'Allows selecting algorithm at runtime.',
      locationHint: 'Multiple implementations of the same interface.',
    });
  }

  // Decorator pattern
  if (code.includes('@') || code.includes('wrapper') || code.includes('decorator')) {
    patterns.push({
      name: 'Decorator',
      type: 'structural',
      description: 'Adds behavior to objects dynamically.',
      locationHint: 'Look for @ syntax or wrapper functions.',
    });
  }

  // Module pattern (common in JS)
  if (code.includes('export') && code.includes('import')) {
    patterns.push({
      name: 'Module',
      type: 'architectural',
      description: 'Encapsulates code and exposes public API.',
      locationHint: 'File-level exports and imports.',
    });
  }

  return patterns;
}

function generateSuggestions(structure: CodeStructure, code: string): string[] {
  const suggestions: string[] = [];

  if (structure.complexity > 10) {
    suggestions.push('Consider breaking down complex functions into smaller, focused functions.');
  }

  if (structure.loops.some(l => l.nested)) {
    suggestions.push('Nested loops may impact performance. Consider using maps or memoization.');
  }

  if (!code.includes('try') && structure.controlFlow.includes('async/await')) {
    suggestions.push('Add error handling (try/catch) for async operations.');
  }

  if (structure.functions.some(f => f.params.length > 4)) {
    suggestions.push('Functions with many parameters could use an options object instead.');
  }

  if (!code.includes('const') && code.includes('let')) {
    suggestions.push('Prefer const over let when variables are not reassigned.');
  }

  return suggestions;
}

function generateGlossary(code: string, language: string): GlossaryTerm[] {
  const glossary: GlossaryTerm[] = [];

  if (code.includes('async')) {
    glossary.push({
      term: 'async',
      definition: 'A keyword that marks a function as asynchronous, meaning it returns a Promise.',
      example: 'async function fetchData() { }',
    });
  }

  if (code.includes('await')) {
    glossary.push({
      term: 'await',
      definition: 'Pauses execution until a Promise resolves, then returns its value.',
      example: 'const data = await fetchData();',
    });
  }

  if (code.includes('=>')) {
    glossary.push({
      term: 'Arrow function (=>)',
      definition: 'A shorter syntax for writing functions.',
      example: 'const add = (a, b) => a + b;',
    });
  }

  if (code.includes('map(')) {
    glossary.push({
      term: 'map()',
      definition: 'Creates a new array by applying a function to each element.',
      example: '[1, 2, 3].map(x => x * 2) // [2, 4, 6]',
    });
  }

  if (code.includes('filter(')) {
    glossary.push({
      term: 'filter()',
      definition: 'Creates a new array with elements that pass a test.',
      example: '[1, 2, 3, 4].filter(x => x > 2) // [3, 4]',
    });
  }

  if (code.includes('reduce(')) {
    glossary.push({
      term: 'reduce()',
      definition: 'Reduces an array to a single value by applying a function.',
      example: '[1, 2, 3].reduce((sum, x) => sum + x, 0) // 6',
    });
  }

  return glossary;
}

function humanizeName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

function detectLanguage(code: string): string {
  if (code.includes('interface ') || code.includes(': string') || code.includes(': number')) {
    return 'typescript';
  }
  if (code.includes('def ') && code.includes(':')) {
    return 'python';
  }
  if (code.includes('func ') && code.includes('package ')) {
    return 'go';
  }
  return 'javascript';
}
