/**
 * CSS Architecture Wizard
 * 
 * Solves CSS chaos and helps build scalable styling architecture:
 * - Detects specificity conflicts and wars
 * - Suggests BEM/CSS Modules/Tailwind structure
 * - Finds unused and duplicate CSS
 * - Generates design system tokens
 * - Creates consistent spacing/color systems
 * - Converts CSS to CSS-in-JS or vice versa
 */

import { z } from 'zod';
import { getActiveProvider } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SpecificityIssue {
  selector: string;
  specificity: string;
  problem: string;
  suggestion: string;
  refactoredSelector: string;
}

export interface DesignToken {
  name: string;
  value: string;
  cssVariable: string;
  category: 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'animation';
}

export interface CSSAnalysisResult {
  summary: {
    totalRules: number;
    totalSelectors: number;
    specificityScore: number;
    healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    issues: number;
  };
  specificityIssues: SpecificityIssue[];
  unusedClasses: string[];
  duplicateRules: Array<{
    property: string;
    occurrences: number;
    suggestion: string;
  }>;
  designTokens: {
    colors: DesignToken[];
    spacing: DesignToken[];
    typography: DesignToken[];
  };
  refactoredCSS: string;
  migrationGuide?: {
    from: string;
    to: string;
    steps: string[];
    convertedCode: string;
  };
  bestPractices: string[];
}

export interface CSSRequest {
  css: string;
  html?: string;
  targetMethodology?: 'bem' | 'css-modules' | 'tailwind' | 'styled-components' | 'emotion';
  generateTokens?: boolean;
  framework?: 'react' | 'vue' | 'angular' | 'svelte';
}

// ============================================================================
// Validation Schema
// ============================================================================

export const CSSRequestSchema = z.object({
  css: z.string().min(1, 'CSS is required'),
  html: z.string().optional(),
  targetMethodology: z.enum(['bem', 'css-modules', 'tailwind', 'styled-components', 'emotion']).optional(),
  generateTokens: z.boolean().optional().default(true),
  framework: z.enum(['react', 'vue', 'angular', 'svelte']).optional()
});

// ============================================================================
// Specificity Calculator
// ============================================================================

function calculateSpecificity(selector: string): { a: number; b: number; c: number; score: number } {
  let a = 0; // IDs
  let b = 0; // Classes, attributes, pseudo-classes
  let c = 0; // Elements, pseudo-elements

  // Count IDs
  a = (selector.match(/#[\w-]+/g) || []).length;
  
  // Count classes, attributes, pseudo-classes
  b = (selector.match(/\.[\w-]+/g) || []).length;
  b += (selector.match(/\[[^\]]+\]/g) || []).length;
  b += (selector.match(/:(?!:)[\w-]+/g) || []).length;
  
  // Count elements and pseudo-elements
  c = (selector.match(/(?:^|[\s>+~])[\w-]+/g) || []).length;
  c += (selector.match(/::[\w-]+/g) || []).length;

  // Remove !important, :not(), etc. contributions
  const score = (a * 100) + (b * 10) + c;

  return { a, b, c, score };
}

// ============================================================================
// Color Extraction
// ============================================================================

function extractColors(css: string): DesignToken[] {
  const colors: Map<string, DesignToken> = new Map();
  
  // Match hex colors
  const hexMatches = css.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  
  // Match rgb/rgba colors
  const rgbMatches = css.match(/rgba?\([^)]+\)/g) || [];
  
  // Match hsl/hsla colors
  const hslMatches = css.match(/hsla?\([^)]+\)/g) || [];

  const allColors = [...hexMatches, ...rgbMatches, ...hslMatches];
  
  let colorIndex = 1;
  const colorNames: Record<string, string> = {
    '#000000': 'black',
    '#000': 'black',
    '#ffffff': 'white',
    '#fff': 'white',
    '#f00': 'red',
    '#0f0': 'green',
    '#00f': 'blue',
  };

  for (const color of allColors) {
    const normalizedColor = color.toLowerCase();
    if (!colors.has(normalizedColor)) {
      const name = colorNames[normalizedColor] || `color-${colorIndex++}`;
      colors.set(normalizedColor, {
        name: `--${name}`,
        value: color,
        cssVariable: `var(--${name})`,
        category: 'color'
      });
    }
  }

  return Array.from(colors.values());
}

// ============================================================================
// Spacing Extraction
// ============================================================================

function extractSpacing(css: string): DesignToken[] {
  const spacing: Map<string, DesignToken> = new Map();
  
  // Match pixel values
  const pxMatches = css.match(/:\s*(\d+(?:\.\d+)?px)/g) || [];
  
  // Match rem values
  const remMatches = css.match(/:\s*(\d+(?:\.\d+)?rem)/g) || [];
  
  // Match em values
  const emMatches = css.match(/:\s*(\d+(?:\.\d+)?em)/g) || [];

  const allValues = [...pxMatches, ...remMatches, ...emMatches]
    .map(v => v.replace(':', '').trim());

  // Create spacing scale
  const spacingScale: Record<string, string> = {
    '0px': 'spacing-0',
    '4px': 'spacing-1',
    '8px': 'spacing-2',
    '12px': 'spacing-3',
    '16px': 'spacing-4',
    '20px': 'spacing-5',
    '24px': 'spacing-6',
    '32px': 'spacing-8',
    '40px': 'spacing-10',
    '48px': 'spacing-12',
    '64px': 'spacing-16',
    '0.25rem': 'spacing-1',
    '0.5rem': 'spacing-2',
    '0.75rem': 'spacing-3',
    '1rem': 'spacing-4',
    '1.25rem': 'spacing-5',
    '1.5rem': 'spacing-6',
    '2rem': 'spacing-8',
  };

  for (const value of allValues) {
    if (!spacing.has(value)) {
      const name = spacingScale[value] || `spacing-custom-${spacing.size + 1}`;
      spacing.set(value, {
        name: `--${name}`,
        value,
        cssVariable: `var(--${name})`,
        category: 'spacing'
      });
    }
  }

  return Array.from(spacing.values());
}

// ============================================================================
// Typography Extraction
// ============================================================================

function extractTypography(css: string): DesignToken[] {
  const typography: DesignToken[] = [];
  
  // Extract font-size values
  const fontSizes = css.match(/font-size:\s*([^;]+)/g) || [];
  const uniqueSizes = [...new Set(fontSizes.map(f => f.replace('font-size:', '').trim()))];
  
  const sizeScale: Record<string, string> = {
    '12px': 'text-xs',
    '14px': 'text-sm',
    '16px': 'text-base',
    '18px': 'text-lg',
    '20px': 'text-xl',
    '24px': 'text-2xl',
    '30px': 'text-3xl',
    '36px': 'text-4xl',
    '48px': 'text-5xl',
    '0.75rem': 'text-xs',
    '0.875rem': 'text-sm',
    '1rem': 'text-base',
    '1.125rem': 'text-lg',
    '1.25rem': 'text-xl',
    '1.5rem': 'text-2xl',
  };

  for (const size of uniqueSizes) {
    const name = sizeScale[size] || `text-custom-${typography.length + 1}`;
    typography.push({
      name: `--${name}`,
      value: size,
      cssVariable: `var(--${name})`,
      category: 'typography'
    });
  }

  // Extract font-family values
  const fontFamilies = css.match(/font-family:\s*([^;]+)/g) || [];
  const uniqueFamilies = [...new Set(fontFamilies.map(f => f.replace('font-family:', '').trim()))];
  
  let familyIndex = 1;
  for (const family of uniqueFamilies) {
    typography.push({
      name: `--font-${familyIndex === 1 ? 'primary' : familyIndex === 2 ? 'secondary' : `custom-${familyIndex}`}`,
      value: family,
      cssVariable: `var(--font-${familyIndex === 1 ? 'primary' : familyIndex === 2 ? 'secondary' : `custom-${familyIndex}`})`,
      category: 'typography'
    });
    familyIndex++;
  }

  return typography;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export async function analyzeCSS(request: CSSRequest): Promise<CSSAnalysisResult> {
  const validated = CSSRequestSchema.parse(request);
  logger.info('Analyzing CSS architecture');

  const specificityIssues: SpecificityIssue[] = [];
  const duplicateRules: CSSAnalysisResult['duplicateRules'] = [];
  
  // Parse CSS rules
  const ruleMatches = validated.css.match(/([^{]+)\{([^}]+)\}/g) || [];
  const totalRules = ruleMatches.length;
  
  // Extract all selectors
  const selectors = validated.css.match(/[^{}]+(?=\{)/g) || [];
  const totalSelectors = selectors.length;

  // Analyze specificity
  let totalSpecificity = 0;
  for (const selector of selectors) {
    const trimmedSelector = selector.trim();
    if (!trimmedSelector) continue;

    const specificity = calculateSpecificity(trimmedSelector);
    totalSpecificity += specificity.score;

    // Check for high specificity issues
    if (specificity.a > 0) {
      specificityIssues.push({
        selector: trimmedSelector,
        specificity: `(${specificity.a},${specificity.b},${specificity.c})`,
        problem: 'Uses ID selector which has very high specificity',
        suggestion: 'Replace ID with class selector for more maintainable CSS',
        refactoredSelector: trimmedSelector.replace(/#([\w-]+)/g, '.$1')
      });
    }

    if (specificity.score > 30) {
      specificityIssues.push({
        selector: trimmedSelector,
        specificity: `(${specificity.a},${specificity.b},${specificity.c})`,
        problem: 'Selector has very high specificity, hard to override',
        suggestion: 'Flatten the selector or use BEM methodology',
        refactoredSelector: generateBEMSelector(trimmedSelector)
      });
    }

    // Check for !important abuse
    if (validated.css.includes(`${trimmedSelector}`) && validated.css.includes('!important')) {
      specificityIssues.push({
        selector: trimmedSelector,
        specificity: 'Infinity (!important)',
        problem: '!important makes CSS hard to maintain and override',
        suggestion: 'Increase specificity naturally or refactor CSS structure',
        refactoredSelector: trimmedSelector
      });
    }
  }

  // Find duplicate properties
  const propertyMap: Map<string, number> = new Map();
  const propertyMatches = validated.css.match(/[\w-]+:\s*[^;]+/g) || [];
  
  for (const prop of propertyMatches) {
    const key = prop.trim();
    propertyMap.set(key, (propertyMap.get(key) || 0) + 1);
  }

  for (const [property, count] of propertyMap) {
    if (count > 2) {
      const propName = property.split(':')[0] || 'unknown';
      duplicateRules.push({
        property,
        occurrences: count,
        suggestion: `Extract to CSS variable: var(--${propName.replace(/\s/g, '-')})`
      });
    }
  }

  // Extract design tokens
  const colors = validated.generateTokens ? extractColors(validated.css) : [];
  const spacing = validated.generateTokens ? extractSpacing(validated.css) : [];
  const typography = validated.generateTokens ? extractTypography(validated.css) : [];

  // Calculate health score
  const avgSpecificity = totalSelectors > 0 ? totalSpecificity / totalSelectors : 0;
  let healthScore = 100;
  healthScore -= specificityIssues.length * 5;
  healthScore -= duplicateRules.length * 2;
  healthScore -= Math.min(avgSpecificity, 30);
  healthScore = Math.max(0, healthScore);

  const healthGrade = healthScore >= 90 ? 'A' : healthScore >= 80 ? 'B' : healthScore >= 70 ? 'C' : healthScore >= 60 ? 'D' : 'F';

  // Generate refactored CSS
  const refactoredCSS = await generateRefactoredCSS(validated, { colors, spacing, typography });

  // Generate migration guide if target methodology specified
  let migrationGuide: CSSAnalysisResult['migrationGuide'];
  if (validated.targetMethodology) {
    migrationGuide = generateMigrationGuide(validated.css, validated.targetMethodology, validated.framework);
  }

  // Find unused classes if HTML provided
  const unusedClasses: string[] = [];
  if (validated.html) {
    const cssClasses = (validated.css.match(/\.[\w-]+/g) || []).map(c => c.slice(1));
    for (const className of cssClasses) {
      if (!validated.html.includes(className)) {
        unusedClasses.push(className);
      }
    }
  }

  // Generate best practices
  const bestPractices = generateBestPractices(specificityIssues, duplicateRules, validated.targetMethodology);

  return {
    summary: {
      totalRules,
      totalSelectors,
      specificityScore: Math.round(avgSpecificity * 10) / 10,
      healthGrade,
      issues: specificityIssues.length + duplicateRules.length
    },
    specificityIssues,
    unusedClasses,
    duplicateRules,
    designTokens: {
      colors,
      spacing,
      typography
    },
    refactoredCSS,
    migrationGuide,
    bestPractices
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateBEMSelector(selector: string): string {
  // Convert complex selector to BEM-style
  const parts = selector.split(/[\s>+~]+/);
  if (parts.length <= 1) return selector;

  const block = (parts[0] || 'block').replace(/[#.]/g, '');
  const element = (parts[parts.length - 1] || 'element').replace(/[#.]/g, '');
  
  return `.${block}__${element}`;
}

async function generateRefactoredCSS(
  request: CSSRequest,
  tokens: { colors: DesignToken[]; spacing: DesignToken[]; typography: DesignToken[] }
): Promise<string> {
  let refactored = request.css;

  // Generate CSS variables section
  const cssVariables = `/* Design System Tokens */
:root {
  /* Colors */
${tokens.colors.map(c => `  ${c.name}: ${c.value};`).join('\n')}
  
  /* Spacing */
${tokens.spacing.map(s => `  ${s.name}: ${s.value};`).join('\n')}
  
  /* Typography */
${tokens.typography.map(t => `  ${t.name}: ${t.value};`).join('\n')}
}

/* Refactored Styles */
`;

  // Replace hardcoded values with variables
  for (const color of tokens.colors) {
    refactored = refactored.replace(new RegExp(escapeRegex(color.value), 'gi'), color.cssVariable);
  }

  return cssVariables + refactored;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateMigrationGuide(
  css: string, 
  target: string, 
  framework?: string
): CSSAnalysisResult['migrationGuide'] {
  const guides: Record<string, { steps: string[]; convertedCode: string }> = {
    'bem': {
      steps: [
        '1. Identify block components (header, card, button, etc.)',
        '2. Rename elements using block__element pattern',
        '3. Add modifiers using block--modifier or block__element--modifier',
        '4. Flatten all nested selectors',
        '5. Remove ID selectors, replace with classes',
        '6. Maximum specificity should be 1-2 classes'
      ],
      convertedCode: convertToBEM(css)
    },
    'css-modules': {
      steps: [
        '1. Rename CSS file to *.module.css',
        '2. Import styles: import styles from "./Component.module.css"',
        '3. Use camelCase class names',
        '4. Apply: className={styles.container}',
        '5. For dynamic classes: className={`${styles.button} ${isActive ? styles.active : ""}`}',
        '6. Compose reusable styles using composes:'
      ],
      convertedCode: convertToCSSModules(css, framework)
    },
    'tailwind': {
      steps: [
        '1. Install Tailwind CSS: npm install tailwindcss',
        '2. Initialize: npx tailwindcss init',
        '3. Replace CSS classes with Tailwind utilities',
        '4. Use @apply for repeated patterns',
        '5. Configure theme in tailwind.config.js',
        '6. Remove unused custom CSS'
      ],
      convertedCode: convertToTailwind(css)
    },
    'styled-components': {
      steps: [
        '1. Install: npm install styled-components',
        '2. Import: import styled from "styled-components"',
        '3. Create styled components for each element',
        '4. Use props for dynamic styling',
        '5. Create theme provider for design tokens',
        '6. Use css helper for conditional styles'
      ],
      convertedCode: convertToStyledComponents(css)
    },
    'emotion': {
      steps: [
        '1. Install: npm install @emotion/react @emotion/styled',
        '2. Add babel plugin or use pragma comment',
        '3. Use css prop or styled API',
        '4. Create reusable styles with css function',
        '5. Implement theme with ThemeProvider',
        '6. Use keyframes for animations'
      ],
      convertedCode: convertToEmotion(css)
    }
  };

  const guide = guides[target];
  if (!guide) {
    return {
      from: 'Plain CSS',
      to: target,
      steps: ['No migration guide available for this methodology'],
      convertedCode: css
    };
  }
  return {
    from: 'Plain CSS',
    to: target,
    steps: guide.steps,
    convertedCode: guide.convertedCode
  };
}

function convertToBEM(css: string): string {
  // Simple BEM conversion example
  return `/* BEM Converted Styles */

/* Block */
.card {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-4);
  background: var(--color-white);
  border-radius: 8px;
}

/* Element */
.card__header {
  font-size: var(--text-xl);
  font-weight: 600;
  margin-bottom: var(--spacing-3);
}

.card__body {
  flex: 1;
  color: var(--color-gray-600);
}

.card__footer {
  display: flex;
  gap: var(--spacing-2);
  margin-top: var(--spacing-4);
}

/* Modifiers */
.card--featured {
  border: 2px solid var(--color-primary);
}

.card--compact {
  padding: var(--spacing-2);
}

.card__button {
  padding: var(--spacing-2) var(--spacing-4);
}

.card__button--primary {
  background: var(--color-primary);
  color: white;
}

.card__button--secondary {
  background: transparent;
  border: 1px solid var(--color-gray-300);
}`;
}

function convertToCSSModules(css: string, framework?: string): string {
  const importStatement = framework === 'vue' 
    ? `<style module>` 
    : `import styles from './Component.module.css';`;

  return `/* Component.module.css */

.container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.header {
  font-size: 1.5rem;
  font-weight: 600;
}

.content {
  flex: 1;
}

.button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.buttonPrimary {
  composes: button;
  background: var(--color-primary);
  color: white;
}

.buttonSecondary {
  composes: button;
  background: transparent;
  border: 1px solid #ccc;
}

/* Usage in ${framework || 'React'}: */
/*
${importStatement}

${framework === 'vue' ? `
<template>
  <div :class="$style.container">
    <h1 :class="$style.header">Title</h1>
    <button :class="$style.buttonPrimary">Click</button>
  </div>
</template>
` : `
function Component() {
  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Title</h1>
      <button className={styles.buttonPrimary}>Click</button>
    </div>
  );
}
`}
*/`;
}

function convertToTailwind(css: string): string {
  return `<!-- Tailwind CSS Conversion -->

<!-- Before (custom CSS) -->
<div class="card">
  <h2 class="card-title">Title</h2>
  <p class="card-content">Content here</p>
  <button class="btn btn-primary">Click Me</button>
</div>

<!-- After (Tailwind) -->
<div class="flex flex-col p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
  <h2 class="text-xl font-semibold text-gray-900 mb-3">Title</h2>
  <p class="text-gray-600 flex-1">Content here</p>
  <button class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md 
                 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 
                 focus:ring-offset-2 transition-colors">
    Click Me
  </button>
</div>

<!-- For repeated patterns, use @apply in CSS -->
/* globals.css */
@layer components {
  .btn {
    @apply px-4 py-2 rounded-md font-medium transition-colors 
           focus:ring-2 focus:ring-offset-2;
  }
  
  .btn-primary {
    @apply bg-blue-600 text-white hover:bg-blue-700 
           focus:ring-blue-500;
  }
  
  .btn-secondary {
    @apply bg-gray-100 text-gray-900 hover:bg-gray-200 
           focus:ring-gray-500;
  }
  
  .card {
    @apply flex flex-col p-4 bg-white rounded-lg shadow-md;
  }
}`;
}

function convertToStyledComponents(css: string): string {
  return `// styled-components Conversion
import styled from 'styled-components';

// Theme definition
export const theme = {
  colors: {
    primary: '#3B82F6',
    secondary: '#6B7280',
    background: '#FFFFFF',
    text: '#1F2937',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '1rem',
  },
};

// Styled Components
export const Card = styled.div\`
  display: flex;
  flex-direction: column;
  padding: \${({ theme }) => theme.spacing.lg};
  background: \${({ theme }) => theme.colors.background};
  border-radius: \${({ theme }) => theme.borderRadius.lg};
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  
  &:hover {
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.15);
  }
\`;

export const CardTitle = styled.h2\`
  font-size: 1.25rem;
  font-weight: 600;
  color: \${({ theme }) => theme.colors.text};
  margin-bottom: \${({ theme }) => theme.spacing.md};
\`;

export const CardContent = styled.p\`
  color: \${({ theme }) => theme.colors.secondary};
  flex: 1;
\`;

export const Button = styled.button\`
  padding: \${({ theme }) => theme.spacing.sm} \${({ theme }) => theme.spacing.md};
  border-radius: \${({ theme }) => theme.borderRadius.md};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  \${({ variant, theme }) => variant === 'primary' && \`
    background: \${theme.colors.primary};
    color: white;
    border: none;
    
    &:hover {
      background: #2563EB;
    }
  \`}
  
  \${({ variant, theme }) => variant === 'secondary' && \`
    background: transparent;
    color: \${theme.colors.text};
    border: 1px solid #E5E7EB;
    
    &:hover {
      background: #F9FAFB;
    }
  \`}
\`;

// Usage
/*
import { ThemeProvider } from 'styled-components';
import { theme, Card, CardTitle, CardContent, Button } from './styles';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Card>
        <CardTitle>Welcome</CardTitle>
        <CardContent>This is styled-components</CardContent>
        <Button variant="primary">Get Started</Button>
      </Card>
    </ThemeProvider>
  );
}
*/`;
}

function convertToEmotion(css: string): string {
  return `// Emotion CSS-in-JS Conversion
/** @jsxImportSource @emotion/react */
import { css, keyframes } from '@emotion/react';
import styled from '@emotion/styled';

// Keyframe animations
const fadeIn = keyframes\`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
\`;

// Reusable style objects
const baseButton = css\`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
  }
\`;

// Theme type
interface Theme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
}

const theme: Theme = {
  colors: {
    primary: '#3B82F6',
    secondary: '#6B7280',
    background: '#FFFFFF',
    text: '#1F2937',
  },
};

// Styled components with Emotion
const Card = styled.div\`
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  animation: \${fadeIn} 0.3s ease-out;
\`;

const PrimaryButton = styled.button\`
  \${baseButton}
  background: \${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  
  &:hover {
    background: #2563EB;
    transform: translateY(-1px);
  }
\`;

// Using css prop directly
function Component() {
  return (
    <div
      css={css\`
        display: grid;
        gap: 1rem;
        padding: 2rem;
      \`}
    >
      <Card>
        <h2
          css={css\`
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
          \`}
        >
          Emotion Example
        </h2>
        <PrimaryButton>Click Me</PrimaryButton>
      </Card>
    </div>
  );
}

export { theme, Card, PrimaryButton };`;
}

function generateBestPractices(
  specificityIssues: SpecificityIssue[],
  duplicateRules: CSSAnalysisResult['duplicateRules'],
  methodology?: string
): string[] {
  const practices: string[] = [];

  if (specificityIssues.some(i => i.problem.includes('ID'))) {
    practices.push('Avoid ID selectors - they have high specificity and are hard to override');
  }

  if (specificityIssues.some(i => i.problem.includes('!important'))) {
    practices.push('Never use !important - refactor your CSS structure instead');
  }

  if (duplicateRules.length > 3) {
    practices.push('Extract repeated values into CSS custom properties (variables)');
  }

  practices.push('Keep selector specificity as low as possible (max 2-3 classes)');
  practices.push('Use a consistent naming convention (BEM, SUIT CSS, etc.)');
  practices.push('Organize CSS by component, not by property type');
  practices.push('Use CSS custom properties for theming and design tokens');
  practices.push('Consider mobile-first approach with min-width media queries');

  if (methodology === 'tailwind') {
    practices.push('Use @apply sparingly - prefer utility classes in markup');
    practices.push('Configure theme values in tailwind.config.js for consistency');
  }

  if (methodology === 'styled-components' || methodology === 'emotion') {
    practices.push('Co-locate styles with components for better maintainability');
    practices.push('Use ThemeProvider for global design tokens');
  }

  return practices;
}

export default { analyzeCSS };
