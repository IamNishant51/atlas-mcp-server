/**
 * Atlas Server - Documentation Generation Tool
 * 
 * Automatic documentation generation:
 * - JSDoc/TSDoc comments
 * - Python docstrings
 * - README generation
 * - API documentation
 * - Inline code comments
 * - Changelog generation
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types
// ============================================================================

export type DocStyle = 'jsdoc' | 'tsdoc' | 'pydoc' | 'godoc' | 'rustdoc' | 'auto';
export type DocFormat = 'markdown' | 'html' | 'json' | 'plain';

export interface DocumentationOptions {
  style?: DocStyle;
  format?: DocFormat;
  includeExamples?: boolean;
  includeTypes?: boolean;
  verbose?: boolean;
  language?: string;
}

export interface FunctionDoc {
  name: string;
  description: string;
  params: ParamDoc[];
  returns: ReturnDoc;
  throws?: string[];
  examples?: string[];
  deprecated?: string;
  since?: string;
  see?: string[];
}

export interface ParamDoc {
  name: string;
  type: string;
  description: string;
  optional: boolean;
  defaultValue?: string;
}

export interface ReturnDoc {
  type: string;
  description: string;
}

export interface ClassDoc {
  name: string;
  description: string;
  constructor: FunctionDoc;
  methods: FunctionDoc[];
  properties: PropertyDoc[];
  examples?: string[];
}

export interface PropertyDoc {
  name: string;
  type: string;
  description: string;
  readonly: boolean;
  defaultValue?: string;
}

export interface ModuleDoc {
  name: string;
  description: string;
  exports: string[];
  functions: FunctionDoc[];
  classes: ClassDoc[];
  types: TypeDoc[];
  examples?: string[];
}

export interface TypeDoc {
  name: string;
  type: 'interface' | 'type' | 'enum';
  description: string;
  properties?: PropertyDoc[];
  values?: string[];
}

export interface DocumentationResult {
  documentedCode: string;
  documentation: ModuleDoc;
  readme?: string;
  api?: string;
  stats: DocStats;
  generatedAt: string;
}

export interface DocStats {
  totalFunctions: number;
  documentedFunctions: number;
  totalClasses: number;
  documentedClasses: number;
  coverage: number;
}

// ============================================================================
// Documentation Generation
// ============================================================================

/**
 * Generate documentation for code
 */
export async function generateDocumentation(
  code: string,
  options: DocumentationOptions = {}
): Promise<DocumentationResult> {
  const {
    style = 'auto',
    format = 'markdown',
    includeExamples = true,
    includeTypes = true,
    verbose = false,
    language,
  } = options;

  logger.debug({ style, format, codeLength: code.length }, 'Starting documentation generation');

  // Detect language and style
  const detectedLanguage = language ?? detectLanguage(code);
  const detectedStyle = style === 'auto' ? detectDocStyle(detectedLanguage) : style;

  // Analyze code structure
  const codeAnalysis = analyzeCodeStructure(code, detectedLanguage);

  // Generate documentation
  let documentedCode: string;
  let documentation: ModuleDoc;

  if (!isNoLLMMode()) {
    try {
      const aiResult = await generateDocsWithAI(code, {
        language: detectedLanguage,
        style: detectedStyle,
        includeExamples,
        includeTypes,
        verbose,
        codeAnalysis,
      });
      documentedCode = aiResult.documentedCode;
      documentation = aiResult.documentation;
    } catch (error) {
      logger.warn({ error }, 'AI documentation generation failed, using heuristic generation');
      const heuristicResult = generateHeuristicDocs(code, detectedLanguage, detectedStyle, codeAnalysis);
      documentedCode = heuristicResult.documentedCode;
      documentation = heuristicResult.documentation;
    }
  } else {
    const heuristicResult = generateHeuristicDocs(code, detectedLanguage, detectedStyle, codeAnalysis);
    documentedCode = heuristicResult.documentedCode;
    documentation = heuristicResult.documentation;
  }

  // Generate additional documentation artifacts
  const readme = generateReadme(documentation, detectedLanguage);
  const api = format === 'markdown' ? generateApiDocs(documentation) : undefined;

  // Calculate stats
  const stats = calculateDocStats(codeAnalysis, documentation);

  return {
    documentedCode,
    documentation,
    readme,
    api,
    stats,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Code Analysis
// ============================================================================

interface CodeAnalysis {
  functions: ParsedFunction[];
  classes: ParsedClass[];
  types: ParsedType[];
  exports: string[];
  moduleName?: string;
}

interface ParsedFunction {
  name: string;
  params: { name: string; type?: string; optional: boolean }[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
  lineNumber: number;
  existingDoc?: string;
}

interface ParsedClass {
  name: string;
  methods: ParsedFunction[];
  properties: { name: string; type?: string; readonly: boolean }[];
  isExported: boolean;
  lineNumber: number;
}

interface ParsedType {
  name: string;
  kind: 'interface' | 'type' | 'enum';
  lineNumber: number;
}

function analyzeCodeStructure(code: string, language: string): CodeAnalysis {
  const analysis: CodeAnalysis = {
    functions: [],
    classes: [],
    types: [],
    exports: [],
  };

  const lines = code.split('\n');

  if (['typescript', 'javascript'].includes(language.toLowerCase())) {
    // Parse functions
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      const params = parseParams(match[3] ?? '');
      
      analysis.functions.push({
        name: match[1]!,
        params,
        returnType: match[4]?.trim(),
        isAsync: match[0].includes('async'),
        isExported: match[0].startsWith('export'),
        lineNumber,
      });
    }

    // Parse arrow functions
    const arrowRegex = /(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/g;
    while ((match = arrowRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      const params = parseParams(match[2] ?? '');
      
      analysis.functions.push({
        name: match[1]!,
        params,
        returnType: match[3]?.trim(),
        isAsync: match[0].includes('async'),
        isExported: match[0].startsWith('export'),
        lineNumber,
      });
    }

    // Parse classes
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?\s*\{/g;
    while ((match = classRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      
      analysis.classes.push({
        name: match[1]!,
        methods: [],
        properties: [],
        isExported: match[0].startsWith('export'),
        lineNumber,
      });
    }

    // Parse interfaces and types
    const typeRegex = /(?:export\s+)?(?:(interface|type)\s+(\w+)|enum\s+(\w+))/g;
    while ((match = typeRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      const kind = match[1] as 'interface' | 'type' | undefined;
      const name = match[2] ?? match[3]!;
      
      analysis.types.push({
        name,
        kind: kind ?? 'enum',
        lineNumber,
      });
    }
  } else if (language.toLowerCase() === 'python') {
    // Parse Python functions
    const pyFuncRegex = /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/g;
    let match;
    while ((match = pyFuncRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      const params = parsePythonParams(match[2] ?? '');
      
      analysis.functions.push({
        name: match[1]!,
        params,
        returnType: match[3]?.trim(),
        isAsync: match[0].includes('async'),
        isExported: !match[1]!.startsWith('_'),
        lineNumber,
      });
    }

    // Parse Python classes
    const pyClassRegex = /class\s+(\w+)(?:\([^)]*\))?:/g;
    while ((match = pyClassRegex.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split('\n').length;
      
      analysis.classes.push({
        name: match[1]!,
        methods: [],
        properties: [],
        isExported: !match[1]!.startsWith('_'),
        lineNumber,
      });
    }
  }

  return analysis;
}

function parseParams(paramString: string): { name: string; type?: string; optional: boolean }[] {
  if (!paramString.trim()) return [];
  
  return paramString.split(',').map(p => {
    const trimmed = p.trim();
    const optional = trimmed.includes('?') || trimmed.includes('=');
    const [nameType] = trimmed.split('=');
    const [name, type] = (nameType ?? '').split(':').map(s => s.replace('?', '').trim());
    
    return {
      name: name ?? '',
      type,
      optional,
    };
  }).filter(p => p.name);
}

function parsePythonParams(paramString: string): { name: string; type?: string; optional: boolean }[] {
  if (!paramString.trim()) return [];
  
  const result: { name: string; type?: string; optional: boolean }[] = [];
  
  for (const p of paramString.split(',')) {
    const trimmed = p.trim();
    if (trimmed === 'self' || trimmed === 'cls' || !trimmed) continue;
    
    const optional = trimmed.includes('=');
    const [nameType] = trimmed.split('=');
    const [name, type] = (nameType ?? '').split(':').map(s => s.trim());
    
    if (name) {
      result.push({
        name,
        type: type || undefined,
        optional,
      });
    }
  }
  
  return result;
}

// ============================================================================
// AI Documentation Generation
// ============================================================================

async function generateDocsWithAI(
  code: string,
  options: {
    language: string;
    style: DocStyle;
    includeExamples: boolean;
    includeTypes: boolean;
    verbose: boolean;
    codeAnalysis: CodeAnalysis;
  }
): Promise<{ documentedCode: string; documentation: ModuleDoc }> {
  const provider = await getActiveProvider();

  const prompt = `Generate comprehensive documentation for this code.

## Code
\`\`\`${options.language}
${code}
\`\`\`

## Requirements
- Documentation style: ${options.style}
- Language: ${options.language}
- Include examples: ${options.includeExamples}
- Include types: ${options.includeTypes}
${options.verbose ? '- Generate verbose, detailed documentation' : '- Keep documentation concise'}

## Functions to Document
${options.codeAnalysis.functions.map(f => `- ${f.name}(${f.params.map(p => p.name).join(', ')})`).join('\n')}

## Output Format
{
  "documentedCode": "The complete code with documentation comments added",
  "documentation": {
    "name": "module name",
    "description": "module description",
    "exports": ["exported items"],
    "functions": [
      {
        "name": "function name",
        "description": "what it does",
        "params": [{"name": "param", "type": "type", "description": "desc", "optional": false}],
        "returns": {"type": "return type", "description": "what it returns"},
        "throws": ["error conditions"],
        "examples": ["example usage"]
      }
    ],
    "classes": [],
    "types": []
  }
}`;

  const response = await provider.completeJson<{
    documentedCode: string;
    documentation: ModuleDoc;
  }>(prompt, {
    systemPrompt: 'You are a technical writer. Generate clear, accurate documentation. Include practical examples. Return valid JSON only.',
    temperature: 0.3,
    maxTokens: 4096,
  });

  if (response.data) {
    return response.data;
  }

  throw new Error('Failed to generate documentation with AI');
}

// ============================================================================
// Heuristic Documentation Generation
// ============================================================================

function generateHeuristicDocs(
  code: string,
  language: string,
  style: DocStyle,
  analysis: CodeAnalysis
): { documentedCode: string; documentation: ModuleDoc } {
  const lines = code.split('\n');
  const documentedLines: string[] = [];
  const documentation: ModuleDoc = {
    name: analysis.moduleName ?? 'module',
    description: 'Module documentation',
    exports: [],
    functions: [],
    classes: [],
    types: [],
  };

  // Track which lines have been processed
  const processedLines = new Set<number>();

  // Add function documentation
  for (const func of analysis.functions) {
    const doc = generateFunctionDoc(func, style, language);
    documentation.functions.push(doc.functionDoc);
    
    // Insert doc comment before the function
    processedLines.add(func.lineNumber);
  }

  // Rebuild code with documentation
  let currentLine = 1;
  for (const func of analysis.functions.sort((a, b) => a.lineNumber - b.lineNumber)) {
    // Add lines before this function
    while (currentLine < func.lineNumber) {
      documentedLines.push(lines[currentLine - 1] ?? '');
      currentLine++;
    }

    // Add documentation comment
    const docComment = formatDocComment(
      generateFunctionDoc(func, style, language).comment,
      style,
      language
    );
    documentedLines.push(docComment);
    documentedLines.push(lines[currentLine - 1] ?? '');
    currentLine++;
  }

  // Add remaining lines
  while (currentLine <= lines.length) {
    documentedLines.push(lines[currentLine - 1] ?? '');
    currentLine++;
  }

  return {
    documentedCode: documentedLines.join('\n'),
    documentation,
  };
}

function generateFunctionDoc(
  func: ParsedFunction,
  style: DocStyle,
  language: string
): { comment: string; functionDoc: FunctionDoc } {
  const description = generateDescription(func.name);
  const params = func.params.map(p => ({
    name: p.name,
    type: p.type ?? 'any',
    description: `The ${p.name} parameter`,
    optional: p.optional,
  }));

  const functionDoc: FunctionDoc = {
    name: func.name,
    description,
    params,
    returns: {
      type: func.returnType ?? 'void',
      description: func.returnType ? `Returns ${func.returnType}` : 'No return value',
    },
    examples: [`${func.name}(${func.params.map(p => `/* ${p.name} */`).join(', ')})`],
  };

  let comment = '';
  if (['jsdoc', 'tsdoc'].includes(style) || language === 'typescript' || language === 'javascript') {
    comment = `/**\n * ${description}\n`;
    for (const param of params) {
      comment += ` * @param {${param.type}} ${param.optional ? '[' + param.name + ']' : param.name} - ${param.description}\n`;
    }
    comment += ` * @returns {${functionDoc.returns.type}} ${functionDoc.returns.description}\n`;
    comment += ` */`;
  } else if (style === 'pydoc' || language === 'python') {
    comment = `    """\n    ${description}\n\n    Args:\n`;
    for (const param of params) {
      comment += `        ${param.name} (${param.type}): ${param.description}\n`;
    }
    comment += `\n    Returns:\n        ${functionDoc.returns.type}: ${functionDoc.returns.description}\n    """`;
  }

  return { comment, functionDoc };
}

function generateDescription(name: string): string {
  // Convert camelCase/snake_case to readable description
  const words = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim()
    .split(' ');

  if (words[0] === 'get') {
    return `Gets the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'set') {
    return `Sets the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'is' || words[0] === 'has' || words[0] === 'can') {
    return `Checks if ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'create' || words[0] === 'build' || words[0] === 'make') {
    return `Creates a new ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'update') {
    return `Updates the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'delete' || words[0] === 'remove') {
    return `Removes the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'find' || words[0] === 'search') {
    return `Finds ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'validate' || words[0] === 'check') {
    return `Validates the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'parse') {
    return `Parses the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'format') {
    return `Formats the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'convert') {
    return `Converts ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'calculate' || words[0] === 'compute') {
    return `Calculates the ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'handle') {
    return `Handles ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'process') {
    return `Processes ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'load') {
    return `Loads ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'save') {
    return `Saves ${words.slice(1).join(' ')}.`;
  }
  if (words[0] === 'init' || words[0] === 'initialize') {
    return `Initializes ${words.slice(1).join(' ') || 'the component'}.`;
  }

  return `Performs ${words.join(' ')} operation.`;
}

function formatDocComment(comment: string, style: DocStyle, language: string): string {
  return comment;
}

// ============================================================================
// README Generation
// ============================================================================

function generateReadme(doc: ModuleDoc, language: string): string {
  let readme = `# ${doc.name}\n\n`;
  readme += `${doc.description}\n\n`;

  if (doc.functions.length > 0) {
    readme += `## Functions\n\n`;
    for (const func of doc.functions) {
      readme += `### \`${func.name}\`\n\n`;
      readme += `${func.description}\n\n`;
      
      if (func.params.length > 0) {
        readme += `**Parameters:**\n\n`;
        readme += `| Name | Type | Description |\n`;
        readme += `|------|------|-------------|\n`;
        for (const param of func.params) {
          readme += `| ${param.name} | \`${param.type}\` | ${param.description} |\n`;
        }
        readme += `\n`;
      }

      readme += `**Returns:** \`${func.returns.type}\` - ${func.returns.description}\n\n`;

      if (func.examples && func.examples.length > 0) {
        readme += `**Example:**\n\n`;
        readme += `\`\`\`${language}\n${func.examples[0]}\n\`\`\`\n\n`;
      }
    }
  }

  if (doc.classes.length > 0) {
    readme += `## Classes\n\n`;
    for (const cls of doc.classes) {
      readme += `### \`${cls.name}\`\n\n`;
      readme += `${cls.description}\n\n`;
    }
  }

  return readme;
}

// ============================================================================
// API Documentation Generation
// ============================================================================

function generateApiDocs(doc: ModuleDoc): string {
  let api = `# API Reference\n\n`;
  api += `## Module: ${doc.name}\n\n`;
  api += `${doc.description}\n\n`;

  if (doc.exports.length > 0) {
    api += `### Exports\n\n`;
    api += doc.exports.map(e => `- \`${e}\``).join('\n');
    api += `\n\n`;
  }

  if (doc.functions.length > 0) {
    api += `### Functions\n\n`;
    for (const func of doc.functions) {
      const paramTypes = func.params.map(p => `${p.name}: ${p.type}`).join(', ');
      api += `#### \`${func.name}(${paramTypes}): ${func.returns.type}\`\n\n`;
      api += `${func.description}\n\n`;
    }
  }

  return api;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectLanguage(code: string): string {
  if (code.includes('interface ') || code.includes(': string') || code.includes(': number')) {
    return 'typescript';
  }
  if (code.includes('def ') && code.includes(':') && !code.includes('function ')) {
    return 'python';
  }
  if (code.includes('func ') && code.includes('package ')) {
    return 'go';
  }
  if (code.includes('fn ') && code.includes('->')) {
    return 'rust';
  }
  return 'javascript';
}

function detectDocStyle(language: string): DocStyle {
  switch (language.toLowerCase()) {
    case 'typescript':
      return 'tsdoc';
    case 'javascript':
      return 'jsdoc';
    case 'python':
      return 'pydoc';
    case 'go':
      return 'godoc';
    case 'rust':
      return 'rustdoc';
    default:
      return 'jsdoc';
  }
}

function calculateDocStats(analysis: CodeAnalysis, doc: ModuleDoc): DocStats {
  const totalFunctions = analysis.functions.length;
  const documentedFunctions = doc.functions.length;
  const totalClasses = analysis.classes.length;
  const documentedClasses = doc.classes.length;

  const total = totalFunctions + totalClasses;
  const documented = documentedFunctions + documentedClasses;
  const coverage = total > 0 ? Math.round((documented / total) * 100) : 100;

  return {
    totalFunctions,
    documentedFunctions,
    totalClasses,
    documentedClasses,
    coverage,
  };
}
