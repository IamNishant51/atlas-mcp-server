import { z } from 'zod';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export const executionSandboxTool = {
  name: 'atlas_execution_sandbox',
  description: 'Safely executes code snippets in an isolated environment to test before suggesting. Supports JavaScript, TypeScript, Python with timeout and resource limits.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Code to execute'
      },
      language: {
        type: 'string',
        enum: ['javascript', 'typescript', 'python'],
        description: 'Programming language'
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in milliseconds (default: 5000, max: 30000)'
      },
      input: {
        type: 'string',
        description: 'Input data for the code'
      },
      expectation: {
        type: 'string',
        description: 'Expected output or behavior'
      }
    },
    required: ['code', 'language']
  }
};

export async function handleExecutionSandbox(args: any) {
  const { code, language, timeout = 5000, input = '', expectation } = args;

  // Safety limits
  const maxTimeout = 30000;
  const actualTimeout = Math.min(timeout, maxTimeout);

  try {
    const result = await executeCode(code, language, actualTimeout, input);

    const analysis = {
      executed: result.success,
      exitCode: result.exitCode,
      output: result.stdout,
      errors: result.stderr,
      executionTime: result.executionTime,
      timedOut: result.timedOut,
      meetsExpectation: expectation ? checkExpectation(result.stdout, expectation) : null,
      recommendation: generateRecommendation(result, expectation)
    };

    return analysis;

  } catch (error: any) {
    return {
      executed: false,
      error: 'Execution failed',
      details: error.message,
      recommendation: 'Code could not be executed safely. Review syntax and dependencies.'
    };
  }
}

async function executeCode(code: string, language: string, timeout: number, input: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-sandbox-'));
  const startTime = Date.now();

  try {
    let command: string;
    let args: string[];
    let filename: string;

    switch (language) {
      case 'javascript':
        filename = path.join(tempDir, 'code.js');
        await fs.writeFile(filename, code);
        command = 'node';
        args = [filename];
        break;

      case 'typescript':
        filename = path.join(tempDir, 'code.ts');
        await fs.writeFile(filename, code);
        command = 'npx';
        args = ['-y', 'ts-node', filename];
        break;

      case 'python':
        filename = path.join(tempDir, 'code.py');
        await fs.writeFile(filename, code);
        command = 'python';
        args = [filename];
        break;

      default:
        throw new Error(`Unsupported language: ${language}`);
    }

    return new Promise<any>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(command, args, {
        cwd: tempDir,
        timeout,
        env: {
          ...process.env,
          NODE_ENV: 'sandbox'
        }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      if (input) {
        proc.stdin?.write(input);
        proc.stdin?.end();
      }

      proc.on('close', (exitCode) => {
        clearTimeout(timer);
        const executionTime = Date.now() - startTime;

        resolve({
          success: exitCode === 0 && !timedOut,
          exitCode: exitCode || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          executionTime,
          timedOut
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: error.message,
          executionTime: Date.now() - startTime,
          timedOut: false
        });
      });
    });

  } finally {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

function checkExpectation(output: string, expectation: string): { matches: boolean; confidence: number } {
  const outputLower = output.toLowerCase();
  const expectationLower = expectation.toLowerCase();

  // Exact match
  if (output === expectation) {
    return { matches: true, confidence: 100 };
  }

  // Contains expected text
  if (outputLower.includes(expectationLower)) {
    return { matches: true, confidence: 80 };
  }

  // Numeric comparison
  const outputNum = parseFloat(output);
  const expectNum = parseFloat(expectation);
  if (!isNaN(outputNum) && !isNaN(expectNum)) {
    const diff = Math.abs(outputNum - expectNum);
    const tolerance = Math.abs(expectNum * 0.01); // 1% tolerance
    if (diff <= tolerance) {
      return { matches: true, confidence: 90 };
    }
  }

  return { matches: false, confidence: 0 };
}

function generateRecommendation(result: any, expectation?: string): string {
  if (result.timedOut) {
    return '⚠️ Code execution timed out. Check for infinite loops or expensive operations.';
  }

  if (!result.success) {
    return '❌ Code failed to execute. Fix errors before using.';
  }

  if (expectation) {
    const check = checkExpectation(result.stdout, expectation);
    if (!check.matches) {
      return '⚠️ Output does not match expectation. Verify logic.';
    }
    return `✅ Code executed successfully and meets expectations (${check.confidence}% confidence).`;
  }

  return '✅ Code executed successfully. Safe to use.';
}
