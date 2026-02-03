/**
 * Error Classification Module
 * Classifies errors into specific types based on patterns
 */

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

// Error pattern mappings
const ERROR_PATTERNS: Record<ErrorType, string[]> = {
  syntax: ['syntaxerror', 'unexpected token', 'parsing error', 'invalid syntax'],
  type: ['typeerror', 'is not a function', 'cannot read property', 'undefined is not'],
  reference: ['referenceerror', 'is not defined', 'cannot access'],
  runtime: ['rangeerror', 'maximum call stack', 'out of bounds'],
  async: ['promise', 'async', 'await', 'timeout', 'uncaught (in promise)'],
  network: ['network', 'fetch', 'xhr', 'cors', 'http', 'econnrefused', 'timeout'],
  memory: ['memory', 'heap', 'allocation failed', 'out of memory'],
  logic: ['assertion', 'expected', 'actual'],
  configuration: ['config', 'environment', 'missing', 'not found'],
  dependency: ['module', 'import', 'require', 'cannot find'],
  permission: ['permission', 'denied', 'forbidden', 'unauthorized', 'eacces'],
  unknown: [], // Catch-all for unclassified errors
};

/**
 * Classify error based on content
 */
export function classifyError(error: string, stackTrace: string = ''): ErrorType {
  const content = `${error} ${stackTrace}`.toLowerCase();

  for (const [errorType, patterns] of Object.entries(ERROR_PATTERNS)) {
    if (patterns.some(pattern => content.includes(pattern))) {
      return errorType as ErrorType;
    }
  }

  return 'unknown';
}

/**
 * Check if error matches specific type
 */
export function isErrorType(content: string, type: ErrorType): boolean {
  const patterns = ERROR_PATTERNS[type] || [];
  const normalized = content.toLowerCase();
  return patterns.some(pattern => normalized.includes(pattern));
}
