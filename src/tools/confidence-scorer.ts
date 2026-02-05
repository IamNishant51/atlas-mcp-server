import { z } from 'zod';
import { getActiveProvider } from '../providers/llm-provider.js';

export const confidenceScorerTool = {
  name: 'atlas_confidence_scorer',
  description: 'Provides confidence scoring for code suggestions, solutions, and responses. Helps understand reliability and certainty of recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      suggestion: {
        type: 'string',
        description: 'The code, solution, or suggestion to score'
      },
      context: {
        type: 'string',
        description: 'Context about the problem being solved'
      },
      language: {
        type: 'string',
        description: 'Programming language'
      },
      verificationData: {
        type: 'object',
        description: 'Optional data from validation or testing',
        properties: {
          testsPassed: { type: 'boolean' },
          validationScore: { type: 'number' },
          executionSuccessful: { type: 'boolean' }
        }
      }
    },
    required: ['suggestion']
  }
};

export async function handleConfidenceScorer(args: any) {
  const { suggestion, context = '', language = 'unknown', verificationData } = args;

  try {
    const provider = await getActiveProvider();

    const prompt = `You are a confidence assessment expert. Evaluate the quality and reliability of this code suggestion.

SUGGESTION:
${suggestion}

CONTEXT: ${context}
LANGUAGE: ${language}

${verificationData ? `VERIFICATION DATA:\n${JSON.stringify(verificationData, null, 2)}` : ''}

Provide a comprehensive confidence assessment in JSON format:
{
  "overallConfidence": number (0-100),
  "factors": {
    "correctness": { "score": number (0-100), "reasoning": "explanation" },
    "completeness": { "score": number (0-100), "reasoning": "explanation" },
    "bestPractices": { "score": number (0-100), "reasoning": "explanation" },
    "robustness": { "score": number (0-100), "reasoning": "explanation" },
    "clarity": { "score": number (0-100), "reasoning": "explanation" }
  },
  "uncertainties": ["list of things you're uncertain about"],
  "assumptions": ["assumptions made in this suggestion"],
  "risks": ["potential risks or limitations"],
  "reliabilityLevel": "very-high|high|medium|low|very-low",
  "recommendation": "use-confidently|use-with-caution|review-carefully|revise"
}`;

    const response = await provider.complete(prompt, { temperature: 0.2 });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse confidence assessment');
    }

    const assessment = JSON.parse(jsonMatch[0]);

    // Adjust confidence based on verification data
    if (verificationData) {
      assessment.overallConfidence = adjustForVerification(
        assessment.overallConfidence,
        verificationData
      );
    }

    return {
      ...assessment,
      timestamp: new Date().toISOString(),
      summary: generateConfidenceSummary(assessment)
    };

  } catch (error: any) {
    return {
      error: 'Confidence scoring failed',
      details: error.message,
      overallConfidence: 50,
      reliabilityLevel: 'unknown',
      recommendation: 'review-carefully'
    };
  }
}

function adjustForVerification(baseConfidence: number, verificationData: any): number {
  let adjusted = baseConfidence;

  if (verificationData.testsPassed === true) {
    adjusted += 10;
  } else if (verificationData.testsPassed === false) {
    adjusted -= 20;
  }

  if (verificationData.executionSuccessful === true) {
    adjusted += 10;
  } else if (verificationData.executionSuccessful === false) {
    adjusted -= 15;
  }

  if (verificationData.validationScore !== undefined) {
    const validationBonus = (verificationData.validationScore - 50) * 0.2;
    adjusted += validationBonus;
  }

  return Math.max(0, Math.min(100, adjusted));
}

function generateConfidenceSummary(assessment: any): string {
  const conf = assessment.overallConfidence;
  const level = assessment.reliabilityLevel;

  if (conf >= 90) {
    return `✅ Very high confidence (${conf}%). This suggestion is highly reliable.`;
  } else if (conf >= 75) {
    return `✓ High confidence (${conf}%). Suggestion appears solid but verify edge cases.`;
  } else if (conf >= 60) {
    return `⚠️ Moderate confidence (${conf}%). Review and test before using.`;
  } else if (conf >= 40) {
    return `⚠️ Low confidence (${conf}%). Significant uncertainties exist.`;
  } else {
    return `❌ Very low confidence (${conf}%). This may not be the best solution.`;
  }
}
