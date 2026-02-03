/**
 * Atlas Server - Debugging Assistance Tool
 * 
 * Intelligent debugging capabilities:
 * - Error analysis and root cause detection
 * - Stack trace parsing and explanation
 * - Fix suggestions with code examples
 * - Memory leak detection hints
 * - Performance bottleneck identification
 * - Common anti-pattern detection
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types
// ============================================================================

export interface DebugRequest {
  error?: string;
  stackTrace?: string;
  code?: string;
  context?: string;
  language?: string;
  framework?: string;
}

export interface DebugAnalysis {
  summary: string;
  rootCause: RootCause;
  stackAnalysis?: StackTraceAnalysis;
  fixes: FixSuggestion[];
  relatedIssues: RelatedIssue[];
  preventionTips: string[];
  resources: Resource[];
  confidence: number;
}

export interface RootCause {
  type: ErrorType;
  description: string;
  location?: CodeLocation;
  explanation: string;
  commonScenarios: string[];
}

export type ErrorType = 
  | 'syntax'
  | 'type'
  | 'reference'
  | 'runtime'
  | 'async'
  | 'network'
  | 'memory'
  | 'logic'
  | 'configuration'
  | 'dependency'
  | 'permission'
  | 'unknown';

export interface CodeLocation {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
}

export interface StackTraceAnalysis {
  frames: StackFrame[];
  originatingFrame: StackFrame;
  callPath: string[];
  isAsync: boolean;
  involvedModules: string[];
}

export interface StackFrame {
  function: string;
  file: string;
  line: number;
  column?: number;
  isUserCode: boolean;
  isAsync: boolean;
  context?: string;
}

export interface FixSuggestion {
  title: string;
  description: string;
  code?: CodeFix;
  steps: string[];
  confidence: number;
  tradeoffs?: string;
}

export interface CodeFix {
  before: string;
  after: string;
  language: string;
  explanation: string;
}

export interface RelatedIssue {
  title: string;
  description: string;
  likelihood: 'high' | 'medium' | 'low';
  symptoms: string[];
}

export interface Resource {
  title: string;
  url?: string;
  type: 'documentation' | 'stackoverflow' | 'article' | 'github';
  relevance: number;
}

export interface DebugResult {
  analysis: DebugAnalysis;
  metadata: {
    language: string;
    framework?: string;
    errorType: ErrorType;
    hasStackTrace: boolean;
    hasCode: boolean;
  };
  generatedAt: string;
}

// ============================================================================
// Main Debug Function
// ============================================================================

/**
 * Analyze an error and provide debugging assistance
 */
export async function analyzeError(request: DebugRequest): Promise<DebugResult> {
  const { error, stackTrace, code, context, language, framework } = request;

  logger.debug({ errorPreview: error?.substring(0, 100) }, 'Starting debug analysis');

  if (!error && !stackTrace) {
    throw new Error('Either error message or stack trace is required');
  }

  // Detect language
  const detectedLanguage = language ?? detectLanguage(code ?? stackTrace ?? '');
  const detectedFramework = framework ?? detectFramework(code ?? stackTrace ?? '');

  // Parse stack trace if present
  const stackAnalysis = stackTrace ? parseStackTrace(stackTrace, detectedLanguage) : undefined;

  // Classify error type
  const errorType = classifyError(error ?? '', stackTrace ?? '');

  // Generate analysis
  let analysis: DebugAnalysis;

  if (!isNoLLMMode()) {
    try {
      analysis = await analyzeWithAI({
        error,
        stackTrace,
        code,
        context,
        language: detectedLanguage,
        framework: detectedFramework,
        stackAnalysis,
        errorType,
      });
    } catch (err) {
      logger.warn({ err }, 'AI analysis failed, using heuristic analysis');
      analysis = generateHeuristicAnalysis(error ?? '', stackTrace, code, detectedLanguage, errorType, stackAnalysis);
    }
  } else {
    analysis = generateHeuristicAnalysis(error ?? '', stackTrace, code, detectedLanguage, errorType, stackAnalysis);
  }

  return {
    analysis,
    metadata: {
      language: detectedLanguage,
      framework: detectedFramework,
      errorType,
      hasStackTrace: !!stackTrace,
      hasCode: !!code,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Error Classification
// ============================================================================

function classifyError(error: string, stackTrace: string): ErrorType {
  const combined = `${error} ${stackTrace}`.toLowerCase();

  // Syntax errors
  if (combined.includes('syntaxerror') || combined.includes('unexpected token') || 
      combined.includes('parsing error') || combined.includes('invalid syntax')) {
    return 'syntax';
  }

  // Type errors
  if (combined.includes('typeerror') || combined.includes('cannot read property') ||
      combined.includes('is not a function') || combined.includes('undefined is not') ||
      combined.includes("'undefined' is not") || combined.includes('type error')) {
    return 'type';
  }

  // Reference errors
  if (combined.includes('referenceerror') || combined.includes('is not defined') ||
      combined.includes('cannot find name') || combined.includes('undeclared')) {
    return 'reference';
  }

  // Async errors
  if (combined.includes('unhandled promise') || combined.includes('async') ||
      combined.includes('await') || combined.includes('promise rejected')) {
    return 'async';
  }

  // Network errors
  if (combined.includes('network') || combined.includes('fetch') || 
      combined.includes('econnrefused') || combined.includes('timeout') ||
      combined.includes('cors') || combined.includes('http')) {
    return 'network';
  }

  // Memory errors
  if (combined.includes('heap') || combined.includes('memory') || 
      combined.includes('out of memory') || combined.includes('stack overflow')) {
    return 'memory';
  }

  // Configuration errors
  if (combined.includes('config') || combined.includes('environment') ||
      combined.includes('env') || combined.includes('setting')) {
    return 'configuration';
  }

  // Dependency errors
  if (combined.includes('module not found') || combined.includes('cannot find module') ||
      combined.includes('no such file') || combined.includes('import') && combined.includes('failed')) {
    return 'dependency';
  }

  // Permission errors
  if (combined.includes('permission') || combined.includes('access denied') ||
      combined.includes('unauthorized') || combined.includes('forbidden')) {
    return 'permission';
  }

  // Runtime (general)
  if (combined.includes('error') || combined.includes('exception')) {
    return 'runtime';
  }

  return 'unknown';
}

// ============================================================================
// Stack Trace Parsing
// ============================================================================

function parseStackTrace(stackTrace: string, language: string): StackTraceAnalysis {
  const lines = stackTrace.split('\n').filter(l => l.trim());
  const frames: StackFrame[] = [];
  
  if (['javascript', 'typescript', 'node'].includes(language.toLowerCase())) {
    // JavaScript/Node.js stack trace format
    const frameRegex = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/;
    
    for (const line of lines) {
      const match = frameRegex.exec(line);
      if (match) {
        const filePath = match[2] ?? '';
        frames.push({
          function: match[1] ?? '<anonymous>',
          file: filePath,
          line: parseInt(match[3] ?? '0', 10),
          column: parseInt(match[4] ?? '0', 10),
          isUserCode: !filePath.includes('node_modules') && !filePath.includes('internal/'),
          isAsync: line.includes('async') || line.includes('Promise'),
        });
      }
    }
  } else if (language.toLowerCase() === 'python') {
    // Python traceback format
    const frameRegex = /File\s+"(.+?)",\s+line\s+(\d+),\s+in\s+(.+)/;
    
    for (const line of lines) {
      const match = frameRegex.exec(line);
      if (match) {
        frames.push({
          function: match[3] ?? '<module>',
          file: match[1] ?? '',
          line: parseInt(match[2] ?? '0', 10),
          isUserCode: !match[1]?.includes('site-packages'),
          isAsync: match[3]?.includes('async') ?? false,
        });
      }
    }
  }

  // Find originating frame (first user code frame)
  const originatingFrame = frames.find(f => f.isUserCode) ?? frames[0] ?? {
    function: 'unknown',
    file: 'unknown',
    line: 0,
    isUserCode: false,
    isAsync: false,
  };

  // Build call path
  const callPath = frames.map(f => f.function).filter(f => f !== '<anonymous>');

  // Find involved modules
  const involvedModules = [...new Set(frames
    .map(f => {
      const match = f.file.match(/node_modules\/([^/]+)/);
      return match ? match[1] : null;
    })
    .filter((m): m is string => m !== null)
  )];

  return {
    frames,
    originatingFrame,
    callPath,
    isAsync: frames.some(f => f.isAsync),
    involvedModules,
  };
}

// ============================================================================
// AI Analysis
// ============================================================================

async function analyzeWithAI(params: {
  error?: string;
  stackTrace?: string;
  code?: string;
  context?: string;
  language: string;
  framework?: string;
  stackAnalysis?: StackTraceAnalysis;
  errorType: ErrorType;
}): Promise<DebugAnalysis> {
  const provider = await getActiveProvider();

  const prompt = `Analyze this programming error and provide debugging assistance.

## Error Information
**Error Message:** ${params.error ?? 'Not provided'}
**Error Type:** ${params.errorType}
**Language:** ${params.language}
${params.framework ? `**Framework:** ${params.framework}` : ''}

${params.stackTrace ? `## Stack Trace
\`\`\`
${params.stackTrace}
\`\`\`` : ''}

${params.code ? `## Related Code
\`\`\`${params.language}
${params.code}
\`\`\`` : ''}

${params.context ? `## Additional Context
${params.context}` : ''}

${params.stackAnalysis ? `## Stack Analysis
- Originating frame: ${params.stackAnalysis.originatingFrame.function} at ${params.stackAnalysis.originatingFrame.file}:${params.stackAnalysis.originatingFrame.line}
- Call path: ${params.stackAnalysis.callPath.join(' → ')}
- Is async: ${params.stackAnalysis.isAsync}
- Involved modules: ${params.stackAnalysis.involvedModules.join(', ') || 'none'}` : ''}

## Output Format
Provide your analysis as JSON:
{
  "summary": "One-line summary of the issue",
  "rootCause": {
    "type": "${params.errorType}",
    "description": "What caused this error",
    "location": {"file": "filename", "line": 123, "function": "funcName"},
    "explanation": "Detailed explanation of why this error occurred",
    "commonScenarios": ["scenario 1", "scenario 2"]
  },
  "fixes": [
    {
      "title": "Fix title",
      "description": "How this fixes the issue",
      "code": {
        "before": "buggy code",
        "after": "fixed code",
        "language": "${params.language}",
        "explanation": "What changed and why"
      },
      "steps": ["step 1", "step 2"],
      "confidence": 0.9,
      "tradeoffs": "Any drawbacks to this approach"
    }
  ],
  "relatedIssues": [
    {
      "title": "Related issue",
      "description": "Description",
      "likelihood": "high|medium|low",
      "symptoms": ["symptom 1"]
    }
  ],
  "preventionTips": ["Tip 1", "Tip 2"],
  "resources": [
    {"title": "Resource", "url": "https://...", "type": "documentation", "relevance": 0.9}
  ],
  "confidence": 0.85
}`;

  const response = await provider.completeJson<DebugAnalysis>(prompt, {
    systemPrompt: 'You are an expert debugger and software engineer. Analyze errors thoroughly and provide actionable fix suggestions. Return valid JSON only.',
    temperature: 0.3,
    maxTokens: 4096,
  });

  if (response.data) {
    return response.data;
  }

  throw new Error('Failed to generate AI analysis');
}

// ============================================================================
// Heuristic Analysis
// ============================================================================

function generateHeuristicAnalysis(
  error: string,
  stackTrace: string | undefined,
  code: string | undefined,
  language: string,
  errorType: ErrorType,
  stackAnalysis: StackTraceAnalysis | undefined
): DebugAnalysis {
  // Get error-specific analysis
  const errorInfo = getErrorTypeInfo(errorType, error, language);

  return {
    summary: `${errorType.charAt(0).toUpperCase() + errorType.slice(1)} error: ${error.split('\n')[0]?.substring(0, 100)}`,
    rootCause: {
      type: errorType,
      description: errorInfo.description,
      location: stackAnalysis?.originatingFrame ? {
        file: stackAnalysis.originatingFrame.file,
        line: stackAnalysis.originatingFrame.line,
        function: stackAnalysis.originatingFrame.function,
      } : undefined,
      explanation: errorInfo.explanation,
      commonScenarios: errorInfo.scenarios,
    },
    stackAnalysis,
    fixes: errorInfo.fixes,
    relatedIssues: errorInfo.relatedIssues,
    preventionTips: errorInfo.preventionTips,
    resources: errorInfo.resources,
    confidence: 0.6,
  };
}

interface ErrorInfo {
  description: string;
  explanation: string;
  scenarios: string[];
  fixes: FixSuggestion[];
  relatedIssues: RelatedIssue[];
  preventionTips: string[];
  resources: Resource[];
}

function getErrorTypeInfo(errorType: ErrorType, error: string, language: string): ErrorInfo {
  const errorLower = error.toLowerCase();

  switch (errorType) {
    case 'type':
      return {
        description: 'A type-related operation failed, such as calling a method on undefined or using the wrong data type.',
        explanation: 'This typically occurs when a variable has an unexpected value (null, undefined) or when trying to use a value as the wrong type (e.g., calling a function on a number).',
        scenarios: [
          'Accessing a property on undefined or null',
          'Calling a function that doesn\'t exist on an object',
          'Array index out of bounds',
          'Wrong data type passed to a function',
        ],
        fixes: [
          {
            title: 'Add null/undefined check',
            description: 'Check if the value exists before using it',
            code: {
              before: 'obj.property.method()',
              after: 'obj?.property?.method?.()',
              language,
              explanation: 'Optional chaining (?.) safely handles undefined values',
            },
            steps: [
              'Identify the variable that might be undefined',
              'Add optional chaining (?.) or nullish checks',
              'Consider providing default values',
            ],
            confidence: 0.8,
          },
          {
            title: 'Add type validation',
            description: 'Validate types before operations',
            steps: [
              'Check typeof before operations',
              'Use TypeScript for compile-time checks',
              'Add runtime type guards',
            ],
            confidence: 0.7,
          },
        ],
        relatedIssues: [
          {
            title: 'Async timing issue',
            description: 'Data might not be loaded when accessed',
            likelihood: 'medium',
            symptoms: ['Works sometimes', 'Works after refresh', 'Console logs show data later'],
          },
        ],
        preventionTips: [
          'Use TypeScript for better type safety',
          'Initialize variables with default values',
          'Add defensive null checks in critical paths',
          'Use optional chaining (?.) and nullish coalescing (??)',
        ],
        resources: [
          { title: 'Optional Chaining', type: 'documentation', relevance: 0.9 },
          { title: 'TypeScript Null Checking', type: 'documentation', relevance: 0.8 },
        ],
      };

    case 'reference':
      return {
        description: 'A variable or function was used before it was defined or is not in scope.',
        explanation: 'This happens when code tries to access something that doesn\'t exist in the current scope, often due to typos, missing imports, or scope issues.',
        scenarios: [
          'Typo in variable or function name',
          'Missing import statement',
          'Variable used before declaration',
          'Out-of-scope variable access',
        ],
        fixes: [
          {
            title: 'Check for typos',
            description: 'Verify the variable/function name is spelled correctly',
            steps: [
              'Compare the name with where it\'s defined',
              'Check for case sensitivity issues',
              'Look for similar-looking characters',
            ],
            confidence: 0.9,
          },
          {
            title: 'Add missing import',
            description: 'Import the module that defines this',
            steps: [
              'Identify which module exports this',
              'Add the import statement at the top',
              'Check if the export name matches',
            ],
            confidence: 0.8,
          },
        ],
        relatedIssues: [
          {
            title: 'Circular dependency',
            description: 'Modules importing each other can cause undefined exports',
            likelihood: 'low',
            symptoms: ['Works in isolation', 'Import is undefined at runtime'],
          },
        ],
        preventionTips: [
          'Use an IDE with autocomplete',
          'Enable strict mode in TypeScript',
          'Use ESLint with no-undef rule',
          'Keep imports organized and explicit',
        ],
        resources: [
          { title: 'JavaScript Scope', type: 'documentation', relevance: 0.9 },
          { title: 'ES6 Modules', type: 'documentation', relevance: 0.8 },
        ],
      };

    case 'async':
      return {
        description: 'An asynchronous operation failed or was not handled properly.',
        explanation: 'Async errors occur when Promises reject without proper error handling, or when async/await is used incorrectly.',
        scenarios: [
          'Missing await keyword',
          'Unhandled Promise rejection',
          'Network request failed',
          'Timeout exceeded',
        ],
        fixes: [
          {
            title: 'Add try/catch around async operations',
            description: 'Wrap async code in error handling',
            code: {
              before: 'const data = await fetchData();',
              after: `try {
  const data = await fetchData();
} catch (error) {
  console.error('Failed to fetch:', error);
}`,
              language,
              explanation: 'try/catch handles Promise rejections in async functions',
            },
            steps: [
              'Identify the async operation',
              'Wrap in try/catch block',
              'Add appropriate error handling',
            ],
            confidence: 0.85,
          },
          {
            title: 'Add missing await',
            description: 'Ensure async functions are properly awaited',
            steps: [
              'Check if function returns a Promise',
              'Add await before the call',
              'Make parent function async if needed',
            ],
            confidence: 0.75,
          },
        ],
        relatedIssues: [
          {
            title: 'Race condition',
            description: 'Multiple async operations completing in unexpected order',
            likelihood: 'medium',
            symptoms: ['Inconsistent behavior', 'Works on retry'],
          },
        ],
        preventionTips: [
          'Always use try/catch with async/await',
          'Add .catch() to all Promises',
          'Use Promise.all for parallel operations',
          'Set appropriate timeouts',
        ],
        resources: [
          { title: 'Async/Await Best Practices', type: 'documentation', relevance: 0.9 },
          { title: 'Promise Error Handling', type: 'documentation', relevance: 0.85 },
        ],
      };

    case 'network':
      return {
        description: 'A network-related operation failed.',
        explanation: 'Network errors can occur due to connectivity issues, server errors, CORS restrictions, or timeout.',
        scenarios: [
          'Server is unreachable',
          'CORS policy blocking request',
          'Request timeout',
          'Invalid URL or endpoint',
        ],
        fixes: [
          {
            title: 'Add retry logic',
            description: 'Retry failed requests with backoff',
            steps: [
              'Wrap request in retry function',
              'Add exponential backoff',
              'Set maximum retry count',
            ],
            confidence: 0.7,
          },
          {
            title: 'Check CORS configuration',
            description: 'Ensure server allows the request origin',
            steps: [
              'Check browser console for CORS error',
              'Verify server CORS headers',
              'Use a proxy in development',
            ],
            confidence: 0.65,
          },
        ],
        relatedIssues: [
          {
            title: 'SSL/TLS certificate issue',
            description: 'Certificate validation failing',
            likelihood: 'low',
            symptoms: ['Works on some machines', 'Works without HTTPS'],
          },
        ],
        preventionTips: [
          'Always handle network errors gracefully',
          'Implement request timeouts',
          'Add loading and error states to UI',
          'Use proper error boundaries',
        ],
        resources: [
          { title: 'Fetch API Error Handling', type: 'documentation', relevance: 0.9 },
          { title: 'CORS Explained', type: 'article', relevance: 0.8 },
        ],
      };

    case 'dependency':
      return {
        description: 'A required module or package could not be found.',
        explanation: 'This happens when an import references a module that isn\'t installed, has a wrong path, or has version conflicts.',
        scenarios: [
          'Package not installed',
          'Wrong import path',
          'Version mismatch',
          'Typo in package name',
        ],
        fixes: [
          {
            title: 'Install missing package',
            description: 'Add the required dependency',
            code: {
              before: '// Package not found error',
              after: 'npm install <package-name>',
              language: 'bash',
              explanation: 'Install the missing package with npm or yarn',
            },
            steps: [
              'Identify the package name from the error',
              'Run npm install or yarn add',
              'Restart the development server',
            ],
            confidence: 0.9,
          },
          {
            title: 'Fix import path',
            description: 'Correct the relative or absolute import path',
            steps: [
              'Check the actual file location',
              'Verify the path is relative to current file',
              'Check for index.js conventions',
            ],
            confidence: 0.8,
          },
        ],
        relatedIssues: [
          {
            title: 'Peer dependency conflict',
            description: 'Package requires a different version of another package',
            likelihood: 'medium',
            symptoms: ['npm install warnings', 'Works after --force'],
          },
        ],
        preventionTips: [
          'Keep package.json in sync',
          'Use a lock file (package-lock.json)',
          'Run npm ci in CI/CD',
          'Regularly update dependencies',
        ],
        resources: [
          { title: 'npm install documentation', type: 'documentation', relevance: 0.9 },
          { title: 'Node.js module resolution', type: 'documentation', relevance: 0.8 },
        ],
      };

    case 'memory':
      return {
        description: 'A memory-related error occurred, potentially a leak or overflow.',
        explanation: 'Memory errors happen when the application uses too much memory, has a leak, or causes stack overflow through deep recursion.',
        scenarios: [
          'Infinite loop creating objects',
          'Event listeners not cleaned up',
          'Recursive function without base case',
          'Large data structures in memory',
        ],
        fixes: [
          {
            title: 'Add recursion base case',
            description: 'Ensure recursive functions have exit conditions',
            steps: [
              'Identify the recursive function',
              'Add or fix the base case condition',
              'Consider converting to iteration',
            ],
            confidence: 0.8,
          },
          {
            title: 'Clean up event listeners',
            description: 'Remove listeners when components unmount',
            steps: [
              'Track all added listeners',
              'Remove in cleanup/unmount',
              'Use WeakMap for object references',
            ],
            confidence: 0.75,
          },
        ],
        relatedIssues: [
          {
            title: 'Closure retaining references',
            description: 'Closures holding onto large objects',
            likelihood: 'medium',
            symptoms: ['Memory grows over time', 'GC not collecting'],
          },
        ],
        preventionTips: [
          'Use heap profiling tools',
          'Implement proper cleanup',
          'Avoid global variables',
          'Use streaming for large data',
        ],
        resources: [
          { title: 'Memory Management in JavaScript', type: 'documentation', relevance: 0.9 },
          { title: 'Chrome DevTools Memory', type: 'documentation', relevance: 0.85 },
        ],
      };

    default:
      return {
        description: 'An error occurred during code execution.',
        explanation: 'This error needs further investigation to determine the root cause.',
        scenarios: [
          'Logic error in code',
          'Unexpected input data',
          'Environment-specific issue',
          'Third-party library bug',
        ],
        fixes: [
          {
            title: 'Add logging for debugging',
            description: 'Add console logs to trace the issue',
            steps: [
              'Add logs before and after the failing line',
              'Log variable values',
              'Check the execution path',
            ],
            confidence: 0.6,
          },
          {
            title: 'Isolate the problem',
            description: 'Create a minimal reproduction',
            steps: [
              'Create a simple test case',
              'Remove unrelated code',
              'Test in isolation',
            ],
            confidence: 0.5,
          },
        ],
        relatedIssues: [],
        preventionTips: [
          'Write unit tests for critical paths',
          'Use error monitoring in production',
          'Add comprehensive logging',
          'Document known issues',
        ],
        resources: [
          { title: 'Debugging Techniques', type: 'documentation', relevance: 0.7 },
          { title: 'Error Handling Best Practices', type: 'article', relevance: 0.6 },
        ],
      };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectLanguage(content: string): string {
  if (content.includes('at ') && content.includes('.js:')) return 'javascript';
  if (content.includes('at ') && content.includes('.ts:')) return 'typescript';
  if (content.includes('File "') && content.includes('.py"')) return 'python';
  if (content.includes('.go:')) return 'go';
  if (content.includes('.java:')) return 'java';
  return 'javascript';
}

function detectFramework(content: string): string | undefined {
  if (content.includes('React') || content.includes('useState') || content.includes('useEffect')) return 'React';
  if (content.includes('angular') || content.includes('@Component')) return 'Angular';
  if (content.includes('Vue') || content.includes('createApp')) return 'Vue';
  if (content.includes('next') || content.includes('getServerSideProps')) return 'Next.js';
  if (content.includes('express') || content.includes('app.get')) return 'Express';
  if (content.includes('fastify')) return 'Fastify';
  if (content.includes('django') || content.includes('views.py')) return 'Django';
  if (content.includes('flask') || content.includes('@app.route')) return 'Flask';
  return undefined;
}
