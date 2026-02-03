/**
 * API Integration Helper
 * 
 * Helps frontend developers integrate with backend APIs:
 * - Generates TypeScript types from API responses
 * - Creates React Query / SWR / TanStack Query hooks
 * - Generates mock data for testing
 * - Creates error handling wrappers
 * - Builds API client with interceptors
 * - Generates OpenAPI types
 * - Creates Zod validation schemas
 */

import { z } from 'zod';
import { getActiveProvider } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
  requestBody?: Record<string, any>;
  responseBody: Record<string, any>;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

export interface APIIntegrationRequest {
  endpoints: APIEndpoint[];
  baseUrl: string;
  library: 'react-query' | 'swr' | 'axios' | 'fetch' | 'tanstack-query';
  generateTypes?: boolean;
  generateMocks?: boolean;
  generateZodSchemas?: boolean;
  authType?: 'bearer' | 'api-key' | 'basic' | 'oauth2' | 'none';
  framework?: 'react' | 'vue' | 'svelte' | 'next';
}

export interface GeneratedIntegration {
  types: string;
  hooks: string;
  apiClient: string;
  mocks?: string;
  zodSchemas?: string;
  errorHandling: string;
  usageExamples: string;
  testingGuide: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

export const APIEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  description: z.string().optional(),
  requestBody: z.record(z.any()).optional(),
  responseBody: z.record(z.any()),
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional()
});

export const APIIntegrationRequestSchema = z.object({
  endpoints: z.array(APIEndpointSchema).min(1),
  baseUrl: z.string().url(),
  library: z.enum(['react-query', 'swr', 'axios', 'fetch', 'tanstack-query']),
  generateTypes: z.boolean().optional().default(true),
  generateMocks: z.boolean().optional().default(true),
  generateZodSchemas: z.boolean().optional().default(true),
  authType: z.enum(['bearer', 'api-key', 'basic', 'oauth2', 'none']).optional().default('bearer'),
  framework: z.enum(['react', 'vue', 'svelte', 'next']).optional().default('react')
});

// ============================================================================
// Type Inference Helpers
// ============================================================================

function inferTypeFromValue(value: any, key: string = ''): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  const type = typeof value;
  
  if (type === 'string') {
    // Check for common patterns
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'string'; // Date ISO string
    if (/^[a-f0-9-]{36}$/i.test(value)) return 'string'; // UUID
    if (value.includes('@')) return 'string'; // Email
    return 'string';
  }
  
  if (type === 'number') {
    return Number.isInteger(value) ? 'number' : 'number';
  }
  
  if (type === 'boolean') return 'boolean';
  
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const itemType = inferTypeFromValue(value[0], key);
    return `${itemType}[]`;
  }
  
  if (type === 'object') {
    return 'object'; // Will be expanded later
  }
  
  return 'unknown';
}

function generateTypeFromObject(obj: Record<string, any>, name: string, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  
  lines.push(`${indent}export interface ${name} {`);
  
  for (const [key, value] of Object.entries(obj)) {
    const isOptional = key.endsWith('?') || value === null;
    const cleanKey = key.replace('?', '');
    const optionalMark = isOptional ? '?' : '';
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object - generate inline or reference
      const nestedType = `${name}${toPascalCase(cleanKey)}`;
      lines.push(`${indent}  ${cleanKey}${optionalMark}: ${nestedType};`);
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      // Array of objects
      const itemType = `${name}${toPascalCase(cleanKey)}Item`;
      lines.push(`${indent}  ${cleanKey}${optionalMark}: ${itemType}[];`);
    } else {
      const inferredType = inferTypeFromValue(value, cleanKey);
      lines.push(`${indent}  ${cleanKey}${optionalMark}: ${inferredType};`);
    }
  }
  
  lines.push(`${indent}}`);
  
  // Generate nested interfaces
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = key.replace('?', '');
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      lines.push('');
      lines.push(generateTypeFromObject(value, `${name}${toPascalCase(cleanKey)}`, depth));
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      lines.push('');
      lines.push(generateTypeFromObject(value[0], `${name}${toPascalCase(cleanKey)}Item`, depth));
    }
  }
  
  return lines.join('\n');
}

// ============================================================================
// Main Functions
// ============================================================================

export async function generateAPIIntegration(request: APIIntegrationRequest): Promise<GeneratedIntegration> {
  const validated = APIIntegrationRequestSchema.parse(request);
  logger.info(`Generating API integration for ${validated.endpoints.length} endpoints`);

  // Generate TypeScript types
  const types = generateTypes(validated.endpoints);

  // Generate API client
  const apiClient = generateAPIClient(validated);

  // Generate hooks based on library
  const hooks = generateHooks(validated);

  // Generate error handling
  const errorHandling = generateErrorHandling(validated);

  // Generate mocks if requested
  const mocks = validated.generateMocks ? generateMocks(validated.endpoints) : undefined;

  // Generate Zod schemas if requested
  const zodSchemas = validated.generateZodSchemas ? generateZodSchemas(validated.endpoints) : undefined;

  // Generate usage examples
  const usageExamples = generateUsageExamples(validated);

  // Generate testing guide
  const testingGuide = generateTestingGuide(validated);

  return {
    types,
    hooks,
    apiClient,
    mocks,
    zodSchemas,
    errorHandling,
    usageExamples,
    testingGuide
  };
}

// ============================================================================
// Generator Functions
// ============================================================================

function generateTypes(endpoints: APIEndpoint[]): string {
  const types: string[] = [];
  
  types.push(`// ============================================================================`);
  types.push(`// API Types - Auto-generated`);
  types.push(`// ============================================================================`);
  types.push('');

  for (const endpoint of endpoints) {
    const pathName = pathToName(endpoint.path);
    
    // Request type (for POST, PUT, PATCH)
    if (endpoint.requestBody && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      types.push(generateTypeFromObject(endpoint.requestBody, `${pathName}Request`));
      types.push('');
    }
    
    // Response type
    types.push(generateTypeFromObject(endpoint.responseBody, `${pathName}Response`));
    types.push('');
    
    // Query params type
    if (endpoint.queryParams) {
      const queryInterface = Object.entries(endpoint.queryParams)
        .map(([key, desc]) => `  ${key}?: string; // ${desc}`)
        .join('\n');
      types.push(`export interface ${pathName}QueryParams {\n${queryInterface}\n}`);
      types.push('');
    }
  }

  // Add common types
  types.push(`// Common Types`);
  types.push(`export interface APIError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface APIResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}`);

  return types.join('\n');
}

function generateAPIClient(request: APIIntegrationRequest): string {
  const { baseUrl, authType } = request;

  return `// ============================================================================
// API Client - Auto-generated
// ============================================================================

const API_BASE_URL = '${baseUrl}';

// Token storage (use secure storage in production)
let authToken: string | null = null;

export const setAuthToken = (token: string) => {
  authToken = token;
};

export const clearAuthToken = () => {
  authToken = null;
};

// Request interceptor
const getHeaders = (customHeaders?: Record<string, string>): HeadersInit => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  ${authType === 'bearer' ? `if (authToken) {
    headers['Authorization'] = \`Bearer \${authToken}\`;
  }` : ''}
  ${authType === 'api-key' ? `if (authToken) {
    headers['X-API-Key'] = authToken;
  }` : ''}

  return headers;
};

// Response interceptor
const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
      code: 'UNKNOWN_ERROR',
      status: response.status,
    }));
    
    // Handle specific error codes
    if (response.status === 401) {
      // Token expired - trigger refresh or logout
      clearAuthToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    
    throw error;
  }
  
  return response.json();
};

// Generic request function
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = \`\${API_BASE_URL}\${endpoint}\`;
  
  const response = await fetch(url, {
    ...options,
    headers: getHeaders(options.headers as Record<string, string>),
  });
  
  return handleResponse<T>(response);
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, params?: Record<string, string>) => {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiRequest<T>(\`\${endpoint}\${queryString}\`, { method: 'GET' });
  },
  
  post: <T>(endpoint: string, data?: unknown) => {
    return apiRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
  
  put: <T>(endpoint: string, data?: unknown) => {
    return apiRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
  
  patch: <T>(endpoint: string, data?: unknown) => {
    return apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
  
  delete: <T>(endpoint: string) => {
    return apiRequest<T>(endpoint, { method: 'DELETE' });
  },
};

export default api;`;
}

function generateHooks(request: APIIntegrationRequest): string {
  const { library, endpoints } = request;

  switch (library) {
    case 'react-query':
    case 'tanstack-query':
      return generateTanStackQueryHooks(endpoints);
    case 'swr':
      return generateSWRHooks(endpoints);
    default:
      return generateFetchHooks(endpoints);
  }
}

function generateTanStackQueryHooks(endpoints: APIEndpoint[]): string {
  const hooks: string[] = [];
  
  hooks.push(`// ============================================================================`);
  hooks.push(`// React Query / TanStack Query Hooks - Auto-generated`);
  hooks.push(`// ============================================================================`);
  hooks.push('');
  hooks.push(`import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';`);
  hooks.push(`import { api } from './api-client';`);
  hooks.push(`import type { ${endpoints.map(e => `${pathToName(e.path)}Response`).join(', ')} } from './types';`);
  hooks.push('');
  hooks.push(`// Query Keys`);
  hooks.push(`export const queryKeys = {`);
  
  for (const endpoint of endpoints) {
    const name = pathToName(endpoint.path);
    const keyName = toCamelCase(name);
    hooks.push(`  ${keyName}: ['${keyName}'] as const,`);
  }
  hooks.push(`};`);
  hooks.push('');

  for (const endpoint of endpoints) {
    const name = pathToName(endpoint.path);
    const hookName = toCamelCase(name);
    
    if (endpoint.method === 'GET') {
      hooks.push(`// ${endpoint.description || `Fetch ${name}`}
export function use${name}(${hasPathParams(endpoint.path) ? 'id: string, ' : ''}options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.${hookName}${hasPathParams(endpoint.path) ? ', id' : ''}],
    queryFn: () => api.get<${name}Response>('${endpoint.path}'${hasPathParams(endpoint.path) ? '.replace(":id", id)' : ''}),
    ...options,
  });
}
`);
    } else if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      const inputType = endpoint.requestBody ? `${name}Request` : 'unknown';
      hooks.push(`// ${endpoint.description || `${endpoint.method} ${name}`}
export function use${name}Mutation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: ${inputType}) => 
      api.${endpoint.method.toLowerCase()}<${name}Response>('${endpoint.path}', data),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.${hookName} });
    },
  });
}
`);
    } else if (endpoint.method === 'DELETE') {
      hooks.push(`// ${endpoint.description || `Delete ${name}`}
export function useDelete${name}() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => 
      api.delete<${name}Response>(\`${endpoint.path.replace(':id', '${id}')}\`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${hookName} });
    },
  });
}
`);
    }
  }

  return hooks.join('\n');
}

function generateSWRHooks(endpoints: APIEndpoint[]): string {
  const hooks: string[] = [];
  
  hooks.push(`// ============================================================================`);
  hooks.push(`// SWR Hooks - Auto-generated`);
  hooks.push(`// ============================================================================`);
  hooks.push('');
  hooks.push(`import useSWR from 'swr';`);
  hooks.push(`import useSWRMutation from 'swr/mutation';`);
  hooks.push(`import { api } from './api-client';`);
  hooks.push('');
  
  hooks.push(`// SWR Fetcher`);
  hooks.push(`const fetcher = <T>(url: string): Promise<T> => api.get<T>(url);`);
  hooks.push('');

  for (const endpoint of endpoints) {
    const name = pathToName(endpoint.path);
    const hookName = toCamelCase(name);
    
    if (endpoint.method === 'GET') {
      hooks.push(`// ${endpoint.description || `Fetch ${name}`}
export function use${name}(${hasPathParams(endpoint.path) ? 'id: string' : ''}) {
  return useSWR<${name}Response>(
    ${hasPathParams(endpoint.path) ? `id ? \`${endpoint.path.replace(':id', '${id}')}\` : null` : `'${endpoint.path}'`},
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );
}
`);
    } else if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      hooks.push(`// ${endpoint.description || `${endpoint.method} ${name}`}
export function use${name}Mutation() {
  return useSWRMutation(
    '${endpoint.path}',
    (url: string, { arg }: { arg: ${name}Request }) => 
      api.${endpoint.method.toLowerCase()}<${name}Response>(url, arg)
  );
}
`);
    }
  }

  return hooks.join('\n');
}

function generateFetchHooks(endpoints: APIEndpoint[]): string {
  const hooks: string[] = [];
  
  hooks.push(`// ============================================================================`);
  hooks.push(`// Custom Fetch Hooks - Auto-generated`);
  hooks.push(`// ============================================================================`);
  hooks.push('');
  hooks.push(`import { useState, useEffect, useCallback } from 'react';`);
  hooks.push(`import { api } from './api-client';`);
  hooks.push('');

  hooks.push(`// Generic fetch hook
interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useFetch<T>(fetchFn: () => Promise<T>): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
`);

  for (const endpoint of endpoints) {
    const name = pathToName(endpoint.path);
    
    if (endpoint.method === 'GET') {
      hooks.push(`// ${endpoint.description || `Fetch ${name}`}
export function use${name}(${hasPathParams(endpoint.path) ? 'id: string' : ''}) {
  return useFetch(() => api.get<${name}Response>('${endpoint.path}'${hasPathParams(endpoint.path) ? '.replace(":id", id)' : ''}));
}
`);
    }
  }

  return hooks.join('\n');
}

function generateErrorHandling(request: APIIntegrationRequest): string {
  return `// ============================================================================
// Error Handling - Auto-generated
// ============================================================================

import { toast } from 'sonner'; // or your preferred toast library

export interface APIError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, string[]>;
}

// Error codes mapping
const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Unable to connect. Please check your internet connection.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You don\\'t have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  SERVER_ERROR: 'Something went wrong. Please try again later.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
};

// Error handler
export function handleAPIError(error: APIError): void {
  const message = ERROR_MESSAGES[error.code] || error.message || ERROR_MESSAGES.UNKNOWN_ERROR;
  
  // Show toast notification
  toast.error(message);
  
  // Log for debugging (remove in production)
  console.error('[API Error]', {
    code: error.code,
    message: error.message,
    status: error.status,
    details: error.details,
  });
  
  // Track error analytics
  // analytics.track('api_error', error);
}

// React Query error handler
export const queryErrorHandler = (error: unknown) => {
  if (isAPIError(error)) {
    handleAPIError(error);
  } else if (error instanceof Error) {
    handleAPIError({
      message: error.message,
      code: 'UNKNOWN_ERROR',
      status: 0,
    });
  }
};

// Type guard
function isAPIError(error: unknown): error is APIError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'code' in error
  );
}

// Retry logic
export const retryCondition = (failureCount: number, error: unknown): boolean => {
  // Don't retry on 4xx errors
  if (isAPIError(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  // Retry up to 3 times for server errors
  return failureCount < 3;
};

// React Query default options with error handling
export const queryClientConfig = {
  defaultOptions: {
    queries: {
      retry: retryCondition,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    },
    mutations: {
      retry: false,
      onError: queryErrorHandler,
    },
  },
};`;
}

function generateMocks(endpoints: APIEndpoint[]): string {
  const mocks: string[] = [];
  
  mocks.push(`// ============================================================================`);
  mocks.push(`// Mock Data - Auto-generated`);
  mocks.push(`// ============================================================================`);
  mocks.push('');
  mocks.push(`import { http, HttpResponse } from 'msw';`);
  mocks.push('');
  
  mocks.push(`// Mock Data Generators`);
  mocks.push(`const generateId = () => Math.random().toString(36).substr(2, 9);`);
  mocks.push(`const generateDate = () => new Date().toISOString();`);
  mocks.push('');

  // Generate mock data for each endpoint
  for (const endpoint of endpoints) {
    const name = pathToName(endpoint.path);
    const mockData = generateMockData(endpoint.responseBody, name);
    mocks.push(`export const mock${name} = ${mockData};`);
    mocks.push('');
  }

  // Generate MSW handlers
  mocks.push(`// MSW Handlers`);
  mocks.push(`export const handlers = [`);
  
  for (const endpoint of endpoints) {
    const name = pathToName(endpoint.path);
    const method = endpoint.method.toLowerCase();
    const path = endpoint.path.replace(/:(\w+)/g, ':$1'); // MSW path format
    
    mocks.push(`  http.${method}('${path}', () => {
    return HttpResponse.json(mock${name});
  }),`);
  }
  
  mocks.push(`];`);
  mocks.push('');

  // Add MSW setup
  mocks.push(`// MSW Setup (add to your test setup file)
/*
import { setupServer } from 'msw/node';
import { handlers } from './mocks';

export const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
*/`);

  return mocks.join('\n');
}

function generateMockData(obj: Record<string, any>, prefix: string): string {
  const mockObj: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      if (key.toLowerCase().includes('id')) {
        mockObj[key] = 'mock-id-123';
      } else if (key.toLowerCase().includes('email')) {
        mockObj[key] = 'user@example.com';
      } else if (key.toLowerCase().includes('name')) {
        mockObj[key] = 'John Doe';
      } else if (key.toLowerCase().includes('date') || key.toLowerCase().includes('at')) {
        mockObj[key] = new Date().toISOString();
      } else {
        mockObj[key] = `Mock ${key}`;
      }
    } else if (typeof value === 'number') {
      mockObj[key] = 42;
    } else if (typeof value === 'boolean') {
      mockObj[key] = true;
    } else if (Array.isArray(value)) {
      mockObj[key] = value.length > 0 ? [generateMockData(value[0], key)] : [];
    } else if (typeof value === 'object' && value !== null) {
      mockObj[key] = JSON.parse(generateMockData(value, key));
    }
  }
  
  return JSON.stringify(mockObj, null, 2);
}

function generateZodSchemas(endpoints: APIEndpoint[]): string {
  const schemas: string[] = [];
  
  schemas.push(`// ============================================================================`);
  schemas.push(`// Zod Validation Schemas - Auto-generated`);
  schemas.push(`// ============================================================================`);
  schemas.push('');
  schemas.push(`import { z } from 'zod';`);
  schemas.push('');

  for (const endpoint of endpoints) {
    const name = pathToName(endpoint.path);
    
    // Response schema
    schemas.push(`export const ${name}ResponseSchema = ${generateZodSchema(endpoint.responseBody)};`);
    schemas.push(`export type ${name}Response = z.infer<typeof ${name}ResponseSchema>;`);
    schemas.push('');
    
    // Request schema (for mutations)
    if (endpoint.requestBody && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      schemas.push(`export const ${name}RequestSchema = ${generateZodSchema(endpoint.requestBody)};`);
      schemas.push(`export type ${name}Request = z.infer<typeof ${name}RequestSchema>;`);
      schemas.push('');
    }
  }

  // Add validation helper
  schemas.push(`// Validation helper
export function validateResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error('Validation error:', result.error.format());
    throw new Error('Invalid API response');
  }
  return result.data;
}`);

  return schemas.join('\n');
}

function generateZodSchema(obj: Record<string, any>): string {
  const fields: string[] = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const isOptional = key.endsWith('?');
    const cleanKey = key.replace('?', '');
    let zodType: string;
    
    if (typeof value === 'string') {
      zodType = 'z.string()';
    } else if (typeof value === 'number') {
      zodType = 'z.number()';
    } else if (typeof value === 'boolean') {
      zodType = 'z.boolean()';
    } else if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object') {
        zodType = `z.array(${generateZodSchema(value[0])})`;
      } else {
        zodType = 'z.array(z.unknown())';
      }
    } else if (typeof value === 'object' && value !== null) {
      zodType = generateZodSchema(value);
    } else {
      zodType = 'z.unknown()';
    }
    
    if (isOptional) {
      zodType += '.optional()';
    }
    
    fields.push(`  ${cleanKey}: ${zodType}`);
  }
  
  return `z.object({\n${fields.join(',\n')}\n})`;
}

function generateUsageExamples(request: APIIntegrationRequest): string {
  const { library, endpoints, framework } = request;
  
  const example = endpoints[0];
  if (!example) {
    return '// No endpoints provided for usage examples';
  }
  const name = pathToName(example.path);

  if (library === 'react-query' || library === 'tanstack-query') {
    return `// ============================================================================
// Usage Examples - React Query / TanStack Query
// ============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { use${name} } from './hooks';

// 1. Setup Query Client
const queryClient = new QueryClient(queryClientConfig);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  );
}

// 2. Use in Component
function ${name}List() {
  const { data, isLoading, error, refetch } = use${name}();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      {/* Render your data */}
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <button onClick={() => refetch()}>Refresh</button>
    </div>
  );
}

// 3. Mutations
function Create${name}Form() {
  const mutation = use${name}Mutation();
  
  const handleSubmit = (data) => {
    mutation.mutate(data, {
      onSuccess: () => {
        toast.success('Created successfully!');
      },
      onError: (error) => {
        handleAPIError(error);
      },
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Your form fields */}
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}`;
  }

  return `// See the generated hooks file for usage examples`;
}

function generateTestingGuide(request: APIIntegrationRequest): string {
  return `// ============================================================================
// Testing Guide - Auto-generated
// ============================================================================

/*
## 1. Setup MSW (Mock Service Worker)

npm install msw --save-dev

Create src/mocks/handlers.ts (use the generated mocks file)
Create src/mocks/browser.ts for browser
Create src/mocks/server.ts for tests

## 2. Testing Hooks

\`\`\`typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUsers } from './hooks';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useUsers', () => {
  it('fetches users successfully', async () => {
    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    });
    
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    
    expect(result.current.data).toBeDefined();
  });
  
  it('handles errors', async () => {
    // Override handler for this test
    server.use(
      http.get('/users', () => {
        return HttpResponse.json(
          { message: 'Not found' },
          { status: 404 }
        );
      })
    );
    
    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    });
    
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
\`\`\`

## 3. Integration Testing

Test the full flow including API client, hooks, and components together.

## 4. E2E Testing with Playwright

\`\`\`typescript
import { test, expect } from '@playwright/test';

test('loads and displays data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Loading...')).toBeVisible();
  await expect(page.getByText('John Doe')).toBeVisible();
});
\`\`\`
*/`;
}

// ============================================================================
// Utility Functions
// ============================================================================

function pathToName(path: string): string {
  return path
    .replace(/^\//, '')
    .replace(/\/:?\w+/g, '')
    .split(/[-_/]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function hasPathParams(path: string): boolean {
  return path.includes(':');
}

export default { generateAPIIntegration };
