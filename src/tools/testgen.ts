/**
 * Atlas Server - Test Generation Tool
 * 
 * Automatic test generation capabilities:
 * - Unit test generation
 * - Integration test generation
 * - Test case extraction from code
 * - Mock/stub generation
 * - Edge case identification
 * - Coverage suggestions
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types
// ============================================================================

export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'unittest' | 'go_test' | 'rspec' | 'auto';

export type TestType = 'unit' | 'integration' | 'e2e' | 'snapshot' | 'property';

export interface TestCase {
  name: string;
  description: string;
  type: TestType;
  input: string;
  expectedOutput: string;
  edgeCase: boolean;
}

export interface GeneratedTest {
  code: string;
  framework: TestFramework;
  testCases: TestCase[];
  imports: string[];
  mocks: string[];
  setupCode?: string;
  teardownCode?: string;
}

export interface TestGenerationResult {
  tests: GeneratedTest;
  coverage: CoverageSuggestion;
  recommendations: string[];
  generatedAt: string;
}

export interface CoverageSuggestion {
  estimatedCoverage: number;
  uncoveredPaths: string[];
  suggestedAdditionalTests: string[];
}

// ============================================================================
// Test Generation
// ============================================================================

/**
 * Generate tests for the given code
 */
export async function generateTests(
  code: string,
  options: {
    language?: string;
    framework?: TestFramework;
    testType?: TestType;
    functionName?: string;
    context?: string;
  } = {}
): Promise<TestGenerationResult> {
  const { language, framework = 'auto', testType = 'unit', functionName, context } = options;

  logger.debug({ language, framework, testType }, 'Starting test generation');

  // Detect language and framework if not provided
  const detectedLanguage = language ?? detectLanguage(code);
  const detectedFramework = framework === 'auto' ? detectFramework(detectedLanguage) : framework;

  // Extract function signatures and analyze code structure
  const codeAnalysis = analyzeCodeForTesting(code, detectedLanguage);

  // Generate test cases
  let testCases: TestCase[];
  let generatedCode: string;
  let mocks: string[] = [];
  let imports: string[] = [];

  if (!isNoLLMMode()) {
    try {
      const aiResult = await generateTestsWithAI(code, {
        language: detectedLanguage,
        framework: detectedFramework,
        testType,
        functionName,
        context,
        codeAnalysis,
      });
      testCases = aiResult.testCases;
      generatedCode = aiResult.code;
      mocks = aiResult.mocks;
      imports = aiResult.imports;
    } catch (error) {
      logger.warn({ error }, 'AI test generation failed, using heuristic generation');
      const heuristicResult = generateHeuristicTests(code, detectedLanguage, detectedFramework, codeAnalysis);
      testCases = heuristicResult.testCases;
      generatedCode = heuristicResult.code;
      imports = heuristicResult.imports;
    }
  } else {
    const heuristicResult = generateHeuristicTests(code, detectedLanguage, detectedFramework, codeAnalysis);
    testCases = heuristicResult.testCases;
    generatedCode = heuristicResult.code;
    imports = heuristicResult.imports;
  }

  // Generate coverage suggestions
  const coverage = generateCoverageSuggestions(code, testCases, codeAnalysis);

  // Generate recommendations
  const recommendations = generateTestRecommendations(testCases, coverage, detectedFramework);

  return {
    tests: {
      code: generatedCode,
      framework: detectedFramework,
      testCases,
      imports,
      mocks,
    },
    coverage,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Code Analysis
// ============================================================================

interface CodeAnalysis {
  functions: FunctionSignature[];
  classes: string[];
  exports: string[];
  dependencies: string[];
  hasAsync: boolean;
  hasCallbacks: boolean;
}

interface FunctionSignature {
  name: string;
  params: string[];
  returnType?: string;
  isAsync: boolean;
  isExported: boolean;
}

function analyzeCodeForTesting(code: string, language: string): CodeAnalysis {
  const analysis: CodeAnalysis = {
    functions: [],
    classes: [],
    exports: [],
    dependencies: [],
    hasAsync: false,
    hasCallbacks: false,
  };

  // Detect functions based on language
  if (['typescript', 'javascript'].includes(language.toLowerCase())) {
    // Function declarations
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
      analysis.functions.push({
        name: match[1]!,
        params: match[2] ? match[2].split(',').map(p => p.trim()) : [],
        returnType: match[3]?.trim(),
        isAsync: code.slice(Math.max(0, match.index - 10), match.index).includes('async'),
        isExported: code.slice(Math.max(0, match.index - 10), match.index).includes('export'),
      });
    }

    // Arrow functions
    const arrowRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g;
    while ((match = arrowRegex.exec(code)) !== null) {
      const funcStart = match.index;
      const isAsync = code.slice(funcStart, funcStart + 50).includes('async');
      analysis.functions.push({
        name: match[1]!,
        params: [],
        isAsync,
        isExported: code.slice(Math.max(0, funcStart - 10), funcStart).includes('export'),
      });
    }

    // Classes
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    while ((match = classRegex.exec(code)) !== null) {
      analysis.classes.push(match[1]!);
    }

    // Check for async/callbacks
    analysis.hasAsync = /async\s+|await\s+|\.then\s*\(|Promise/g.test(code);
    analysis.hasCallbacks = /callback|cb\s*\(|done\s*\(/g.test(code);

    // Dependencies (imports)
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(code)) !== null) {
      analysis.dependencies.push(match[1]!);
    }
  } else if (language.toLowerCase() === 'python') {
    // Python function detection
    const pyFuncRegex = /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/g;
    let match;
    while ((match = pyFuncRegex.exec(code)) !== null) {
      analysis.functions.push({
        name: match[1]!,
        params: match[2] ? match[2].split(',').map(p => p.trim().split(':')[0]!.trim()) : [],
        isAsync: code.slice(Math.max(0, match.index - 10), match.index).includes('async'),
        isExported: true, // Python doesn't have explicit exports
      });
    }

    // Python classes
    const pyClassRegex = /class\s+(\w+)/g;
    while ((match = pyClassRegex.exec(code)) !== null) {
      analysis.classes.push(match[1]!);
    }

    analysis.hasAsync = /async\s+def|await\s+/g.test(code);
  }

  return analysis;
}

// ============================================================================
// AI Test Generation
// ============================================================================

async function generateTestsWithAI(
  code: string,
  options: {
    language: string;
    framework: TestFramework;
    testType: TestType;
    functionName?: string;
    context?: string;
    codeAnalysis: CodeAnalysis;
  }
): Promise<{ code: string; testCases: TestCase[]; mocks: string[]; imports: string[] }> {
  const provider = await getActiveProvider();

  const prompt = `Generate comprehensive ${options.testType} tests for this code.

## Code to Test
\`\`\`${options.language}
${code}
\`\`\`

## Requirements
- Framework: ${options.framework}
- Language: ${options.language}
- Test Type: ${options.testType}
${options.functionName ? `- Focus on function: ${options.functionName}` : ''}
${options.context ? `- Context: ${options.context}` : ''}

## Functions Found
${options.codeAnalysis.functions.map(f => `- ${f.name}(${f.params.join(', ')})`).join('\n')}

## Generate Tests That Cover:
1. Happy path scenarios
2. Edge cases (null, undefined, empty, boundary values)
3. Error handling
4. Async behavior (if applicable)

## Output Format
{
  "code": "Complete test file code",
  "testCases": [
    {
      "name": "test name",
      "description": "what it tests",
      "type": "unit|integration|e2e",
      "input": "input description",
      "expectedOutput": "expected output",
      "edgeCase": true/false
    }
  ],
  "mocks": ["mock descriptions"],
  "imports": ["required imports"]
}`;

  const response = await provider.completeJson<{
    code: string;
    testCases: TestCase[];
    mocks: string[];
    imports: string[];
  }>(prompt, {
    systemPrompt: 'You are an expert test engineer. Generate comprehensive, well-structured tests with good coverage. Return valid JSON only.',
    temperature: 0.3,
    maxTokens: 4096,
  });

  if (response.data) {
    return response.data;
  }

  throw new Error('Failed to generate tests with AI');
}

// ============================================================================
// Heuristic Test Generation
// ============================================================================

function generateHeuristicTests(
  code: string,
  language: string,
  framework: TestFramework,
  analysis: CodeAnalysis
): { code: string; testCases: TestCase[]; imports: string[] } {
  const testCases: TestCase[] = [];
  const imports: string[] = [];
  let testCode = '';

  if (['typescript', 'javascript'].includes(language.toLowerCase())) {
    // Generate Jest/Vitest style tests
    const isVitest = framework === 'vitest';
    
    imports.push(
      isVitest
        ? `import { describe, it, expect, beforeEach, afterEach } from 'vitest';`
        : `import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';`
    );

    testCode = `${imports.join('\n')}
// Import the module to test
// import { ${analysis.functions.map(f => f.name).join(', ')} } from './module';

`;

    for (const func of analysis.functions) {
      testCode += `describe('${func.name}', () => {\n`;

      // Happy path test
      testCode += `  it('should work correctly with valid input', ${func.isAsync ? 'async ' : ''}() => {\n`;
      testCode += `    // Arrange\n`;
      testCode += `    const input = ${generateSampleInput(func.params)};\n`;
      testCode += `    \n`;
      testCode += `    // Act\n`;
      testCode += `    const result = ${func.isAsync ? 'await ' : ''}${func.name}(${func.params.length > 0 ? 'input' : ''});\n`;
      testCode += `    \n`;
      testCode += `    // Assert\n`;
      testCode += `    expect(result).toBeDefined();\n`;
      testCode += `  });\n\n`;

      testCases.push({
        name: `${func.name} - happy path`,
        description: 'Tests basic functionality with valid input',
        type: 'unit',
        input: 'valid input',
        expectedOutput: 'expected result',
        edgeCase: false,
      });

      // Edge case: empty input
      if (func.params.length > 0) {
        testCode += `  it('should handle empty/null input gracefully', ${func.isAsync ? 'async ' : ''}() => {\n`;
        testCode += `    // Test with null/undefined/empty values\n`;
        testCode += `    expect(() => ${func.name}(null)).toThrow();\n`;
        testCode += `  });\n\n`;

        testCases.push({
          name: `${func.name} - null input`,
          description: 'Tests behavior with null/undefined input',
          type: 'unit',
          input: 'null/undefined',
          expectedOutput: 'should throw or handle gracefully',
          edgeCase: true,
        });
      }

      // Error handling test
      testCode += `  it('should handle errors correctly', ${func.isAsync ? 'async ' : ''}() => {\n`;
      testCode += `    // Test error scenarios\n`;
      testCode += `    // Add specific error test cases here\n`;
      testCode += `  });\n`;

      testCases.push({
        name: `${func.name} - error handling`,
        description: 'Tests error handling behavior',
        type: 'unit',
        input: 'invalid input',
        expectedOutput: 'error or error message',
        edgeCase: true,
      });

      testCode += `});\n\n`;
    }
  } else if (language.toLowerCase() === 'python') {
    // Generate pytest style tests
    imports.push('import pytest');

    testCode = `${imports.join('\n')}
# Import the module to test
# from module import ${analysis.functions.map(f => f.name).join(', ')}

`;

    for (const func of analysis.functions) {
      testCode += `class Test${capitalize(func.name)}:\n`;

      // Happy path
      testCode += `    def test_${func.name}_with_valid_input(self):\n`;
      testCode += `        """Test ${func.name} with valid input."""\n`;
      testCode += `        # Arrange\n`;
      testCode += `        # input_data = ...\n`;
      testCode += `        \n`;
      testCode += `        # Act\n`;
      testCode += `        # result = ${func.name}(input_data)\n`;
      testCode += `        \n`;
      testCode += `        # Assert\n`;
      testCode += `        # assert result is not None\n`;
      testCode += `        pass\n\n`;

      testCases.push({
        name: `test_${func.name}_with_valid_input`,
        description: 'Tests basic functionality with valid input',
        type: 'unit',
        input: 'valid input',
        expectedOutput: 'expected result',
        edgeCase: false,
      });

      // Edge case
      testCode += `    def test_${func.name}_with_none_input(self):\n`;
      testCode += `        """Test ${func.name} with None input."""\n`;
      testCode += `        with pytest.raises((TypeError, ValueError)):\n`;
      testCode += `            ${func.name}(None)\n\n`;

      testCases.push({
        name: `test_${func.name}_with_none_input`,
        description: 'Tests behavior with None input',
        type: 'unit',
        input: 'None',
        expectedOutput: 'raises exception',
        edgeCase: true,
      });
    }
  } else {
    // Generic test template
    testCode = `// Test file for ${language}\n// Add your test cases here\n`;
  }

  return { code: testCode, testCases, imports };
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectLanguage(code: string): string {
  if (code.includes('interface ') || code.includes(': string') || code.includes(': number')) {
    return 'typescript';
  }
  if (code.includes('function ') || code.includes('=>') || code.includes('const ')) {
    return 'javascript';
  }
  if (code.includes('def ') && code.includes(':')) {
    return 'python';
  }
  if (code.includes('func ') && code.includes('package ')) {
    return 'go';
  }
  return 'javascript';
}

function detectFramework(language: string): TestFramework {
  switch (language.toLowerCase()) {
    case 'typescript':
    case 'javascript':
      return 'vitest';
    case 'python':
      return 'pytest';
    case 'go':
      return 'go_test';
    case 'ruby':
      return 'rspec';
    default:
      return 'jest';
  }
}

function generateSampleInput(params: string[]): string {
  if (params.length === 0) return '{}';
  if (params.length === 1) return `'test-value'`;
  return `{ ${params.map(p => `${p.split(':')[0]!.trim()}: 'value'`).join(', ')} }`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateCoverageSuggestions(
  code: string,
  testCases: TestCase[],
  analysis: CodeAnalysis
): CoverageSuggestion {
  const totalFunctions = analysis.functions.length;
  const testedFunctions = new Set(testCases.map(tc => tc.name.split(' ')[0])).size;
  const estimatedCoverage = totalFunctions > 0 
    ? Math.round((testedFunctions / totalFunctions) * 70) // Assume 70% max from generated tests
    : 50;

  const uncoveredPaths: string[] = [];
  const suggestedAdditionalTests: string[] = [];

  // Check for untested scenarios
  if (analysis.hasAsync && !testCases.some(tc => tc.description.includes('async'))) {
    suggestedAdditionalTests.push('Add tests for async error handling and timeout scenarios');
  }

  if (analysis.hasCallbacks && !testCases.some(tc => tc.description.includes('callback'))) {
    suggestedAdditionalTests.push('Add tests for callback error scenarios');
  }

  // Suggest edge cases
  suggestedAdditionalTests.push('Add boundary value tests (min/max values)');
  suggestedAdditionalTests.push('Add performance/load tests for critical paths');
  suggestedAdditionalTests.push('Add integration tests with external dependencies');

  return {
    estimatedCoverage,
    uncoveredPaths,
    suggestedAdditionalTests,
  };
}

function generateTestRecommendations(
  testCases: TestCase[],
  coverage: CoverageSuggestion,
  framework: TestFramework
): string[] {
  const recommendations: string[] = [];

  // Coverage recommendations
  if (coverage.estimatedCoverage < 80) {
    recommendations.push(`Aim for at least 80% code coverage (currently estimated at ${coverage.estimatedCoverage}%)`);
  }

  // Edge case recommendations
  const edgeCaseCount = testCases.filter(tc => tc.edgeCase).length;
  if (edgeCaseCount < 3) {
    recommendations.push('Add more edge case tests (boundary values, null checks, error scenarios)');
  }

  // Framework-specific recommendations
  if (framework === 'jest' || framework === 'vitest') {
    recommendations.push('Consider using snapshot testing for UI components');
    recommendations.push('Use beforeEach/afterEach for proper test isolation');
  }

  // General recommendations
  recommendations.push('Run tests with coverage reporting enabled');
  recommendations.push('Add CI/CD integration to run tests on every commit');

  return recommendations;
}
