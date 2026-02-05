import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getActiveProvider } from '../providers/llm-provider.js';

export const patternLearnerTool = {
  name: 'atlas_pattern_learner',
  description: 'Learns and adapts to coding patterns, style preferences, and architectural choices from the codebase. Provides style-consistent suggestions.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['learn', 'apply', 'suggest', 'report'],
        description: 'Action: learn patterns, apply to new code, suggest improvements, or report findings'
      },
      projectPath: {
        type: 'string',
        description: 'Path to project root directory'
      },
      code: {
        type: 'string',
        description: 'Code to analyze or apply patterns to'
      },
      language: {
        type: 'string',
        description: 'Programming language'
      },
      aspects: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['naming', 'formatting', 'error-handling', 'async-patterns', 'architecture', 'testing']
        },
        description: 'Aspects to learn/analyze'
      }
    },
    required: ['action']
  }
};

export async function handlePatternLearner(args: any) {
  const { action, projectPath, code, language = 'typescript', aspects = ['naming', 'formatting', 'error-handling', 'async-patterns'] } = args;

  try {
    switch (action) {
      case 'learn':
        return await learnPatterns(projectPath, aspects);
      
      case 'apply':
        return await applyPatterns(code, language, projectPath, aspects);
      
      case 'suggest':
        return await suggestImprovements(code, language, projectPath, aspects);
      
      case 'report':
        return await generatePatternReport(projectPath, aspects);
      
      default:
        return { error: `Unknown action: ${action}` };
    }
  } catch (error: any) {
    return {
      error: 'Pattern learning failed',
      details: error.message
    };
  }
}

async function learnPatterns(projectPath: string, aspects: string[]) {
  const files = await getSourceFiles(projectPath);
  const samples = await Promise.all(
    files.slice(0, 20).map(async (file) => {
      try {
        const content = await fs.readFile(file, 'utf-8');
        return { file: path.relative(projectPath, file), content: content.substring(0, 2000) };
      } catch {
        return null;
      }
    })
  );

  const validSamples = samples.filter(Boolean);

  const provider = await getActiveProvider();
  const prompt = `Analyze these code samples and identify consistent patterns.

CODE SAMPLES:
${validSamples.map((s: any) => `--- ${s.file} ---\n${s.content}`).join('\n\n')}

ASPECTS TO ANALYZE: ${aspects.join(', ')}

Provide JSON response:
{
  "patterns": {
    "naming": { "variables": "style", "functions": "style", "classes": "style", "files": "style" },
    "formatting": { "indentation": "spaces/tabs", "quotes": "single/double", "semicolons": "always/never" },
    "errorHandling": { "preferred": "try-catch/result-type/etc", "conventions": [] },
    "asyncPatterns": { "preferred": "async-await/promises/callbacks", "patterns": [] },
    "architecture": { "style": "description", "patterns": [] },
    "testing": { "framework": "name", "patterns": [] }
  },
  "confidence": number (0-100),
  "consistencyScore": number (0-100),
  "recommendations": ["suggestions for better consistency"]
}`;

  const response = await provider.complete(prompt, { temperature: 0.2 });
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse patterns');
  }

  const patterns = JSON.parse(jsonMatch[0]);

  // Store patterns
  const patternsPath = path.join(projectPath, '.atlas', 'learned-patterns.json');
  await fs.mkdir(path.dirname(patternsPath), { recursive: true });
  await fs.writeFile(patternsPath, JSON.stringify({ 
    ...patterns, 
    learnedAt: new Date().toISOString(),
    samplesAnalyzed: validSamples.length 
  }, null, 2));

  return {
    action: 'learned',
    ...patterns,
    samplesAnalyzed: validSamples.length,
    message: 'Patterns learned and stored successfully'
  };
}

async function applyPatterns(code: string, language: string, projectPath: string, aspects: string[]) {
  const patternsPath = path.join(projectPath, '.atlas', 'learned-patterns.json');
  
  let learnedPatterns: any;
  try {
    const data = await fs.readFile(patternsPath, 'utf-8');
    learnedPatterns = JSON.parse(data);
  } catch {
    return { error: 'No learned patterns found. Run "learn" action first.' };
  }

  const provider = await getActiveProvider();
  const prompt = `Apply these learned patterns to make the code consistent with the project style.

LEARNED PATTERNS:
${JSON.stringify(learnedPatterns.patterns, null, 2)}

CODE TO TRANSFORM:
\`\`\`${language}
${code}
\`\`\`

ASPECTS TO APPLY: ${aspects.join(', ')}

Return JSON with:
{
  "transformedCode": "code with patterns applied",
  "changes": ["list of changes made"],
  "consistencyScore": number (0-100)
}`;

  const response = await provider.complete(prompt, { temperature: 0.1 });
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to apply patterns');
  }

  return {
    action: 'applied',
    ...JSON.parse(jsonMatch[0]),
    patternsUsed: aspects
  };
}

async function suggestImprovements(code: string, language: string, projectPath: string, aspects: string[]) {
  const patternsPath = path.join(projectPath, '.atlas', 'learned-patterns.json');
  
  let learnedPatterns: any;
  try {
    const data = await fs.readFile(patternsPath, 'utf-8');
    learnedPatterns = JSON.parse(data);
  } catch {
    return { error: 'No learned patterns found. Run "learn" action first.' };
  }

  const provider = await getActiveProvider();
  const prompt = `Compare this code against learned project patterns and suggest improvements.

LEARNED PATTERNS:
${JSON.stringify(learnedPatterns.patterns, null, 2)}

CODE:
\`\`\`${language}
${code}
\`\`\`

Provide suggestions in JSON:
{
  "suggestions": [
    {
      "aspect": "naming|formatting|error-handling|etc",
      "current": "what code currently does",
      "suggested": "what it should do",
      "reason": "why change is needed"
    }
  ],
  "conformityScore": number (0-100)
}`;

  const response = await provider.complete(prompt, { temperature: 0.3 });
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to generate suggestions');
  }

  return {
    action: 'suggestions',
    ...JSON.parse(jsonMatch[0])
  };
}

async function generatePatternReport(projectPath: string, aspects: string[]) {
  const patternsPath = path.join(projectPath, '.atlas', 'learned-patterns.json');
  
  try {
    const data = await fs.readFile(patternsPath, 'utf-8');
    const patterns = JSON.parse(data);
    
    return {
      action: 'report',
      ...patterns,
      message: 'Pattern report generated successfully'
    };
  } catch {
    return { error: 'No learned patterns found. Run "learn" action first.' };
  }
}

async function getSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
        files.push(...await getSourceFiles(fullPath));
      } else if (/\.(ts|tsx|js|jsx|py)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip errors
  }
  
  return files;
}
