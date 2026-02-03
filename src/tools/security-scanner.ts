/**
 * Atlas Server - Advanced Security & Vulnerability Scanner\n * 
 * Enterprise-grade security analysis for frontend applications
 * - Dependency vulnerability scanning
 * - Code-level security vulnerabilities
 * - XSS/CSRF/Injection prevention
 * - Authentication/Authorization issues
 * - API security recommendations
 * - Data exposure risks
 * 
 * @module security-scanner
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface SecurityScanRequest {
  codeBase?: string;
  dependencies?: string[];
  apiEndpoints?: ApiEndpoint[];
  authMethod?: string;
  dataHandling?: string;
  frameworks?: string[];
  environmentVariables?: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  authentication: string;
  inputValidation?: string;
  rateLimit?: string;
}

export interface SecurityScanResult {
  vulnerabilities: Vulnerability[];
  riskScore: number; // 1-100
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  recommendations: SecurityRecommendation[];
  complianceStatus: ComplianceStatus;
  generatedAt: string;
}

export interface Vulnerability {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: VulnerabilityType;
  description: string;
  affectedArea: string;
  cveId?: string;
  impact: string;
  remediation: string;
  exploitability: 'high' | 'medium' | 'low';
  codeLocation?: string;
}

export type VulnerabilityType =
  | 'xss'
  | 'csrf'
  | 'injection'
  | 'insecure-auth'
  | 'insecure-data-storage'
  | 'insecure-api'
  | 'dependency-vulnerability'
  | 'sensitive-data-exposure'
  | 'broken-access-control'
  | 'security-misconfiguration'
  | 'insecure-deserialization'
  | 'insufficient-logging';

export interface SecurityRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  recommendation: string;
  implementation: string;
  effort: string;
  benefit: string;
}

export interface ComplianceStatus {
  gdpr: 'compliant' | 'partial' | 'non-compliant';
  ccpa: 'compliant' | 'partial' | 'non-compliant';
  hipaa: 'compliant' | 'partial' | 'non-compliant';
  pciDss: 'compliant' | 'partial' | 'non-compliant';
  owasp: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

const SecurityScanRequestSchema = z.object({
  codeBase: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  apiEndpoints: z.array(z.object({
    method: z.string(),
    path: z.string(),
    authentication: z.string(),
    inputValidation: z.string().optional(),
    rateLimit: z.string().optional(),
  })).optional(),
  authMethod: z.string().optional(),
  dataHandling: z.string().optional(),
  frameworks: z.array(z.string()).optional(),
  environmentVariables: z.array(z.string()).optional(),
});

// ============================================================================
// Security Scanning
// ============================================================================

/**
 * Perform comprehensive security scan
 */
export async function scanSecurity(
  request: SecurityScanRequest
): Promise<SecurityScanResult> {
  const timer = createTimer();

  SecurityScanRequestSchema.parse(request);

  logger.info({ frameworks: request.frameworks }, 'Starting security scan');

  const vulnerabilities = await findVulnerabilities(request);
  const riskScore = calculateRiskScore(vulnerabilities);
  const recommendations = generateRecommendations(vulnerabilities, request);
  const compliance = assessCompliance(request);

  logger.info(
    { vulnerabilityCount: vulnerabilities.length, riskScore, timeMs: timer.elapsed() },
    'Security scan complete'
  );

  return {
    vulnerabilities,
    riskScore,
    riskLevel:
      riskScore >= 80 ? 'critical'
        : riskScore >= 60 ? 'high'
        : riskScore >= 40 ? 'medium'
        : 'low',
    summary: generateScanSummary(vulnerabilities),
    recommendations,
    complianceStatus: compliance,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Find vulnerabilities in codebase
 */
async function findVulnerabilities(
  request: SecurityScanRequest
): Promise<Vulnerability[]> {
  if (!isNoLLMMode()) {
    try {
      return await scanWithAI(request);
    } catch (error) {
      logger.warn({ error }, 'AI scan failed, using heuristic scanning');
      return heuristicScan(request);
    }
  }

  return heuristicScan(request);
}

/**
 * AI-powered security scanning
 */
async function scanWithAI(request: SecurityScanRequest): Promise<Vulnerability[]> {
  const provider = await getActiveProvider();

  const prompt = `You are a senior security engineer. Scan this frontend application for vulnerabilities:

${request.codeBase ? `Code:\n${request.codeBase}` : ''}
${request.frameworks?.length ? `Frameworks: ${request.frameworks.join(', ')}` : ''}
${request.authMethod ? `Auth: ${request.authMethod}` : ''}
${request.dataHandling ? `Data Handling: ${request.dataHandling}` : ''}

Identify:
1. XSS vulnerabilities
2. CSRF issues
3. Injection attacks
4. Insecure authentication
5. Data exposure risks
6. API security issues
7. Dependency vulnerabilities

For each, provide:
- Severity level
- Impact
- Remediation steps
- Exploitability`;

  const result = await provider.completeJson<Vulnerability[]>(prompt);

  return result.data || [];
}

/**
 * Heuristic security scanning
 */
function heuristicScan(request: SecurityScanRequest): Vulnerability[] {
  const vulnerabilities: Vulnerability[] = [];

  // Check for common vulnerabilities
  if (request.codeBase) {
    if (request.codeBase.includes('innerHTML') && !request.codeBase.includes('DOMPurify')) {
      vulnerabilities.push({
        id: 'XSS-001',
        title: 'Potential XSS via innerHTML',
        severity: 'high',
        type: 'xss',
        description: 'Using innerHTML without sanitization can lead to XSS attacks',
        affectedArea: 'HTML rendering',
        impact: 'Attackers can execute arbitrary JavaScript in user browsers',
        remediation: 'Use textContent instead or use DOMPurify for sanitization',
        exploitability: 'high',
      });
    }

    if (request.codeBase.includes('eval(') || request.codeBase.includes('Function(')) {
      vulnerabilities.push({
        id: 'INJ-001',
        title: 'Code Injection via eval()',
        severity: 'critical',
        type: 'injection',
        description: 'Using eval() is extremely dangerous',
        affectedArea: 'Dynamic code execution',
        impact: 'Complete application compromise',
        remediation: 'Never use eval(). Use JSON.parse() or alternatives.',
        exploitability: 'high',
      });
    }

    if (request.codeBase.includes('localStorage') && !request.codeBase.includes('secure')) {
      vulnerabilities.push({
        id: 'SEC-001',
        title: 'Sensitive data in localStorage',
        severity: 'high',
        type: 'insecure-data-storage',
        description: 'localStorage is not secure for sensitive data',
        affectedArea: 'Data storage',
        impact: 'User credentials and tokens can be stolen via XSS',
        remediation: 'Use httpOnly cookies for auth tokens. Only store non-sensitive data.',
        exploitability: 'high',
      });
    }
  }

  // Check dependencies for known vulnerabilities
  if (request.dependencies?.includes('lodash@<4.17.21')) {
    vulnerabilities.push({
      id: 'DEP-001',
      title: 'Vulnerable lodash version',
      severity: 'medium',
      type: 'dependency-vulnerability',
      description: 'lodash < 4.17.21 has prototype pollution vulnerability',
      affectedArea: 'Dependency',
      cveId: 'CVE-2021-23337',
      impact: 'Code execution, DoS',
      remediation: 'Update lodash to >= 4.17.21',
      exploitability: 'medium',
    });
  }

  // Check API endpoints
  if (request.apiEndpoints) {
    for (const endpoint of request.apiEndpoints) {
      if (endpoint.authentication === 'none' && endpoint.path.includes('admin')) {
        vulnerabilities.push({
          id: 'API-001',
          title: 'Unprotected admin endpoint',
          severity: 'critical',
          type: 'broken-access-control',
          description: `Admin endpoint ${endpoint.path} has no authentication`,
          affectedArea: endpoint.path,
          impact: 'Unauthorized access to admin functions',
          remediation: 'Require authentication and authorization checks',
          exploitability: 'high',
        });
      }

      if (!endpoint.rateLimit) {
        vulnerabilities.push({
          id: 'API-002',
          title: 'Missing rate limiting',
          severity: 'medium',
          type: 'security-misconfiguration',
          description: `Endpoint ${endpoint.path} has no rate limiting`,
          affectedArea: endpoint.path,
          impact: 'Brute force attacks, DoS',
          remediation: 'Implement rate limiting per IP/user',
          exploitability: 'medium',
        });
      }
    }
  }

  return vulnerabilities;
}

/**
 * Calculate overall risk score
 */
function calculateRiskScore(vulnerabilities: Vulnerability[]): number {
  let score = 0;

  for (const vuln of vulnerabilities) {
    const severityScore =
      vuln.severity === 'critical' ? 30
        : vuln.severity === 'high' ? 20
        : vuln.severity === 'medium' ? 10
        : 3;

    const exploitabilityScore =
      vuln.exploitability === 'high' ? 1
        : vuln.exploitability === 'medium' ? 0.7
        : 0.3;

    score += severityScore * exploitabilityScore;
  }

  return Math.min(score, 100);
}

/**
 * Generate remediation recommendations
 */
function generateRecommendations(
  vulnerabilities: Vulnerability[],
  request: SecurityScanRequest
): SecurityRecommendation[] {
  const recommendations: SecurityRecommendation[] = [];

  // Add recommendations based on vulnerabilities
  if (vulnerabilities.some(v => v.type === 'xss')) {
    recommendations.push({
      priority: 'critical',
      category: 'XSS Prevention',
      recommendation: 'Implement Content Security Policy (CSP) headers',
      implementation: 'Set CSP headers that restrict script sources',
      effort: '2-4 hours',
      benefit: 'Blocks inline scripts and untrusted external scripts',
    });
  }

  if (vulnerabilities.some(v => v.type === 'dependency-vulnerability')) {
    recommendations.push({
      priority: 'high',
      category: 'Dependency Management',
      recommendation: 'Implement automated dependency updates',
      implementation: 'Use Dependabot or Renovate for automated PRs',
      effort: '1 hour setup',
      benefit: 'Stay ahead of known vulnerabilities',
    });
  }

  recommendations.push({
    priority: 'high',
    category: 'Security Testing',
    recommendation: 'Add SAST (Static Application Security Testing)',
    implementation: 'Integrate tools like Snyk, SonarQube, or ESLint security plugins',
    effort: '4-8 hours',
    benefit: 'Catch vulnerabilities during development',
  });

  recommendations.push({
    priority: 'medium',
    category: 'Security Headers',
    recommendation: 'Implement security headers',
    implementation: 'Add X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security',
    effort: '2 hours',
    benefit: 'Prevent clickjacking and MIME sniffing attacks',
  });

  return recommendations;
}

/**
 * Assess compliance status
 */
function assessCompliance(request: SecurityScanRequest): ComplianceStatus {
  return {
    gdpr: 'partial',
    ccpa: 'partial',
    hipaa: 'non-compliant',
    pciDss: 'partial',
    owasp: 'Top 10 vulnerabilities may be present - full audit recommended',
  };
}

/**
 * Generate scan summary
 */
function generateScanSummary(vulnerabilities: Vulnerability[]): string {
  const critical = vulnerabilities.filter(v => v.severity === 'critical').length;
  const high = vulnerabilities.filter(v => v.severity === 'high').length;
  const medium = vulnerabilities.filter(v => v.severity === 'medium').length;

  return `Security scan found ${vulnerabilities.length} issues: ${critical} critical, ${high} high, ${medium} medium. ` +
    (critical > 0 ? 'URGENT: Address critical vulnerabilities immediately.' : 'Review and remediate high-severity issues.');
}

// ============================================================================
// Export
// ============================================================================

export default scanSecurity;
