import { z } from 'zod';
import { getActiveProvider } from '../providers/llm-provider.js';

export const selfValidatorTool = {
  name: 'atlas_self_validator',
  description: 'Validates code, suggestions, or solutions before presenting them. Checks for syntax errors, logic flaws, security issues, edge cases, and provides confidence scoring.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Code to validate'
      },
      language: {
        type: 'string',
        description: 'Programming language (typescript, javascript, python, etc.)'
      },
      context: {
        type: 'string',
        description: 'Additional context about what the code should do'
      },
      checkTypes: {
        type: 'array',
        items: { 
          type: 'string',
          enum: ['syntax', 'logic', 'security', 'performance', 'edge-cases', 'best-practices']
        },
        description: 'Types of validation to perform (default: all)'
      }
    },
    required: ['code']
  }
};

export async function handleSelfValidator(args: any) {
  const { code, language = 'unknown', context = '', checkTypes = ['syntax', 'logic', 'security', 'performance', 'edge-cases', 'best-practices'] } = args;

  try {
    const provider = await getActiveProvider();
    
    const prompt = `You are a code validation expert. Analyze the following code and provide a comprehensive validation report.

CODE:
\`\`\`${language}
${code}
\`\`\`

CONTEXT: ${context || 'Not provided'}

VALIDATE FOR: ${checkTypes.join(', ')}

Provide a JSON response with this exact structure:
{
  "isValid": boolean,
  "confidenceScore": number (0-100),
  "issues": [
    {
      "type": "syntax|logic|security|performance|edge-case|best-practice",
      "severity": "critical|high|medium|low",
      "message": "description",
      "line": number (if applicable),
      "suggestion": "how to fix"
    }
  ],
  "strengths": ["positive aspects"],
  "overallAssessment": "brief summary",
  "recommendation": "approve|review|reject"
}`;

    const response = await provider.complete(prompt, { temperature: 0.3 });
    
    // Extract JSON from response
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse validation response');
    }

    const validation = JSON.parse(jsonMatch[0]);

    return {
      ...validation,
      language,
      checksPerformed: checkTypes,
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    return {
      error: 'Validation failed',
      details: error.message,
      isValid: false,
      confidenceScore: 0,
      recommendation: 'review'
    };
  }
}
