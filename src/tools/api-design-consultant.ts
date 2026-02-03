/**
 * Atlas Server - API Design Consultant
 * 
 * Advanced API design analysis and optimization
 * - RESTful design review
 * - GraphQL vs REST analysis
 * - Error handling patterns
 * - Versioning strategies
 * - Rate limiting and throttling
 * - API documentation generation
 * - Pagination and filtering strategies
 * 
 * @module api-design-consultant
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface ApiDesignRequest {
  apiType?: 'rest' | 'graphql' | 'grpc' | 'webhook';
  endpoints?: ApiEndpoint[];
  schema?: string;
  errorHandling?: string;
  authentication?: string;
  documentation?: string;
  currentIssues?: string[];
  scalability?: 'low' | 'medium' | 'high' | 'enterprise';
  clientTypes?: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description?: string;
  requestBody?: string;
  responseBody?: string;
  statusCodes?: Record<number, string>;
  rateLimit?: string;
  authentication?: string;
}

export interface ApiDesignAnalysis {
  currentDesign: string;
  issues: DesignIssue[];
  recommendations: DesignRecommendation[];
  patterns: RecommendedPattern[];
  errorHandling: ErrorHandlingGuide;
  documentationTemplate: string;
  bestPractices: BestPractice[];
}

export interface DesignIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  issue: string;
  impact: string;
  affectedEndpoints: string[];
}

export interface DesignRecommendation {
  area: string;
  currentPractice: string;
  recommendation: string;
  implementation: string;
  benefit: string;
  effort: string;
}

export interface RecommendedPattern {
  pattern: string;
  description: string;
  implementation: string;
  example: string;
  suitability: number; // 1-10
}

export interface ErrorHandlingGuide {
  standardErrorFormat: string;
  statusCodeMapping: Record<number, string>;
  errorResponses: ErrorResponse[];
  retryStrategy: string;
}

export interface ErrorResponse {
  status: number;
  type: string;
  meaning: string;
  clientAction: string;
}

export interface BestPractice {
  title: string;
  description: string;
  reasoning: string;
  example: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

const ApiDesignRequestSchema = z.object({
  apiType: z.enum(['rest', 'graphql', 'grpc', 'webhook']).optional(),
  endpoints: z.array(z.object({
    method: z.string(),
    path: z.string(),
    description: z.string().optional(),
    requestBody: z.string().optional(),
    responseBody: z.string().optional(),
    statusCodes: z.record(z.number(), z.string()).optional(),
    rateLimit: z.string().optional(),
    authentication: z.string().optional(),
  })).optional(),
  schema: z.string().optional(),
  errorHandling: z.string().optional(),
  authentication: z.string().optional(),
  documentation: z.string().optional(),
  currentIssues: z.array(z.string()).optional(),
  scalability: z.enum(['low', 'medium', 'high', 'enterprise']).optional(),
  clientTypes: z.array(z.string()).optional(),
});

// ============================================================================
// Analysis
// ============================================================================

/**
 * Analyze and design API
 */
export async function designApi(
  request: ApiDesignRequest
): Promise<ApiDesignAnalysis> {
  const timer = createTimer();

  ApiDesignRequestSchema.parse(request);

  logger.info(
    { apiType: request.apiType, endpointCount: request.endpoints?.length },
    'Starting API design analysis'
  );

  const issues = identifyDesignIssues(request);
  const recommendations = generateDesignRecommendations(request);
  const patterns = getRecommendedPatterns(request);
  const errorGuide = createErrorHandlingGuide(request);
  const docTemplate = generateDocumentationTemplate(request);
  const bestPractices = getBestPractices(request);

  logger.info({ timeMs: timer.elapsed() }, 'API design analysis complete');

  return {
    currentDesign: request.apiType || 'Not specified',
    issues,
    recommendations,
    patterns,
    errorHandling: errorGuide,
    documentationTemplate: docTemplate,
    bestPractices,
  };
}

/**
 * Identify API design issues
 */
function identifyDesignIssues(request: ApiDesignRequest): DesignIssue[] {
  const issues: DesignIssue[] = [];

  if (request.endpoints) {
    for (const endpoint of request.endpoints) {
      if (!endpoint.authentication) {
        issues.push({
          severity: 'critical',
          category: 'Security',
          issue: `Endpoint ${endpoint.path} has no authentication`,
          impact: 'Unauthorized access, data exposure',
          affectedEndpoints: [endpoint.path],
        });
      }

      if (endpoint.method === 'GET' && endpoint.path.includes('delete')) {
        issues.push({
          severity: 'high',
          category: 'RESTful Design',
          issue: `GET method used for delete operation (${endpoint.path})`,
          impact: 'Violates REST principles, can cause accidental deletions',
          affectedEndpoints: [endpoint.path],
        });
      }

      if (!endpoint.statusCodes || Object.keys(endpoint.statusCodes).length === 0) {
        issues.push({
          severity: 'medium',
          category: 'Documentation',
          issue: `No status codes documented for ${endpoint.path}`,
          impact: 'Clients unclear on possible responses',
          affectedEndpoints: [endpoint.path],
        });
      }
    }
  }

  if (request.errorHandling?.toLowerCase().includes('generic error')) {
    issues.push({
      severity: 'high',
      category: 'Error Handling',
      issue: 'Generic error messages without context',
      impact: 'Difficult for clients to handle errors appropriately',
      affectedEndpoints: ['All'],
    });
  }

  if (!request.documentation) {
    issues.push({
      severity: 'medium',
      category: 'Documentation',
      issue: 'No API documentation',
      impact: 'Slow onboarding, inconsistent client implementations',
      affectedEndpoints: ['All'],
    });
  }

  return issues;
}

/**
 * Generate API design recommendations
 */
function generateDesignRecommendations(request: ApiDesignRequest): DesignRecommendation[] {
  return [
    {
      area: 'Consistency',
      currentPractice: 'Inconsistent endpoint naming',
      recommendation: 'Use consistent kebab-case for all endpoints',
      implementation: '/api/v1/user-profiles instead of /api/v1/userprofiles',
      benefit: 'Easy to predict endpoints, better DX',
      effort: '2-4 hours',
    },
    {
      area: 'Pagination',
      currentPractice: 'No pagination strategy',
      recommendation: 'Implement cursor or offset-based pagination',
      implementation: 'Use ?page=1&limit=20 or ?cursor=abc&limit=20',
      benefit: 'Scalability, reduced server load',
      effort: '4-8 hours',
    },
    {
      area: 'Versioning',
      currentPractice: 'No versioning strategy',
      recommendation: 'Use URL-based versioning: /api/v1/, /api/v2/',
      implementation: 'Include major version in URL path',
      benefit: 'Backward compatibility, smooth transitions',
      effort: '1-2 weeks',
    },
    {
      area: 'Error Handling',
      currentPractice: 'Inconsistent error formats',
      recommendation: 'Standardize error response format',
      implementation: '{ "error": { "code": "INVALID_INPUT", "message": "..." } }',
      benefit: 'Predictable client error handling',
      effort: '4-6 hours',
    },
    {
      area: 'Rate Limiting',
      currentPractice: 'No rate limiting',
      recommendation: 'Implement rate limiting per IP/user',
      implementation: 'Add RateLimit-Limit, RateLimit-Remaining headers',
      benefit: 'Prevent abuse, fair usage',
      effort: '4-8 hours',
    },
    {
      area: 'Caching',
      currentPractice: 'No caching headers',
      recommendation: 'Add cache-control headers',
      implementation: 'Cache-Control: max-age=3600, public',
      benefit: '40-60% reduction in server load',
      effort: '2-4 hours',
    },
  ];
}

/**
 * Get recommended patterns
 */
function getRecommendedPatterns(request: ApiDesignRequest): RecommendedPattern[] {
  const patterns: RecommendedPattern[] = [];

  // REST patterns
  if (request.apiType === 'rest' || !request.apiType) {
    patterns.push({
      pattern: 'Resource-Oriented Design',
      description: 'Design endpoints around resources, not actions',
      implementation: 'POST /api/v1/users (create), GET /api/v1/users/:id (read)',
      example: 'POST /api/v1/orders, GET /api/v1/orders/:id, DELETE /api/v1/orders/:id',
      suitability: 9,
    });

    patterns.push({
      pattern: 'HATEOAS',
      description: 'Include links to related resources in responses',
      implementation: 'Response includes _links with next, prev, self',
      example: '{ "data": {...}, "_links": { "self": "/api/v1/users/1", "posts": "/api/v1/users/1/posts" } }',
      suitability: 7,
    });
  }

  // GraphQL patterns
  if (request.apiType === 'graphql') {
    patterns.push({
      pattern: 'Efficient Data Fetching',
      description: 'Clients request only needed fields',
      implementation: 'Query { user { name email } }',
      example: 'Reduces payload by 30-50% compared to REST',
      suitability: 10,
    });

    patterns.push({
      pattern: 'Batch Loading',
      description: 'Prevent N+1 query problems with DataLoaders',
      implementation: 'Use facebook/dataloader or similar',
      example: 'Single query resolves multiple related objects efficiently',
      suitability: 9,
    });
  }

  // General patterns
  patterns.push({
    pattern: 'API Key & OAuth2',
    description: 'Secure authentication for different client types',
    implementation: 'API Key for simple auth, OAuth2 for delegation',
    example: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...',
    suitability: 10,
  });

  patterns.push({
    pattern: 'Async Operations',
    description: 'Handle long-running operations with polling or webhooks',
    implementation: 'Return 202 Accepted, provide status endpoint',
    example: 'POST /api/v1/exports returns location to check status',
    suitability: 8,
  });

  return patterns;
}

/**
 * Create error handling guide
 */
function createErrorHandlingGuide(request: ApiDesignRequest): ErrorHandlingGuide {
  return {
    standardErrorFormat: `{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": "Additional context",
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req-123"
  }
}`,
    statusCodeMapping: {
      200: 'OK - Request succeeded',
      201: 'Created - Resource created',
      204: 'No Content - Success, no body',
      400: 'Bad Request - Client error',
      401: 'Unauthorized - Authentication required',
      403: 'Forbidden - Insufficient permissions',
      404: 'Not Found - Resource not found',
      429: 'Too Many Requests - Rate limited',
      500: 'Internal Server Error - Server error',
      503: 'Service Unavailable - Maintenance',
    },
    errorResponses: [
      {
        status: 400,
        type: 'INVALID_INPUT',
        meaning: 'Request body or parameters invalid',
        clientAction: 'Validate input and retry',
      },
      {
        status: 401,
        type: 'UNAUTHORIZED',
        meaning: 'Authentication failed or missing',
        clientAction: 'Prompt user to login',
      },
      {
        status: 429,
        type: 'RATE_LIMITED',
        meaning: 'Too many requests',
        clientAction: 'Wait and retry with exponential backoff',
      },
      {
        status: 500,
        type: 'SERVER_ERROR',
        meaning: 'Unexpected server error',
        clientAction: 'Retry later or contact support',
      },
    ],
    retryStrategy: `Implement exponential backoff:
1st attempt: immediately
2nd attempt: after 1 second
3rd attempt: after 2 seconds
4th attempt: after 4 seconds
Max retries: 5`,
  };
}

/**
 * Generate documentation template
 */
function generateDocumentationTemplate(request: ApiDesignRequest): string {
  return `# API Documentation

## Overview
Brief description of the API and its purpose.

## Authentication
Explain authentication method (API Key, OAuth2, JWT, etc.)

## Base URL
\`https://api.example.com/v1\`

## Rate Limiting
- Requests per minute: 60
- Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining

## Endpoints

### Users
- POST /users - Create user
- GET /users - List users
- GET /users/:id - Get user
- PATCH /users/:id - Update user
- DELETE /users/:id - Delete user

## Error Handling
Standard error format and common status codes.

## Best Practices
- Always include request ID for debugging
- Use pagination for large datasets
- Implement retry logic with exponential backoff
- Cache responses where appropriate`;
}

/**
 * Get API best practices
 */
function getBestPractices(request: ApiDesignRequest): BestPractice[] {
  return [
    {
      title: 'Use Semantic HTTP Status Codes',
      description: 'Use appropriate 2xx, 4xx, and 5xx status codes',
      reasoning: 'Clients can handle responses appropriately without parsing body',
      example: '201 Created for successful POST, 400 Bad Request for validation errors',
    },
    {
      title: 'Include Request IDs',
      description: 'Return unique request ID in response headers',
      reasoning: 'Essential for debugging and tracing requests across systems',
      example: 'X-Request-ID: req-abc123-xyz789',
    },
    {
      title: 'Implement Pagination',
      description: 'Always paginate large datasets',
      reasoning: 'Prevents server overload and improves response times',
      example: '?page=2&limit=50 or ?cursor=abc&limit=50',
    },
    {
      title: 'Version Your API',
      description: 'Include version in URL path',
      reasoning: 'Allows breaking changes without disrupting existing clients',
      example: '/api/v1/, /api/v2/',
    },
    {
      title: 'Provide Clear Error Messages',
      description: 'Include error code and actionable message',
      reasoning: 'Helps developers fix issues quickly',
      example: '{ "error": { "code": "INVALID_EMAIL", "message": "Email format invalid" } }',
    },
  ];
}

// ============================================================================
// Export
// ============================================================================

export default designApi;
