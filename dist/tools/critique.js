/**
 * Atlas Server - Critique Tool
 *
 * Provides thorough code review and critique:
 * - Correctness analysis
 * - Performance evaluation
 * - Maintainability assessment
 * - Security review
 * - Best practices check
 */
import { getActiveProvider } from '../providers/index.js';
import { PromptTemplates } from './ollama.js';
import { logger } from '../utils.js';
// ============================================================================
// Critique Generation
// ============================================================================
/**
 * Critique all solution variants
 */
export async function critiqueVariants(variants) {
    logger.debug({ variantCount: variants.length }, 'Starting critique');
    const critiques = [];
    for (const variant of variants) {
        const critique = await critiqueVariant(variant);
        critiques.push(critique);
    }
    // Find the best variant
    const viableCritiques = critiques.filter((c) => c.isViable);
    const bestCritique = viableCritiques.length > 0
        ? viableCritiques.reduce((best, current) => current.qualityScore > best.qualityScore ? current : best)
        : critiques.reduce((best, current) => current.qualityScore > best.qualityScore ? current : best);
    return {
        critiques,
        bestVariantId: bestCritique.variantId,
        summary: generateCritiqueSummary(critiques),
    };
}
/**
 * Critique a single variant
 */
async function critiqueVariant(variant) {
    const provider = await getActiveProvider();
    const prompt = buildCritiquePrompt(variant);
    try {
        const response = await provider.completeJson(prompt, {
            systemPrompt: PromptTemplates.codeCritique,
            temperature: 0.3, // Lower temp for analytical work
            maxTokens: 2048,
        });
        if (response.data) {
            const assessment = normalizeAssessment(response.data.assessment);
            const issues = response.data.issues.map((issue) => ({
                severity: normalizeSeverity(issue.severity),
                category: normalizeCategory(issue.category),
                description: issue.description,
                location: issue.location,
                suggestedFix: issue.suggestedFix,
            }));
            return {
                variantId: variant.id,
                qualityScore: calculateQualityScore(assessment, issues),
                assessment,
                issues,
                suggestions: response.data.suggestions,
                isViable: response.data.isViable,
            };
        }
    }
    catch (error) {
        logger.warn({ error }, 'Critique LLM call failed, using fallback');
    }
    // Fallback critique
    return fallbackCritique(variant);
}
/**
 * Build the critique prompt for a variant
 */
function buildCritiquePrompt(variant) {
    return `Critically analyze this solution variant.

## Variant ${variant.label}: ${variant.approach}

### Code
\`\`\`
${variant.content}
\`\`\`

### Stated Pros
${variant.tradeoffs.pros.map((p) => `- ${p}`).join('\n')}

### Stated Cons
${variant.tradeoffs.cons.map((c) => `- ${c}`).join('\n')}

### Target Use Case
${variant.useCase}

## Analyze For:
1. **Correctness**: Does it solve the problem correctly? Any bugs?
2. **Performance**: Are there efficiency issues? Memory leaks? N+1 queries?
3. **Maintainability**: Is it readable? Well-structured? Documented?
4. **Security**: Any vulnerabilities? Input validation? Injection risks?
5. **Best Practices**: Does it follow conventions? Modern patterns?

## Output Format
{
  "assessment": {
    "correctness": 0-100,
    "performance": 0-100,
    "maintainability": 0-100,
    "security": 0-100,
    "bestPractices": 0-100
  },
  "issues": [
    {
      "severity": "critical|major|minor|suggestion",
      "category": "correctness|performance|maintainability|security|bestPractices",
      "description": "Clear description of the issue",
      "location": "Line or section where issue occurs (optional)",
      "suggestedFix": "How to fix it (optional)"
    }
  ],
  "suggestions": ["General improvement suggestions"],
  "isViable": true/false
}`;
}
// ============================================================================
// Fallback and Normalization
// ============================================================================
/**
 * Fallback critique when LLM fails
 */
function fallbackCritique(variant) {
    // Basic heuristic analysis
    const hasTypeAnnotations = variant.content.includes(': ');
    const hasErrorHandling = variant.content.includes('try') ||
        variant.content.includes('catch') ||
        variant.content.includes('throw');
    const hasComments = variant.content.includes('//') || variant.content.includes('/*');
    const isShort = variant.content.length < 500;
    const assessment = {
        correctness: 60, // Assume reasonable correctness
        performance: isShort ? 70 : 50,
        maintainability: hasComments ? 65 : 45,
        security: hasErrorHandling ? 60 : 40,
        bestPractices: hasTypeAnnotations ? 70 : 50,
    };
    const issues = [];
    if (!hasErrorHandling) {
        issues.push({
            severity: 'minor',
            category: 'security',
            description: 'No error handling detected',
            suggestedFix: 'Add try-catch blocks for error handling',
        });
    }
    if (!hasComments) {
        issues.push({
            severity: 'suggestion',
            category: 'maintainability',
            description: 'Code lacks comments',
            suggestedFix: 'Add comments explaining complex logic',
        });
    }
    return {
        variantId: variant.id,
        qualityScore: calculateQualityScore(assessment, issues),
        assessment,
        issues,
        suggestions: [
            'Consider adding more comprehensive error handling',
            'Add documentation comments for public APIs',
        ],
        isViable: true,
    };
}
/**
 * Normalize assessment scores to valid range
 */
function normalizeAssessment(assessment) {
    const normalize = (value) => Math.min(100, Math.max(0, Math.round(value)));
    return {
        correctness: normalize(assessment['correctness'] ?? 50),
        performance: normalize(assessment['performance'] ?? 50),
        maintainability: normalize(assessment['maintainability'] ?? 50),
        security: normalize(assessment['security'] ?? 50),
        bestPractices: normalize(assessment['bestPractices'] ?? 50),
    };
}
/**
 * Normalize severity string
 */
function normalizeSeverity(severity) {
    const normalized = severity.toLowerCase();
    if (normalized === 'critical')
        return 'critical';
    if (normalized === 'major')
        return 'major';
    if (normalized === 'minor')
        return 'minor';
    return 'suggestion';
}
/**
 * Normalize category string
 */
function normalizeCategory(category) {
    const normalized = category.toLowerCase();
    if (normalized.includes('correct'))
        return 'correctness';
    if (normalized.includes('perform'))
        return 'performance';
    if (normalized.includes('maintain') || normalized.includes('read'))
        return 'maintainability';
    if (normalized.includes('secur'))
        return 'security';
    return 'bestPractices';
}
/**
 * Calculate overall quality score
 */
function calculateQualityScore(assessment, issues) {
    // Weighted average of assessment scores
    const weights = {
        correctness: 0.3,
        performance: 0.2,
        maintainability: 0.2,
        security: 0.15,
        bestPractices: 0.15,
    };
    let score = Object.entries(assessment).reduce((total, [key, value]) => total + value * (weights[key] ?? 0.1), 0);
    // Deduct for issues
    const severityPenalty = {
        critical: 15,
        major: 8,
        minor: 3,
        suggestion: 1,
    };
    for (const issue of issues) {
        score -= severityPenalty[issue.severity];
    }
    return Math.min(100, Math.max(0, Math.round(score)));
}
/**
 * Generate summary of all critiques
 */
function generateCritiqueSummary(critiques) {
    const viableCount = critiques.filter((c) => c.isViable).length;
    const avgScore = critiques.reduce((sum, c) => sum + c.qualityScore, 0) / critiques.length;
    const totalIssues = critiques.reduce((sum, c) => sum + c.issues.length, 0);
    const criticalIssues = critiques.reduce((sum, c) => sum + c.issues.filter((i) => i.severity === 'critical').length, 0);
    return `Reviewed ${critiques.length} variants. ${viableCount} are viable. ` +
        `Average quality score: ${avgScore.toFixed(0)}/100. ` +
        `Total issues found: ${totalIssues} (${criticalIssues} critical).`;
}
// ============================================================================
// Critique Analysis Utilities
// ============================================================================
/**
 * Get the most common issues across variants
 */
export function getCommonIssues(critiques) {
    const issuesByCategory = new Map();
    for (const critique of critiques) {
        for (const issue of critique.issues) {
            const existing = issuesByCategory.get(issue.category) ?? [];
            existing.push(issue.description);
            issuesByCategory.set(issue.category, existing);
        }
    }
    return Array.from(issuesByCategory.entries())
        .map(([category, descriptions]) => ({
        category,
        count: descriptions.length,
        examples: [...new Set(descriptions)].slice(0, 3),
    }))
        .sort((a, b) => b.count - a.count);
}
/**
 * Get improvement priorities based on critiques
 */
export function getImprovementPriorities(critiques) {
    const areas = [
        'correctness',
        'performance',
        'maintainability',
        'security',
        'bestPractices',
    ];
    return areas
        .map((area) => {
        const scores = critiques.map((c) => c.assessment[area]);
        const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        let priority;
        if (averageScore < 50)
            priority = 'high';
        else if (averageScore < 70)
            priority = 'medium';
        else
            priority = 'low';
        return { area, averageScore, priority };
    })
        .sort((a, b) => a.averageScore - b.averageScore);
}
/**
 * Compare two critiques
 */
export function compareCritiques(a, b) {
    const comparison = {};
    for (const key of Object.keys(a.assessment)) {
        const diff = a.assessment[key] - b.assessment[key];
        if (diff > 5)
            comparison[key] = 'a';
        else if (diff < -5)
            comparison[key] = 'b';
        else
            comparison[key] = 'tie';
    }
    const margin = a.qualityScore - b.qualityScore;
    const winner = margin > 0 ? a.variantId : margin < 0 ? b.variantId : 'tie';
    return { winner, margin: Math.abs(margin), comparison };
}
//# sourceMappingURL=critique.js.map