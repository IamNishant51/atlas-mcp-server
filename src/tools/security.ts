/**
 * Atlas Server - Security Analysis Tool
 * 
 * Comprehensive security vulnerability scanning:
 * - SQL Injection detection
 * - XSS vulnerability detection
 * - Hardcoded secrets/credentials
 * - Insecure dependencies patterns
 * - Authentication/Authorization issues
 * - Input validation gaps
 * - Cryptographic weaknesses
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { PromptTemplates } from './ollama.js';
import { logger } from '../utils.js';

// ============================================================================
// Types
// ============================================================================

export interface SecurityVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: SecurityCategory;
  title: string;
  description: string;
  lineNumber?: number;
  codeSnippet?: string;
  recommendation: string;
  cweId?: string;
  owaspCategory?: string;
}

export type SecurityCategory =
  | 'injection'
  | 'authentication'
  | 'authorization'
  | 'xss'
  | 'secrets'
  | 'cryptography'
  | 'configuration'
  | 'dependencies'
  | 'input_validation'
  | 'sensitive_data'
  | 'other';

export interface SecurityScanResult {
  vulnerabilities: SecurityVulnerability[];
  summary: SecuritySummary;
  riskScore: number;
  recommendations: string[];
  scannedAt: string;
}

export interface SecuritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

// ============================================================================
// Security Patterns (Heuristic Detection)
// ============================================================================

interface SecurityPattern {
  pattern: RegExp;
  category: SecurityCategory;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  recommendation: string;
  cweId?: string;
}

const SECURITY_PATTERNS: SecurityPattern[] = [
  // SQL Injection
  {
    pattern: /(\$\{.*\}|`.*\$\{.*\}`|\+\s*\w+\s*\+).*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)/gi,
    category: 'injection',
    severity: 'critical',
    title: 'Potential SQL Injection',
    description: 'String concatenation or template literals used in SQL queries can lead to SQL injection attacks.',
    recommendation: 'Use parameterized queries or prepared statements instead of string concatenation.',
    cweId: 'CWE-89',
  },
  {
    pattern: /(?:query|execute|exec)\s*\(\s*[`'"].*\$\{/gi,
    category: 'injection',
    severity: 'critical',
    title: 'SQL Query with Template Literal',
    description: 'Template literals in SQL queries are vulnerable to injection attacks.',
    recommendation: 'Use parameterized queries with placeholders (?, $1, :param).',
    cweId: 'CWE-89',
  },
  // Command Injection
  {
    pattern: /(?:exec|spawn|execSync|spawnSync|execFile)\s*\([^)]*\$\{/gi,
    category: 'injection',
    severity: 'critical',
    title: 'Potential Command Injection',
    description: 'User input in shell commands can lead to arbitrary command execution.',
    recommendation: 'Validate and sanitize all inputs. Use execFile with argument arrays instead of exec.',
    cweId: 'CWE-78',
  },
  // XSS
  {
    pattern: /innerHTML\s*=|outerHTML\s*=|document\.write\s*\(/gi,
    category: 'xss',
    severity: 'high',
    title: 'Potential XSS Vulnerability',
    description: 'Direct DOM manipulation with user content can lead to cross-site scripting.',
    recommendation: 'Use textContent instead of innerHTML, or sanitize HTML with DOMPurify.',
    cweId: 'CWE-79',
  },
  {
    pattern: /dangerouslySetInnerHTML/gi,
    category: 'xss',
    severity: 'high',
    title: 'React dangerouslySetInnerHTML',
    description: 'Using dangerouslySetInnerHTML can introduce XSS vulnerabilities.',
    recommendation: 'Sanitize HTML content with DOMPurify before rendering.',
    cweId: 'CWE-79',
  },
  // Hardcoded Secrets
  {
    pattern: /(?:api[_-]?key|apikey|secret|password|passwd|pwd|token|auth|credential)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    category: 'secrets',
    severity: 'critical',
    title: 'Hardcoded Secret/Credential',
    description: 'Secrets hardcoded in source code can be exposed in version control.',
    recommendation: 'Use environment variables or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).',
    cweId: 'CWE-798',
  },
  {
    pattern: /(?:-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/gi,
    category: 'secrets',
    severity: 'critical',
    title: 'Private Key in Source Code',
    description: 'Private keys should never be stored in source code.',
    recommendation: 'Store private keys in secure key management systems, not in code.',
    cweId: 'CWE-321',
  },
  // Weak Cryptography
  {
    pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/gi,
    category: 'cryptography',
    severity: 'high',
    title: 'Weak Hash Algorithm',
    description: 'MD5 and SHA1 are cryptographically broken and should not be used for security.',
    recommendation: 'Use SHA-256, SHA-3, or bcrypt/argon2 for password hashing.',
    cweId: 'CWE-328',
  },
  {
    pattern: /Math\.random\s*\(\)/gi,
    category: 'cryptography',
    severity: 'medium',
    title: 'Insecure Random Number Generator',
    description: 'Math.random() is not cryptographically secure.',
    recommendation: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive operations.',
    cweId: 'CWE-338',
  },
  // Authentication Issues
  {
    pattern: /(?:verify|check).*(?:===|==)\s*(?:true|false|['"])/gi,
    category: 'authentication',
    severity: 'medium',
    title: 'Potentially Weak Authentication Check',
    description: 'Simple boolean comparisons for authentication may be bypassable.',
    recommendation: 'Use timing-safe comparison functions and proper authentication libraries.',
    cweId: 'CWE-287',
  },
  // Eval and Dynamic Code Execution
  {
    pattern: /\beval\s*\(/gi,
    category: 'injection',
    severity: 'critical',
    title: 'Use of eval()',
    description: 'eval() executes arbitrary code and is a severe security risk.',
    recommendation: 'Avoid eval(). Use JSON.parse() for JSON, or Function constructor with caution.',
    cweId: 'CWE-95',
  },
  {
    pattern: /new\s+Function\s*\(/gi,
    category: 'injection',
    severity: 'high',
    title: 'Dynamic Function Constructor',
    description: 'new Function() can execute arbitrary code similar to eval().',
    recommendation: 'Avoid dynamic code generation. Use safe alternatives.',
    cweId: 'CWE-95',
  },
  // Input Validation
  {
    pattern: /JSON\.parse\s*\([^)]*(?:req|request|body|params|query)/gi,
    category: 'input_validation',
    severity: 'medium',
    title: 'Unvalidated JSON Parsing',
    description: 'Parsing user input without validation can lead to prototype pollution or crashes.',
    recommendation: 'Validate JSON schema before parsing. Use libraries like zod or joi.',
    cweId: 'CWE-20',
  },
  // Sensitive Data Exposure
  {
    pattern: /console\.log\s*\([^)]*(?:password|secret|token|key|credential)/gi,
    category: 'sensitive_data',
    severity: 'medium',
    title: 'Sensitive Data in Logs',
    description: 'Logging sensitive information can expose credentials.',
    recommendation: 'Redact sensitive data before logging. Use structured logging.',
    cweId: 'CWE-532',
  },
  // CORS Misconfiguration
  {
    pattern: /(?:Access-Control-Allow-Origin|cors).*['"]\*['"]/gi,
    category: 'configuration',
    severity: 'medium',
    title: 'Overly Permissive CORS',
    description: 'Allowing all origins (*) can expose APIs to unauthorized access.',
    recommendation: 'Specify allowed origins explicitly instead of using wildcard.',
    cweId: 'CWE-942',
  },
  // Path Traversal
  {
    pattern: /(?:readFile|writeFile|readdir|unlink|rmdir).*(?:req|request|params|query)/gi,
    category: 'injection',
    severity: 'high',
    title: 'Potential Path Traversal',
    description: 'Using user input in file operations can allow directory traversal attacks.',
    recommendation: 'Validate and sanitize file paths. Use path.resolve() and check against base directory.',
    cweId: 'CWE-22',
  },
  // Insecure Deserialization
  {
    pattern: /(?:unserialize|deserialize|pickle\.loads|yaml\.load(?!_safe))/gi,
    category: 'injection',
    severity: 'critical',
    title: 'Insecure Deserialization',
    description: 'Deserializing untrusted data can lead to remote code execution.',
    recommendation: 'Use safe deserialization methods. Validate and sanitize input.',
    cweId: 'CWE-502',
  },
  // HTTP without TLS
  {
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/gi,
    category: 'configuration',
    severity: 'low',
    title: 'Non-HTTPS URL',
    description: 'Using HTTP instead of HTTPS exposes data to interception.',
    recommendation: 'Use HTTPS for all external communications.',
    cweId: 'CWE-319',
  },
];

// ============================================================================
// Security Scanning
// ============================================================================

/**
 * Scan code for security vulnerabilities
 */
export async function scanSecurity(
  code: string,
  language?: string,
  context?: string
): Promise<SecurityScanResult> {
  logger.debug({ codeLength: code.length, language }, 'Starting security scan');

  // First, run heuristic pattern matching
  const heuristicVulns = runHeuristicScan(code);

  // If LLM is available, enhance with AI analysis
  let aiVulns: SecurityVulnerability[] = [];
  if (!isNoLLMMode()) {
    try {
      aiVulns = await runAIScan(code, language, context);
    } catch (error) {
      logger.warn({ error }, 'AI security scan failed, using heuristic results only');
    }
  }

  // Merge and deduplicate vulnerabilities
  const allVulns = mergeVulnerabilities(heuristicVulns, aiVulns);

  // Calculate summary
  const summary = calculateSummary(allVulns);
  const riskScore = calculateRiskScore(summary);

  // Generate recommendations
  const recommendations = generateRecommendations(allVulns);

  return {
    vulnerabilities: allVulns,
    summary,
    riskScore,
    recommendations,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Run heuristic pattern-based security scan
 */
function runHeuristicScan(code: string): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const lines = code.split('\n');

  for (const secPattern of SECURITY_PATTERNS) {
    // Reset regex state
    secPattern.pattern.lastIndex = 0;

    let match;
    while ((match = secPattern.pattern.exec(code)) !== null) {
      // Find line number
      const beforeMatch = code.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Get code snippet (the line containing the match)
      const snippetLine = lines[lineNumber - 1] || '';

      vulnerabilities.push({
        id: `heur-${vulnerabilities.length + 1}`,
        severity: secPattern.severity,
        category: secPattern.category,
        title: secPattern.title,
        description: secPattern.description,
        lineNumber,
        codeSnippet: snippetLine.trim(),
        recommendation: secPattern.recommendation,
        cweId: secPattern.cweId,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Run AI-powered security analysis
 */
async function runAIScan(
  code: string,
  language?: string,
  context?: string
): Promise<SecurityVulnerability[]> {
  const provider = await getActiveProvider();

  const prompt = `Analyze this code for security vulnerabilities.

## Code
\`\`\`${language ?? ''}
${code}
\`\`\`

${context ? `## Additional Context\n${context}\n` : ''}

## Find These Types of Issues:
1. Injection vulnerabilities (SQL, Command, XSS)
2. Authentication/Authorization flaws
3. Hardcoded secrets or credentials
4. Cryptographic weaknesses
5. Input validation issues
6. Sensitive data exposure
7. Configuration problems
8. Any OWASP Top 10 vulnerabilities

## Output Format
{
  "vulnerabilities": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "injection|authentication|authorization|xss|secrets|cryptography|configuration|dependencies|input_validation|sensitive_data|other",
      "title": "Brief title",
      "description": "Detailed description of the vulnerability",
      "lineNumber": 0,
      "recommendation": "How to fix it",
      "cweId": "CWE-XXX",
      "owaspCategory": "A01:2021 - Broken Access Control"
    }
  ]
}`;

  const response = await provider.completeJson<{
    vulnerabilities: Array<{
      severity: string;
      category: string;
      title: string;
      description: string;
      lineNumber?: number;
      recommendation: string;
      cweId?: string;
      owaspCategory?: string;
    }>;
  }>(prompt, {
    systemPrompt: 'You are a senior security engineer. Analyze code for vulnerabilities. Be thorough but avoid false positives. Return valid JSON only.',
    temperature: 0.2,
    maxTokens: 2048,
  });

  if (response.data?.vulnerabilities) {
    return response.data.vulnerabilities.map((v, i) => ({
      id: `ai-${i + 1}`,
      severity: normalizeSeverity(v.severity),
      category: normalizeCategory(v.category),
      title: v.title,
      description: v.description,
      lineNumber: v.lineNumber,
      recommendation: v.recommendation,
      cweId: v.cweId,
      owaspCategory: v.owaspCategory,
    }));
  }

  return [];
}

/**
 * Merge and deduplicate vulnerabilities
 */
function mergeVulnerabilities(
  heuristic: SecurityVulnerability[],
  ai: SecurityVulnerability[]
): SecurityVulnerability[] {
  const seen = new Set<string>();
  const merged: SecurityVulnerability[] = [];

  for (const vuln of [...heuristic, ...ai]) {
    // Create a dedup key based on category, line, and title
    const key = `${vuln.category}-${vuln.lineNumber ?? 'none'}-${vuln.title.toLowerCase().slice(0, 30)}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(vuln);
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return merged.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Calculate vulnerability summary
 */
function calculateSummary(vulnerabilities: SecurityVulnerability[]): SecuritySummary {
  const summary: SecuritySummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: vulnerabilities.length,
  };

  for (const vuln of vulnerabilities) {
    summary[vuln.severity]++;
  }

  return summary;
}

/**
 * Calculate overall risk score (0-100)
 */
function calculateRiskScore(summary: SecuritySummary): number {
  // Weighted scoring
  const score = 
    summary.critical * 25 +
    summary.high * 15 +
    summary.medium * 8 +
    summary.low * 3 +
    summary.info * 1;

  // Normalize to 0-100 (capped)
  return Math.min(100, score);
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(vulnerabilities: SecurityVulnerability[]): string[] {
  const recommendations = new Set<string>();

  // Add critical issue recommendations first
  for (const vuln of vulnerabilities) {
    if (vuln.severity === 'critical' || vuln.severity === 'high') {
      recommendations.add(vuln.recommendation);
    }
  }

  // Add general best practices
  const categories = new Set(vulnerabilities.map(v => v.category));

  if (categories.has('secrets')) {
    recommendations.add('Implement a secrets management solution (e.g., HashiCorp Vault, AWS Secrets Manager)');
  }
  if (categories.has('injection')) {
    recommendations.add('Use parameterized queries and input validation throughout the application');
  }
  if (categories.has('authentication')) {
    recommendations.add('Review authentication flow and implement multi-factor authentication');
  }
  if (categories.has('xss')) {
    recommendations.add('Implement Content Security Policy (CSP) headers');
  }

  return Array.from(recommendations).slice(0, 10);
}

/**
 * Normalize severity string
 */
function normalizeSeverity(severity: string): SecurityVulnerability['severity'] {
  const normalized = severity.toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(normalized)) {
    return normalized as SecurityVulnerability['severity'];
  }
  return 'medium';
}

/**
 * Normalize category string
 */
function normalizeCategory(category: string): SecurityCategory {
  const normalized = category.toLowerCase().replace(/[^a-z_]/g, '_');
  const validCategories: SecurityCategory[] = [
    'injection', 'authentication', 'authorization', 'xss', 'secrets',
    'cryptography', 'configuration', 'dependencies', 'input_validation',
    'sensitive_data', 'other'
  ];
  
  if (validCategories.includes(normalized as SecurityCategory)) {
    return normalized as SecurityCategory;
  }
  return 'other';
}
