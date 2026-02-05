import { z } from 'zod';
import { getActiveProvider } from '../providers/llm-provider.js';

export const errorPredictorTool = {
  name: 'atlas_error_predictor',
  description: 'Predicts potential runtime errors, edge cases, and failure scenarios before code execution. Analyzes code for null refs, type mismatches, race conditions, and more.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Code to analyze for potential errors'
      },
      language: {
        type: 'string',
        description: 'Programming language'
      },
      context: {
        type: 'string',
        description: 'Context about how this code will be used'
      },
      checkFor: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['null-refs', 'type-errors', 'race-conditions', 'edge-cases', 'runtime-errors', 'async-issues']
        },
        description: 'Specific error types to check for (default: all)'
      }
    },
    required: ['code']
  }
};

export async function handleErrorPredictor(args: any) {
  const { code, language = 'typescript', context = '', checkFor = ['null-refs', 'type-errors', 'race-conditions', 'edge-cases', 'runtime-errors', 'async-issues'] } = args;

  try {
    const provider = await getActiveProvider();

    const prompt = `You are an expert error predictor. Analyze this code for potential runtime errors and failure scenarios.

CODE:
\`\`\`${language}
${code}
\`\`\`

CONTEXT: ${context}

CHECK FOR: ${checkFor.join(', ')}

Predict potential errors and provide JSON response:
{
  "riskScore": number (0-100, higher = more risky),
  "predictions": [
    {
      "type": "null-ref|type-error|race-condition|edge-case|runtime-error|async-issue",
      "severity": "critical|high|medium|low",
      "likelihood": number (0-100),
      "scenario": "description of when this error would occur",
      "location": "code location if identifiable",
      "preventionStrategy": "how to prevent this error",
      "testCase": "suggested test to catch this"
    }
  ],
  "edgeCases": ["list of edge cases to consider"],
  "safetyRecommendations": ["general recommendations"],
  "confidenceLevel": number (0-100)
}`;

    const response = await provider.complete(prompt, { temperature: 0.3 });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse prediction response');
    }

    const prediction = JSON.parse(jsonMatch[0]);

    return {
      ...prediction,
      language,
      checksPerformed: checkFor,
      timestamp: new Date().toISOString(),
      summary: generateSummary(prediction)
    };

  } catch (error: any) {
    return {
      error: 'Error prediction failed',
      details: error.message,
      riskScore: 50,
      confidenceLevel: 0
    };
  }
}

function generateSummary(prediction: any): string {
  const criticalCount = prediction.predictions?.filter((p: any) => p.severity === 'critical').length || 0;
  const highCount = prediction.predictions?.filter((p: any) => p.severity === 'high').length || 0;

  if (criticalCount > 0) {
    return `⚠️ Found ${criticalCount} critical issue(s). Review before deployment.`;
  } else if (highCount > 0) {
    return `Found ${highCount} high-risk issue(s). Address to improve reliability.`;
  } else if (prediction.riskScore > 50) {
    return 'Moderate risk detected. Consider adding error handling.';
  } else {
    return 'Low risk. Code appears safe with standard precautions.';
  }
}
