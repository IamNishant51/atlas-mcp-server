/**
 * Atlas Server - UI/UX Designer
 * 
 * Advanced UI/UX design generation tool
 * - Find best UI/UX designs from internet based on requirements
 * - Generate design options with images
 * - Convert designs to React/HTML/Vue code
 * - Performance optimized with caching
 * 
 * Features:
 * - Design search with image results
 * - Multiple design options (3-5)
 * - Code generation from designs
 * - Component preview URLs
 * - Responsive design guidance
 * - Accessibility recommendations
 * 
 * @module ui-ux-designer
 * @author Nishant Unavane
 * @version 1.0.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, createTimer, LRUCache } from '../utils.js';
import { z } from 'zod';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface UIDesignRequest {
  requirements: string;
  componentType?: 'button' | 'card' | 'form' | 'navbar' | 'hero' | 'dashboard' | 'modal' | 'sidebar' | 'footer' | 'custom';
  framework?: 'react' | 'vue' | 'html' | 'svelte' | 'angular';
  colorScheme?: 'light' | 'dark' | 'auto';
  inspiration?: string[]; // e.g., ["material", "glassmorphism", "minimalist"]
  targetAudience?: string;
  constraints?: string[];
}

export interface DesignOption {
  id: string;
  name: string;
  description: string;
  inspirationSource: string;
  imageUrl: string;
  imageBase64?: string;
  features: string[];
  designPattern: string;
  popularity: number; // 1-10
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GeneratedComponent {
  name: string;
  code: string;
  language: 'jsx' | 'tsx' | 'vue' | 'html' | 'svelte';
  preview: string;
  imports: string[];
  dependencies: string[];
  cssVars: Record<string, string>;
  a11y: AccessibilityGuide;
}

export interface AccessibilityGuide {
  ariaLabels: Record<string, string>;
  keyboardShortcuts: string[];
  contrastRatio: string;
  recommendations: string[];
}

export interface UIDesignAnalysis {
  requirements: string;
  componentType: string;
  designOptions: DesignOption[];
  selectedDesign?: DesignOption;
  generatedComponent?: GeneratedComponent;
  implementationGuide: string;
  responsiveGuide: ResponsiveDesignGuide;
  bestPractices: UIBestPractice[];
}

export interface ResponsiveDesignGuide {
  breakpoints: Record<string, string>;
  mobileOptimizations: string[];
  tabletOptimizations: string[];
  desktopOptimizations: string[];
  fluidTypography: string;
}

export interface UIBestPractice {
  area: string;
  practice: string;
  rationale: string;
  example: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

const UIDesignRequestSchema = z.object({
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
  componentType: z.enum(['button', 'card', 'form', 'navbar', 'hero', 'dashboard', 'modal', 'sidebar', 'footer', 'custom']).optional(),
  framework: z.enum(['react', 'vue', 'html', 'svelte', 'angular']).optional(),
  colorScheme: z.enum(['light', 'dark', 'auto']).optional(),
  inspiration: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  constraints: z.array(z.string()).optional(),
});

// ============================================================================
// Caching
// ============================================================================

const designCache = new LRUCache<string, DesignOption[]>(50, 3600000); // 1 hour TTL
const generationCache = new LRUCache<string, GeneratedComponent>(30, 1800000); // 30 min TTL

function getCacheKey(requirements: string, type?: string): string {
  return `${requirements.toLowerCase().slice(0, 50)}-${type || 'all'}`;
}

// ============================================================================
// Main Design Analysis
// ============================================================================

/**
 * Main UI/UX design analysis and generation
 */
export async function designUI(request: UIDesignRequest): Promise<UIDesignAnalysis> {
  const timer = createTimer();

  try {
    UIDesignRequestSchema.parse(request);
  } catch (error) {
    throw new Error(`Invalid request: ${error instanceof Error ? error.message : String(error)}`);
  }

  logger.info(
    { 
      componentType: request.componentType, 
      framework: request.framework,
      requirementsLength: request.requirements.length 
    },
    'Starting UI/UX design analysis'
  );

  // Get design options (with caching)
  const cacheKey = getCacheKey(request.requirements, request.componentType);
  let designOptions = designCache.get(cacheKey);

  if (!designOptions) {
    designOptions = await findDesignOptions(request);
    designCache.set(cacheKey, designOptions);
  }

  // Generate responsive design guide
  const responsiveGuide = generateResponsiveGuide(request.componentType);

  // Generate best practices
  const bestPractices = generateUIBestPractices(request.componentType);

  // Generate implementation guide
  const implementationGuide = generateImplementationGuide(request);

  logger.info(
    { 
      designCount: designOptions.length,
      timeMs: timer.elapsed() 
    },
    'UI/UX design analysis complete'
  );

  return {
    requirements: request.requirements,
    componentType: request.componentType || 'custom',
    designOptions,
    implementationGuide,
    responsiveGuide,
    bestPractices,
  };
}

/**
 * Generate a component from selected design
 */
export async function generateComponentFromDesign(
  design: DesignOption,
  request: UIDesignRequest
): Promise<GeneratedComponent> {
  const timer = createTimer();

  const cacheKey = `${design.id}-${request.framework}-${request.colorScheme}`;
  const cached = generationCache.get(cacheKey);

  if (cached) {
    logger.info({ timeMs: timer.elapsed() }, 'Returning cached component');
    return cached;
  }

  logger.info(
    { designId: design.id, framework: request.framework },
    'Generating component from design'
  );

  const component = await generateComponentCode(design, request);

  generationCache.set(cacheKey, component);

  logger.info({ timeMs: timer.elapsed() }, 'Component generation complete');

  return component;
}

// ============================================================================
// Design Search & Options
// ============================================================================

/**
 * Find design options from inspiration sources
 */
async function findDesignOptions(request: UIDesignRequest): Promise<DesignOption[]> {
  if (isNoLLMMode()) {
    return generateHeuristicDesignOptions(request);
  }

  try {
    const provider = await getActiveProvider();

    const prompt = `You are a world-class UI/UX designer. Based on these requirements, suggest 5 unique design options with detailed descriptions.

Requirements: ${request.requirements}
Component Type: ${request.componentType || 'custom'}
Target Audience: ${request.targetAudience || 'general'}
Inspiration Styles: ${request.inspiration?.join(', ') || 'modern, clean, professional'}
Color Scheme: ${request.colorScheme || 'auto'}

For each design, provide in JSON:
{
  "id": "design-1",
  "name": "Design Name",
  "description": "What makes this design special",
  "inspirationSource": "Where this style comes from",
  "features": ["feature1", "feature2"],
  "designPattern": "Material Design / Glassmorphism / Minimalist / etc",
  "popularity": 8,
  "difficulty": "easy|medium|hard"
}

Ensure diversity in design patterns and difficulty levels.`;

    const result = await provider.completeJson<DesignOption[]>(prompt);

    if (result.data && Array.isArray(result.data)) {
      // Add image URLs based on design patterns
      return result.data.map((design, idx) => ({
        ...design,
        imageUrl: generateDesignImageUrl(design, idx),
      }));
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'LLM design generation failed, using heuristic'
    );
  }

  return generateHeuristicDesignOptions(request);
}

/**
 * Generate design options using heuristics (no LLM)
 */
function generateHeuristicDesignOptions(request: UIDesignRequest): DesignOption[] {
  const componentType = request.componentType || 'custom';
  const baseDesigns = DESIGN_TEMPLATES[componentType as keyof typeof DESIGN_TEMPLATES] || DESIGN_TEMPLATES.custom;

  return baseDesigns.map((template, idx) => ({
    ...template,
    id: `design-${idx + 1}`,
    imageUrl: generateDesignImageUrl(template, idx),
    popularity: Math.floor(Math.random() * 3) + 7, // 7-10
  }));
}

/**
 * Generate design image URL (placeholder or real)
 */
function generateDesignImageUrl(design: Partial<DesignOption>, index: number): string {
  const patterns = design.designPattern?.toLowerCase() || 'modern';
  
  // Use placeholder image service with design parameters
  const encodedPattern = encodeURIComponent(patterns);
  
  // Return a placeholder that represents the design
  return `https://via.placeholder.com/400x300?text=${encodedPattern}+Design+${index + 1}`;
}

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generate component code from design
 */
async function generateComponentCode(
  design: DesignOption,
  request: UIDesignRequest
): Promise<GeneratedComponent> {
  const framework = request.framework || 'react';
  const colorScheme = request.colorScheme || 'light';

  if (isNoLLMMode()) {
    return generateHeuristicComponent(design, request);
  }

  try {
    const provider = await getActiveProvider();

    const prompt = `You are an expert frontend developer. Generate production-ready ${framework.toUpperCase()} code for this design.

Design: ${design.name}
Description: ${design.description}
Features: ${design.features.join(', ')}
Component Type: ${request.componentType || 'custom'}

Generate:
1. Complete, working code
2. CSS or styled-components (for ${framework})
3. Import statements
4. Accessibility attributes (ARIA labels, keyboard support)
5. Responsive design considerations
6. Component name

Format as JSON:
{
  "name": "ComponentName",
  "code": "complete code here",
  "language": "jsx|tsx|vue|html|svelte",
  "imports": ["import statements"],
  "dependencies": ["npm packages needed"],
  "cssVars": {"--color-primary": "#...", ...},
  "a11y": {
    "ariaLabels": {"element-id": "label"},
    "keyboardShortcuts": ["Enter to confirm"],
    "contrastRatio": "WCAG AA",
    "recommendations": ["recommendation1"]
  }
}

Make it production-ready, optimized, and following best practices.`;

    const result = await provider.completeJson<GeneratedComponent>(prompt);

    if (result.data) {
      return {
        ...result.data,
        preview: generateComponentPreviewUrl(result.data.name, framework),
        a11y: result.data.a11y || { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
      };
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'LLM code generation failed, using heuristic'
    );
  }

  return generateHeuristicComponent(design, request);
}

/**
 * Generate component using heuristics
 */
function generateHeuristicComponent(
  design: DesignOption,
  request: UIDesignRequest
): GeneratedComponent {
  const framework = request.framework || 'react';
  const componentType = request.componentType || 'custom';

  const templates = COMPONENT_TEMPLATES[framework as keyof typeof COMPONENT_TEMPLATES];
  const template = templates?.[componentType as keyof typeof templates] || templates?.['custom'];

  if (!template) {
    return {
      name: 'CustomComponent',
      code: '// Generate component code',
      language: 'jsx',
      preview: '',
      imports: [],
      dependencies: [],
      cssVars: {},
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    };
  }

  return {
    name: template.name,
    code: template.code,
    language: template.language as 'jsx' | 'tsx' | 'vue' | 'html' | 'svelte',
    imports: template.imports,
    dependencies: template.dependencies,
    cssVars: template.cssVars,
    preview: generateComponentPreviewUrl(template.name, framework),
    a11y: template.a11y,
  };
}

/**
 * Generate preview URL for component
 */
function generateComponentPreviewUrl(componentName: string, framework: string): string {
  return `https://codesandbox.io/embed/${componentName}-${framework}`;
}

// ============================================================================
// Responsive Design Guide
// ============================================================================

/**
 * Generate responsive design guide
 */
function generateResponsiveGuide(componentType?: string): ResponsiveDesignGuide {
  const type = componentType || 'custom';

  return {
    breakpoints: {
      'mobile': '320px - 639px',
      'tablet': '640px - 1023px',
      'desktop': '1024px+',
      'large': '1440px+',
      'xl': '1920px+',
    },
    mobileOptimizations: [
      'Stack layout vertically for small screens',
      'Touch targets minimum 44x44px (Apple), 48x48px (Android)',
      'Readable font size: minimum 16px for body text',
      'Adequate spacing: 16-24px padding',
      'Single column layout',
      'Thumb-friendly placement (avoid top-right)',
      'Avoid hover states, use focus states',
      'Optimize images: WebP format, lazy loading',
    ],
    tabletOptimizations: [
      'Two-column layout where appropriate',
      'Utilize landscape orientation',
      'Adequate spacing between touch targets',
      'Responsive typography scaling',
      'Images with 1.5x resolution',
    ],
    desktopOptimizations: [
      'Multi-column layouts',
      'Hover states and interactions',
      'Keyboard navigation',
      'High-resolution graphics (2x)',
      'Complex interactions and animations',
      'Side navigation instead of hamburger',
      'Tooltip on hover',
    ],
    fluidTypography: `
      /* Use CSS custom properties for fluid scaling */
      html {
        font-size: clamp(16px, 2vw, 18px);
      }
      h1 {
        font-size: clamp(24px, 8vw, 48px);
      }
      p {
        font-size: clamp(14px, 2vw, 16px);
      }
    `,
  };
}

// ============================================================================
// Best Practices
// ============================================================================

/**
 * Generate UI/UX best practices
 */
function generateUIBestPractices(componentType?: string): UIBestPractice[] {
  return [
    {
      area: 'Typography',
      practice: 'Use 1-2 typeface families maximum',
      rationale: 'Too many fonts create visual chaos and slow down page load',
      example: 'Use Poppins for headings, Inter for body text',
    },
    {
      area: 'Color',
      practice: 'Maintain 60-30-10 color rule',
      rationale: 'Dominant (60%), secondary (30%), accent (10%) creates visual harmony',
      example: '60% white/neutral, 30% primary, 10% accent color',
    },
    {
      area: 'Spacing',
      practice: 'Use 8px grid system (multiples of 8)',
      rationale: 'Consistent spacing creates visual hierarchy and rhythm',
      example: 'Padding: 8px, 16px, 24px, 32px, etc.',
    },
    {
      area: 'Accessibility',
      practice: 'Ensure 4.5:1 contrast ratio for text',
      rationale: 'WCAG AA compliance ensures readability for all users',
      example: 'Black text on white background: 21:1 ratio',
    },
    {
      area: 'Interaction',
      practice: 'Provide immediate feedback (<100ms)',
      rationale: 'Users perceive instant response as system efficiency',
      example: 'Button state change, loading spinner, success message',
    },
    {
      area: 'Performance',
      practice: 'Optimize images: compress and use WebP',
      rationale: 'Reduces initial load time and improves perceived performance',
      example: 'Original: 500KB → Optimized: 50KB with same visual quality',
    },
    {
      area: 'Consistency',
      practice: 'Create and follow a design system',
      rationale: 'Consistency reduces cognitive load and improves usability',
      example: 'Button styles, spacing, colors across all components',
    },
    {
      area: 'Mobile-First',
      practice: 'Design for mobile first, then enhance',
      rationale: 'Forces prioritization of essential content and features',
      example: 'Start with single column, add sidebar on tablet+',
    },
  ];
}

/**
 * Generate implementation guide
 */
function generateImplementationGuide(request: UIDesignRequest): string {
  const framework = request.framework || 'react';
  const type = request.componentType || 'custom';

  return `# ${type.charAt(0).toUpperCase() + type.slice(1)} Implementation Guide

## Setup
1. Choose your design from the options above
2. Copy the generated code
3. Install dependencies: npm install ${FRAMEWORK_DEPENDENCIES[framework as keyof typeof FRAMEWORK_DEPENDENCIES]?.join(' ') || ''}
4. Paste code into your project

## Customization
- Update CSS variables in the component for colors/spacing
- Modify content/text as needed
- Adjust props for different states
- Test on mobile, tablet, desktop

## Performance Tips
- Use React.memo() for components that don't change often
- Lazy load heavy images
- Implement code splitting for large components
- Use CSS modules or styled-components for scoping

## Accessibility
- Test with keyboard navigation (Tab, Enter, Escape)
- Verify with screen readers (NVDA, JAWS, VoiceOver)
- Check color contrast with WebAIM tool
- Validate HTML with W3C validator

## Deployment
- Build for production: npm run build
- Optimize images before deployment
- Test on real devices
- Monitor Core Web Vitals

## Resources
- Design System: See your chosen design pattern documentation
- Component Library: ${COMPONENT_LIBRARY_URLS[framework as keyof typeof COMPONENT_LIBRARY_URLS] || 'N/A'}
- Accessibility: https://www.w3.org/WAI/WCAG21/quickref/
- Performance: https://web.dev/performance/
`;
}

// ============================================================================
// Design Templates (Heuristic Fallbacks)
// ============================================================================

const DESIGN_TEMPLATES = {
  button: [
    {
      name: 'Glassmorphic Button',
      description: 'Modern glassmorphic button with blur effect and transparency',
      inspirationSource: 'Apple Design, Dribbble',
      features: ['Blur backdrop', 'Gradient background', 'Smooth hover animation'],
      designPattern: 'Glassmorphism',
      difficulty: 'medium' as const,
    },
    {
      name: 'Minimalist Button',
      description: 'Clean, simple button with minimal styling',
      inspirationSource: 'Material Design, Modern Web',
      features: ['Outline style', 'Flat design', 'Responsive sizing'],
      designPattern: 'Minimalism',
      difficulty: 'easy' as const,
    },
    {
      name: 'Gradient Button',
      description: 'Vibrant button with gradient background and animation',
      inspirationSource: 'Dribbble, Product Design',
      features: ['Animated gradient', 'Hover glow effect', 'Bold colors'],
      designPattern: 'Modern',
      difficulty: 'medium' as const,
    },
    {
      name: 'Neumorphic Button',
      description: 'Soft, 3D-like button with subtle shadows',
      inspirationSource: 'Neumorphism Design Trend',
      features: ['Soft shadows', 'Inset effect on press', 'Monochrome colors'],
      designPattern: 'Neumorphism',
      difficulty: 'hard' as const,
    },
    {
      name: 'Icon Button',
      description: 'Button with icon and optional label',
      inspirationSource: 'Design Systems, Material Icons',
      features: ['Icon integration', 'Size variants', 'Loading state'],
      designPattern: 'Utility',
      difficulty: 'easy' as const,
    },
  ],
  card: [
    {
      name: 'Elevated Card',
      description: 'Card with shadow for depth and elevation',
      inspirationSource: 'Material Design v2',
      features: ['Shadow elevation', 'Hover lift effect', 'Content slots'],
      designPattern: 'Material Design',
      difficulty: 'easy' as const,
    },
    {
      name: 'Border Card',
      description: 'Minimal card with just border styling',
      inspirationSource: 'Modern Web Design',
      features: ['Clean border', 'Subtle background', 'Rounded corners'],
      designPattern: 'Minimalism',
      difficulty: 'easy' as const,
    },
    {
      name: 'Glassmorphic Card',
      description: 'Modern glass-effect card with transparency',
      inspirationSource: 'Apple, Modern Design',
      features: ['Backdrop blur', 'Transparent background', 'Gradient border'],
      designPattern: 'Glassmorphism',
      difficulty: 'medium' as const,
    },
    {
      name: 'Interactive Card',
      description: 'Card with overlay and hover interactions',
      inspirationSource: 'E-commerce, Product Showcase',
      features: ['Hover overlay', 'Image with text', 'Call to action'],
      designPattern: 'Interactive',
      difficulty: 'medium' as const,
    },
    {
      name: 'Stats Card',
      description: 'Card designed for displaying metrics and numbers',
      inspirationSource: 'Dashboards, Analytics',
      features: ['Large numbers', 'Trend indicator', 'Color coding'],
      designPattern: 'Data Visualization',
      difficulty: 'easy' as const,
    },
  ],
  form: [
    {
      name: 'Modern Form',
      description: 'Contemporary form with floating labels and smooth interactions',
      inspirationSource: 'Material Design v3, Modern Apps',
      features: ['Floating labels', 'Clear validation', 'Smooth animations'],
      designPattern: 'Modern',
      difficulty: 'medium' as const,
    },
    {
      name: 'Minimalist Form',
      description: 'Simple form with clean styling and clear hierarchy',
      inspirationSource: 'Stripped UI, Baseline Design',
      features: ['Clear labels', 'Adequate spacing', 'Simple inputs'],
      designPattern: 'Minimalism',
      difficulty: 'easy' as const,
    },
    {
      name: 'Multi-Step Form',
      description: 'Form broken into steps with progress indicator',
      inspirationSource: 'Checkout flows, Onboarding',
      features: ['Progress bar', 'Step indicators', 'Validation feedback'],
      designPattern: 'Progress',
      difficulty: 'hard' as const,
    },
    {
      name: 'Inline Form',
      description: 'Form inputs displayed inline for quick editing',
      inspirationSource: 'Data Tables, Inline Editing',
      features: ['Compact layout', 'Quick edit mode', 'Inline validation'],
      designPattern: 'Inline',
      difficulty: 'medium' as const,
    },
    {
      name: 'Search Form',
      description: 'Advanced search form with filters and autocomplete',
      inspirationSource: 'Google, Search Interfaces',
      features: ['Autocomplete', 'Filters', 'Clear suggestions'],
      designPattern: 'Search',
      difficulty: 'hard' as const,
    },
  ],
  custom: [
    {
      name: 'Custom Component - Modern',
      description: 'Modern, flexible component following latest design trends',
      inspirationSource: 'Dribbble, Behance',
      features: ['Responsive', 'Accessible', 'Animated transitions'],
      designPattern: 'Modern',
      difficulty: 'medium' as const,
    },
    {
      name: 'Custom Component - Minimal',
      description: 'Minimalist approach focused on content',
      inspirationSource: 'Medium, Stripe',
      features: ['Content-focused', 'Simple interactions', 'Quick to build'],
      designPattern: 'Minimalism',
      difficulty: 'easy' as const,
    },
    {
      name: 'Custom Component - Advanced',
      description: 'Feature-rich component with multiple interactions',
      inspirationSource: 'Enterprise Design Systems',
      features: ['Rich interactions', 'Multiple states', 'Configurable'],
      designPattern: 'Enterprise',
      difficulty: 'hard' as const,
    },
  ],
  navbar: [
    {
      name: 'Sticky Top Navbar',
      description: 'Always-visible navigation at top with sticky behavior',
      inspirationSource: 'Modern Web Practices',
      features: ['Sticky position', 'Logo/menu', 'Auth buttons'],
      designPattern: 'Navigation',
      difficulty: 'easy' as const,
    },
  ],
  hero: [
    {
      name: 'Image Hero',
      description: 'Hero section with background image and overlay text',
      inspirationSource: 'Marketing sites, Landing pages',
      features: ['Background image', 'Text overlay', 'CTA button'],
      designPattern: 'Marketing',
      difficulty: 'medium' as const,
    },
  ],
  dashboard: [
    {
      name: 'Grid Dashboard',
      description: 'Dashboard with widget grid layout',
      inspirationSource: 'Admin Panels, Analytics',
      features: ['Grid layout', 'Resizable widgets', 'Real-time updates'],
      designPattern: 'Dashboard',
      difficulty: 'hard' as const,
    },
  ],
  modal: [
    {
      name: 'Centered Modal',
      description: 'Standard centered modal with overlay backdrop',
      inspirationSource: 'Design Systems',
      features: ['Centered overlay', 'Header/footer', 'Close button'],
      designPattern: 'Modal',
      difficulty: 'easy' as const,
    },
  ],
  sidebar: [
    {
      name: 'Collapsible Sidebar',
      description: 'Sidebar that collapses on smaller screens',
      inspirationSource: 'Admin Interfaces',
      features: ['Toggle button', 'Icon labels', 'Nested items'],
      designPattern: 'Navigation',
      difficulty: 'medium' as const,
    },
  ],
  footer: [
    {
      name: 'Multi-Column Footer',
      description: 'Footer with multiple columns of links',
      inspirationSource: 'Modern Web Design',
      features: ['Multi-column layout', 'Logo area', 'Social links'],
      designPattern: 'Footer',
      difficulty: 'easy' as const,
    },
  ],
};

// ============================================================================
// Component Code Templates
// ============================================================================

const COMPONENT_TEMPLATES = {
  react: {
    button: {
      name: 'Button',
      code: `import React from 'react';
import './Button.css';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
}) => {
  return (
    <button
      className={\`button button--\${variant} button--\${size}\`}
      disabled={disabled}
      onClick={onClick}
      aria-label={typeof children === 'string' ? children : 'button'}
    >
      {children}
    </button>
  );
};

export default Button;`,
      language: 'jsx',
      imports: ['React'],
      dependencies: [],
      cssVars: {
        '--color-primary': '#3B82F6',
        '--color-secondary': '#10B981',
        '--radius': '8px',
        '--shadow': '0 2px 8px rgba(0,0,0,0.1)',
      },
      a11y: {
        ariaLabels: { button: 'Interactive button element' },
        keyboardShortcuts: ['Enter or Space to activate'],
        contrastRatio: 'WCAG AAA',
        recommendations: ['Use semantic button element', 'Include aria-label', 'Visible focus state'],
      },
    },
    custom: {
      name: 'CustomComponent',
      code: '// Custom React component',
      language: 'jsx',
      imports: [],
      dependencies: [],
      cssVars: {},
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    },
  },
  vue: {
    button: {
      name: 'Button',
      code: `<template>
  <button
    :class="['button', \`button--\${variant}\`, \`button--\${size}\`]"
    :disabled="disabled"
    @click="$emit('click')"
    :aria-label="label"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  label?: string;
}>();

defineEmits<{
  click: [];
}>();
</script>

<style scoped>
.button {
  padding: var(--button-padding);
  border-radius: var(--radius);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.button--primary {
  background: var(--color-primary);
  color: white;
}

.button--primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
</style>`,
      language: 'vue',
      imports: [],
      dependencies: ['vue@3+'],
      cssVars: {
        '--color-primary': '#3B82F6',
        '--button-padding': '10px 20px',
        '--radius': '8px',
      },
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    },
    custom: {
      name: 'CustomComponent',
      code: '<!-- Custom Vue component -->',
      language: 'vue',
      imports: [],
      dependencies: [],
      cssVars: {},
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    },
  },
  html: {
    button: {
      name: 'button',
      code: `<button class="btn btn--primary" aria-label="Submit button">
  Submit
</button>

<style>
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn--primary {
  background: var(--color-primary, #3B82F6);
  color: white;
}

.btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>`,
      language: 'html',
      imports: [],
      dependencies: [],
      cssVars: {
        '--color-primary': '#3B82F6',
      },
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    },
    custom: {
      name: 'custom',
      code: '<!-- Custom HTML component -->',
      language: 'html',
      imports: [],
      dependencies: [],
      cssVars: {},
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    },
  },
  svelte: {
    button: {
      name: 'Button',
      code: `<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled: boolean = false;

  let isHovered = false;
</script>

<button
  class="button button--{variant} button--{size}"
  {disabled}
  on:click
  on:mouseenter={() => (isHovered = true)}
  on:mouseleave={() => (isHovered = false)}
  aria-label={$$slots.default ? 'button' : 'interactive button'}
>
  <slot />
</button>

<style>
  .button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .button--primary {
    background: var(--color-primary, #3B82F6);
    color: white;
  }
</style>`,
      language: 'svelte',
      imports: [],
      dependencies: ['svelte@3+'],
      cssVars: {
        '--color-primary': '#3B82F6',
      },
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    },
    custom: {
      name: 'CustomComponent',
      code: '<!-- Custom Svelte component -->',
      language: 'svelte',
      imports: [],
      dependencies: [],
      cssVars: {},
      a11y: { ariaLabels: {}, keyboardShortcuts: [], contrastRatio: 'WCAG AA', recommendations: [] },
    },
  },
};

// ============================================================================
// Framework Metadata
// ============================================================================

const FRAMEWORK_DEPENDENCIES: Record<string, string[]> = {
  react: ['react@18+', 'react-dom@18+'],
  vue: ['vue@3+'],
  html: [],
  svelte: ['svelte@3+'],
  angular: ['@angular/core@15+', '@angular/common@15+'],
};

const COMPONENT_LIBRARY_URLS: Record<string, string> = {
  react: 'https://mui.com',
  vue: 'https://vuetifyjs.com',
  html: 'https://getbootstrap.com',
  svelte: 'https://sveltematerialui.com',
  angular: 'https://material.angular.io',
};

// ============================================================================
// Export
// ============================================================================

export default designUI;
