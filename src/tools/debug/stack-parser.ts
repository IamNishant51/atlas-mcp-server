/**
 * Stack Trace Parser Module
 * Parses and analyzes stack traces from various languages
 */

export interface StackFrame {
  function: string;
  file: string;
  line: number;
  column?: number;
  isUserCode: boolean;
  isAsync: boolean;
  context?: string;
}

export interface StackTraceAnalysis {
  frames: StackFrame[];
  originatingFrame: StackFrame;
  callPath: string[];
  isAsync: boolean;
  involvedModules: string[];
}

// Regex patterns for different languages
const STACK_PATTERNS = {
  javascript: /at (?:async )?(.+?) \((.+?):(\d+):(\d+)\)/,
  node: /at (?:async )?(.+?) \((.+?):(\d+):(\d+)\)/,
  python: /File "(.+?)", line (\d+), in (.+)/,
  java: /at (.+?)\.(.+?)\((.+?):(\d+)\)/,
  csharp: /at (.+?) in (.+?):line (\d+)/,
};

/**
 * Parse stack trace into structured frames
 */
export function parseStackTrace(stackTrace: string, language: string): StackTraceAnalysis {
  const lines = stackTrace.split('\n').filter(line => line.trim());
  const frames = lines
    .map(line => parseStackFrame(line, language))
    .filter((frame): frame is StackFrame => frame !== null);

  if (frames.length === 0) {
    throw new Error('Unable to parse stack trace');
  }

  const originatingFrame = findOriginatingFrame(frames);
  const callPath = frames.map(f => f.function);
  const isAsync = frames.some(f => f.isAsync);
  const involvedModules = extractModules(frames);

  return {
    frames,
    originatingFrame,
    callPath,
    isAsync,
    involvedModules,
  };
}

/**
 * Parse individual stack frame
 */
function parseStackFrame(line: string, language: string): StackFrame | null {
  const normalizedLang = language.toLowerCase();
  const pattern = STACK_PATTERNS[normalizedLang as keyof typeof STACK_PATTERNS];

  if (!pattern) {
    return parseGenericFrame(line);
  }

  const match = line.match(pattern);
  if (!match) {
    return parseGenericFrame(line);
  }

  if (normalizedLang === 'python') {
    return {
      function: match[3] || 'unknown',
      file: match[1] || 'unknown',
      line: parseInt(match[2] || '0', 10),
      isUserCode: !isSystemFile(match[1] || ''),
      isAsync: line.includes('async'),
    };
  }

  // JavaScript/Node.js/Java/C# format
  return {
    function: match[1] || 'unknown',
    file: match[2] || 'unknown',
    line: parseInt(match[3] || '0', 10),
    column: match[4] ? parseInt(match[4], 10) : undefined,
    isUserCode: !isSystemFile(match[2] || ''),
    isAsync: line.includes('async'),
  };
}

/**
 * Parse generic frame when pattern doesn't match
 */
function parseGenericFrame(line: string): StackFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  return {
    function: trimmed,
    file: 'unknown',
    line: 0,
    isUserCode: true,
    isAsync: line.includes('async'),
  };
}

/**
 * Find the originating error frame (usually first user code)
 */
function findOriginatingFrame(frames: StackFrame[]): StackFrame {
  return frames.find(f => f.isUserCode) || frames[0]!;
}

/**
 * Extract unique modules from frames
 */
function extractModules(frames: StackFrame[]): string[] {
  const modules = frames
    .map(f => extractModuleName(f.file))
    .filter((m): m is string => m !== null);
  
  return Array.from(new Set(modules));
}

/**
 * Extract module name from file path
 */
function extractModuleName(file: string): string | null {
  if (!file || file === 'unknown') return null;
  
  const match = file.match(/node_modules\/([^/]+)/);
  return match ? (match[1] ?? null) : null;
}

/**
 * Check if file is system/library file
 */
function isSystemFile(file: string): boolean {
  const systemPatterns = [
    'node_modules',
    'node:',
    'internal/',
    '<anonymous>',
    'native',
    'dist/',
    'lib/',
  ];
  
  return systemPatterns.some(pattern => file.includes(pattern));
}
