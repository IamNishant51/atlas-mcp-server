/**
 * Animation Studio
 * 
 * Professional animation generator for frontend developers:
 * - Creates smooth CSS animations and keyframes
 * - Generates Framer Motion code for React
 * - Creates GSAP animation timelines
 * - Provides Lottie integration guidance
 * - Micro-interactions library
 * - Performance-optimized animations
 * - Accessibility-friendly (respects prefers-reduced-motion)
 */

import { z } from 'zod';
import { getActiveProvider } from '../providers/index.js';
import { logger } from '../utils.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AnimationRequest {
  type: 'entrance' | 'exit' | 'hover' | 'loading' | 'scroll' | 'gesture' | 'transition' | 'micro-interaction';
  element: string; // Description of what to animate (button, card, modal, etc.)
  style?: 'smooth' | 'bouncy' | 'elastic' | 'sharp' | 'natural' | 'playful';
  duration?: number; // in ms
  library: 'css' | 'framer-motion' | 'gsap' | 'react-spring' | 'anime-js';
  framework?: 'react' | 'vue' | 'svelte' | 'vanilla';
  includeReducedMotion?: boolean;
  customParams?: Record<string, any>;
}

export interface AnimationOutput {
  name: string;
  description: string;
  code: string;
  usageExample: string;
  cssKeyframes?: string;
  jsCode?: string;
  performanceTips: string[];
  accessibilityNote: string;
  browserSupport: string;
  alternatives: Array<{
    library: string;
    code: string;
  }>;
}

export interface AnimationPreset {
  name: string;
  category: string;
  description: string;
  preview: string;
  css: string;
  framerMotion?: string;
  gsap?: string;
}

// ============================================================================
// Validation Schema
// ============================================================================

export const AnimationRequestSchema = z.object({
  type: z.enum(['entrance', 'exit', 'hover', 'loading', 'scroll', 'gesture', 'transition', 'micro-interaction']),
  element: z.string().min(1, 'Element description required'),
  style: z.enum(['smooth', 'bouncy', 'elastic', 'sharp', 'natural', 'playful']).optional().default('smooth'),
  duration: z.number().min(100).max(5000).optional().default(300),
  library: z.enum(['css', 'framer-motion', 'gsap', 'react-spring', 'anime-js']),
  framework: z.enum(['react', 'vue', 'svelte', 'vanilla']).optional().default('react'),
  includeReducedMotion: z.boolean().optional().default(true),
  customParams: z.record(z.any()).optional()
});

// ============================================================================
// Animation Presets Database
// ============================================================================

const EASING_FUNCTIONS = {
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  bouncy: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  elastic: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  natural: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  playful: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)'
};

// Default fallback animation preset
const DEFAULT_ANIMATION_PRESET: AnimationPreset = {
  name: 'Fade In',
  category: 'entrance',
  description: 'Simple opacity fade in',
  preview: '0% opacity → 100% opacity',
  css: `@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}`,
  framerMotion: `const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3, ease: "easeOut" }
};`,
  gsap: `gsap.from(element, {
  opacity: 0,
  duration: 0.3,
  ease: "power2.out"
});`
};

const ENTRANCE_ANIMATIONS: Record<string, AnimationPreset> = {
  fadeIn: {
    name: 'Fade In',
    category: 'entrance',
    description: 'Simple opacity fade in',
    preview: '0% opacity → 100% opacity',
    css: `@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}`,
    framerMotion: `const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3, ease: "easeOut" }
};

// Usage: <motion.div {...fadeIn}>Content</motion.div>`,
    gsap: `gsap.from(element, {
  opacity: 0,
  duration: 0.3,
  ease: "power2.out"
});`
  },
  slideUp: {
    name: 'Slide Up',
    category: 'entrance',
    description: 'Slide in from bottom with fade',
    preview: 'Translate Y 20px → 0 with opacity',
    css: `@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.slide-up {
  animation: slideUp 0.4s ease-out forwards;
}`,
    framerMotion: `const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
};`,
    gsap: `gsap.from(element, {
  opacity: 0,
  y: 20,
  duration: 0.4,
  ease: "power2.out"
});`
  },
  scaleIn: {
    name: 'Scale In',
    category: 'entrance',
    description: 'Scale from small to full size',
    preview: 'Scale 0.9 → 1 with opacity',
    css: `@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.scale-in {
  animation: scaleIn 0.3s ease-out forwards;
}`,
    framerMotion: `const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.3, ease: "easeOut" }
};`,
    gsap: `gsap.from(element, {
  opacity: 0,
  scale: 0.9,
  duration: 0.3,
  ease: "back.out(1.7)"
});`
  },
  bounceIn: {
    name: 'Bounce In',
    category: 'entrance',
    description: 'Playful bounce entrance',
    preview: 'Scale with overshoot bounce',
    css: `@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  50% {
    transform: scale(1.05);
  }
  70% {
    transform: scale(0.9);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.bounce-in {
  animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
}`,
    framerMotion: `const bounceIn = {
  initial: { opacity: 0, scale: 0.3 },
  animate: { opacity: 1, scale: 1 },
  transition: {
    type: "spring",
    stiffness: 260,
    damping: 20
  }
};`,
    gsap: `gsap.from(element, {
  opacity: 0,
  scale: 0.3,
  duration: 0.5,
  ease: "elastic.out(1, 0.5)"
});`
  }
};

const HOVER_ANIMATIONS: Record<string, AnimationPreset> = {
  lift: {
    name: 'Lift',
    category: 'hover',
    description: 'Subtle lift with shadow',
    preview: 'Translate Y -4px with shadow increase',
    css: `.lift-hover {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.lift-hover:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
}`,
    framerMotion: `const liftHover = {
  whileHover: {
    y: -4,
    boxShadow: "0 12px 24px rgba(0, 0, 0, 0.15)",
    transition: { duration: 0.2 }
  }
};`,
    gsap: `element.addEventListener('mouseenter', () => {
  gsap.to(element, {
    y: -4,
    boxShadow: "0 12px 24px rgba(0, 0, 0, 0.15)",
    duration: 0.2
  });
});
element.addEventListener('mouseleave', () => {
  gsap.to(element, {
    y: 0,
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    duration: 0.2
  });
});`
  },
  glow: {
    name: 'Glow',
    category: 'hover',
    description: 'Glowing effect on hover',
    preview: 'Box shadow glow animation',
    css: `.glow-hover {
  transition: box-shadow 0.3s ease;
}

.glow-hover:hover {
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.5),
              0 0 40px rgba(59, 130, 246, 0.3);
}`,
    framerMotion: `const glowHover = {
  whileHover: {
    boxShadow: [
      "0 0 0px rgba(59, 130, 246, 0)",
      "0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.3)"
    ],
    transition: { duration: 0.3 }
  }
};`,
  },
  scale: {
    name: 'Scale',
    category: 'hover',
    description: 'Subtle scale up on hover',
    preview: 'Scale 1 → 1.05',
    css: `.scale-hover {
  transition: transform 0.2s ease;
}

.scale-hover:hover {
  transform: scale(1.05);
}`,
    framerMotion: `const scaleHover = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.95 },
  transition: { type: "spring", stiffness: 400, damping: 17 }
};`,
    gsap: `element.addEventListener('mouseenter', () => {
  gsap.to(element, { scale: 1.05, duration: 0.2 });
});
element.addEventListener('mouseleave', () => {
  gsap.to(element, { scale: 1, duration: 0.2 });
});`
  }
};

const LOADING_ANIMATIONS: Record<string, AnimationPreset> = {
  spinner: {
    name: 'Spinner',
    category: 'loading',
    description: 'Classic rotating spinner',
    preview: 'Infinite rotation',
    css: `@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #E5E7EB;
  border-top-color: #3B82F6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}`,
    framerMotion: `const Spinner = () => (
  <motion.div
    style={{
      width: 24,
      height: 24,
      border: "2px solid #E5E7EB",
      borderTopColor: "#3B82F6",
      borderRadius: "50%"
    }}
    animate={{ rotate: 360 }}
    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
  />
);`,
  },
  pulse: {
    name: 'Pulse',
    category: 'loading',
    description: 'Pulsing opacity effect',
    preview: 'Opacity oscillation',
    css: `@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}`,
    framerMotion: `const pulse = {
  animate: {
    opacity: [1, 0.5, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};`,
  },
  skeleton: {
    name: 'Skeleton',
    category: 'loading',
    description: 'Skeleton loading shimmer',
    preview: 'Gradient shimmer effect',
    css: `@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}`,
    framerMotion: `const Skeleton = ({ width, height }) => (
  <motion.div
    style={{
      width,
      height,
      background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
      backgroundSize: "200% 100%",
      borderRadius: 4
    }}
    animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
  />
);`,
  },
  dots: {
    name: 'Bouncing Dots',
    category: 'loading',
    description: 'Three bouncing dots',
    preview: 'Staggered dot animation',
    css: `@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-8px); }
}

.dots {
  display: flex;
  gap: 4px;
}

.dots span {
  width: 8px;
  height: 8px;
  background: #3B82F6;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out;
}

.dots span:nth-child(1) { animation-delay: 0s; }
.dots span:nth-child(2) { animation-delay: 0.16s; }
.dots span:nth-child(3) { animation-delay: 0.32s; }`,
    framerMotion: `const BouncingDots = () => (
  <div style={{ display: "flex", gap: 4 }}>
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        style={{
          width: 8,
          height: 8,
          background: "#3B82F6",
          borderRadius: "50%"
        }}
        animate={{ y: [0, -8, 0] }}
        transition={{
          duration: 0.6,
          repeat: Infinity,
          delay: i * 0.1,
          ease: "easeInOut"
        }}
      />
    ))}
  </div>
);`,
  }
};

const SCROLL_ANIMATIONS: Record<string, AnimationPreset> = {
  fadeInOnScroll: {
    name: 'Fade In On Scroll',
    category: 'scroll',
    description: 'Fade in when element enters viewport',
    preview: 'Intersection Observer trigger',
    css: `.fade-in-scroll {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.fade-in-scroll.visible {
  opacity: 1;
  transform: translateY(0);
}

/* JavaScript needed for Intersection Observer */`,
    framerMotion: `import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const FadeInOnScroll = ({ children }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
};`,
    gsap: `import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

gsap.from('.fade-in-scroll', {
  opacity: 0,
  y: 30,
  duration: 0.6,
  ease: 'power2.out',
  scrollTrigger: {
    trigger: '.fade-in-scroll',
    start: 'top 80%',
    toggleActions: 'play none none reverse'
  }
});`
  },
  parallax: {
    name: 'Parallax',
    category: 'scroll',
    description: 'Parallax scrolling effect',
    preview: 'Different scroll speeds',
    css: `/* CSS-only parallax (limited) */
.parallax-container {
  perspective: 1px;
  height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
}

.parallax-layer {
  position: absolute;
  inset: 0;
}

.parallax-back {
  transform: translateZ(-1px) scale(2);
}

.parallax-front {
  transform: translateZ(0);
}`,
    framerMotion: `import { motion, useScroll, useTransform } from 'framer-motion';

const Parallax = ({ children, speed = 0.5 }) => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 500 * speed]);
  
  return (
    <motion.div style={{ y }}>
      {children}
    </motion.div>
  );
};`,
    gsap: `import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

gsap.to('.parallax-element', {
  yPercent: -50,
  ease: 'none',
  scrollTrigger: {
    trigger: '.parallax-container',
    start: 'top top',
    end: 'bottom top',
    scrub: true
  }
});`
  }
};

const MICRO_INTERACTIONS: Record<string, AnimationPreset> = {
  buttonPress: {
    name: 'Button Press',
    category: 'micro-interaction',
    description: 'Satisfying button press feedback',
    preview: 'Scale down on click',
    css: `.button-press {
  transition: transform 0.1s ease;
}

.button-press:active {
  transform: scale(0.95);
}`,
    framerMotion: `const buttonPress = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.95 },
  transition: { type: "spring", stiffness: 400, damping: 17 }
};`,
  },
  checkbox: {
    name: 'Checkbox Check',
    category: 'micro-interaction',
    description: 'Animated checkmark',
    preview: 'SVG path animation',
    css: `@keyframes check {
  0% { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
}

.checkbox-check {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
}

.checkbox:checked + .checkbox-check {
  animation: check 0.3s ease forwards;
}`,
    framerMotion: `const CheckIcon = ({ isChecked }) => (
  <svg viewBox="0 0 24 24" width={24} height={24}>
    <motion.path
      d="M5 12l5 5L20 7"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      initial={{ pathLength: 0 }}
      animate={{ pathLength: isChecked ? 1 : 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    />
  </svg>
);`,
  },
  toggle: {
    name: 'Toggle Switch',
    category: 'micro-interaction',
    description: 'Smooth toggle animation',
    preview: 'Sliding knob with color change',
    css: `.toggle {
  width: 48px;
  height: 24px;
  background: #E5E7EB;
  border-radius: 12px;
  position: relative;
  transition: background 0.3s ease;
  cursor: pointer;
}

.toggle.active {
  background: #3B82F6;
}

.toggle-knob {
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle.active .toggle-knob {
  transform: translateX(24px);
}`,
    framerMotion: `const Toggle = ({ isOn, onToggle }) => (
  <motion.div
    onClick={onToggle}
    animate={{ background: isOn ? "#3B82F6" : "#E5E7EB" }}
    style={{
      width: 48,
      height: 24,
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      padding: 2,
      cursor: "pointer"
    }}
  >
    <motion.div
      animate={{ x: isOn ? 24 : 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      style={{
        width: 20,
        height: 20,
        background: "white",
        borderRadius: "50%",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
      }}
    />
  </motion.div>
);`,
  },
  ripple: {
    name: 'Ripple Effect',
    category: 'micro-interaction',
    description: 'Material Design ripple',
    preview: 'Expanding circle from click point',
    css: `.ripple-container {
  position: relative;
  overflow: hidden;
}

.ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  transform: scale(0);
  animation: ripple 0.6s linear;
  pointer-events: none;
}

@keyframes ripple {
  to {
    transform: scale(4);
    opacity: 0;
  }
}`,
    framerMotion: `const Ripple = ({ x, y }) => (
  <motion.span
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 20,
      height: 20,
      marginLeft: -10,
      marginTop: -10,
      borderRadius: "50%",
      background: "rgba(255, 255, 255, 0.4)",
      pointerEvents: "none"
    }}
    initial={{ scale: 0, opacity: 1 }}
    animate={{ scale: 4, opacity: 0 }}
    transition={{ duration: 0.6 }}
    onAnimationComplete={onComplete}
  />
);`,
  }
};

// ============================================================================
// Main Functions
// ============================================================================

export async function generateAnimation(request: AnimationRequest): Promise<AnimationOutput> {
  const validated = AnimationRequestSchema.parse(request);
  logger.info(`Generating ${validated.type} animation for ${validated.element}`);

  // Select appropriate preset based on type
  const presets = getPresetsForType(validated.type);
  const bestPreset = selectBestPreset(presets, validated);

  // Generate code for the requested library
  const code = generateLibraryCode(validated, bestPreset);
  const cssKeyframes = generateCSSKeyframes(validated, bestPreset);
  const usageExample = generateUsageExample(validated, code);

  // Generate alternatives
  const alternatives = generateAlternatives(validated, bestPreset);

  // Performance tips
  const performanceTips = generatePerformanceTips(validated);

  // Accessibility
  const accessibilityNote = validated.includeReducedMotion
    ? generateAccessibilityCode(validated)
    : 'Consider adding prefers-reduced-motion support';

  return {
    name: `${validated.element}-${validated.type}-animation`,
    description: `${validated.style} ${validated.type} animation for ${validated.element}`,
    code,
    usageExample,
    cssKeyframes,
    performanceTips,
    accessibilityNote,
    browserSupport: 'All modern browsers (Chrome 64+, Firefox 63+, Safari 12+, Edge 79+)',
    alternatives
  };
}

function getPresetsForType(type: string): Record<string, AnimationPreset> {
  switch (type) {
    case 'entrance':
    case 'exit':
      return ENTRANCE_ANIMATIONS;
    case 'hover':
      return HOVER_ANIMATIONS;
    case 'loading':
      return LOADING_ANIMATIONS;
    case 'scroll':
      return SCROLL_ANIMATIONS;
    case 'micro-interaction':
    case 'gesture':
      return MICRO_INTERACTIONS;
    default:
      return ENTRANCE_ANIMATIONS;
  }
}

function selectBestPreset(
  presets: Record<string, AnimationPreset>,
  request: AnimationRequest
): AnimationPreset {
  // Use DEFAULT_ANIMATION_PRESET as the ultimate fallback
  const presetValues = Object.values(presets);
  let fallback: AnimationPreset = DEFAULT_ANIMATION_PRESET;
  if (presetValues.length > 0 && presetValues[0]) {
    fallback = presetValues[0];
  }
  
  // Select based on style preference
  if (request.style === 'bouncy' || request.style === 'playful') {
    if (presets.bounceIn) return presets.bounceIn;
    if (presets.scale) return presets.scale;
    return fallback;
  }
  if (request.style === 'smooth' || request.style === 'natural') {
    if (presets.fadeIn) return presets.fadeIn;
    if (presets.slideUp) return presets.slideUp;
    return fallback;
  }
  return fallback;
}

function generateLibraryCode(request: AnimationRequest, preset: AnimationPreset): string {
  const easing = EASING_FUNCTIONS[request.style || 'smooth'];
  const duration = request.duration || 300;

  switch (request.library) {
    case 'framer-motion':
      return generateFramerMotionCode(request, preset, easing, duration);
    case 'gsap':
      return generateGSAPCode(request, preset, easing, duration);
    case 'react-spring':
      return generateReactSpringCode(request, preset, duration);
    case 'anime-js':
      return generateAnimeJSCode(request, preset, easing, duration);
    default:
      return generateCSSCode(request, preset, easing, duration);
  }
}

function generateFramerMotionCode(
  request: AnimationRequest,
  preset: AnimationPreset,
  easing: string,
  duration: number
): string {
  const durationSec = duration / 1000;

  if (request.type === 'entrance') {
    return `import { motion } from 'framer-motion';

const ${toPascalCase(request.element)}Animation = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: {
    duration: ${durationSec},
    ease: [0.4, 0, 0.2, 1]
  }
};

export const Animated${toPascalCase(request.element)} = ({ children }) => (
  <motion.div
    initial="initial"
    animate="animate"
    exit="exit"
    variants={${toPascalCase(request.element)}Animation}
  >
    {children}
  </motion.div>
);`;
  }

  if (request.type === 'hover') {
    return `import { motion } from 'framer-motion';

export const Hoverable${toPascalCase(request.element)} = ({ children, onClick }) => (
  <motion.div
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
    transition={{ type: "spring", stiffness: 400, damping: 17 }}
    onClick={onClick}
  >
    {children}
  </motion.div>
);`;
  }

  if (request.type === 'loading') {
    return `import { motion } from 'framer-motion';

export const Loading${toPascalCase(request.element)} = () => (
  <motion.div
    animate={{
      rotate: 360,
    }}
    transition={{
      duration: 1,
      repeat: Infinity,
      ease: "linear"
    }}
    style={{
      width: 24,
      height: 24,
      border: "2px solid #E5E7EB",
      borderTopColor: "#3B82F6",
      borderRadius: "50%"
    }}
  />
);`;
  }

  return preset.framerMotion || preset.css;
}

function generateGSAPCode(
  request: AnimationRequest,
  preset: AnimationPreset,
  easing: string,
  duration: number
): string {
  const durationSec = duration / 1000;

  if (request.type === 'entrance') {
    return `import { gsap } from 'gsap';
import { useLayoutEffect, useRef } from 'react';

export const Animated${toPascalCase(request.element)} = ({ children }) => {
  const ref = useRef(null);
  
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(ref.current, {
        opacity: 0,
        y: 20,
        duration: ${durationSec},
        ease: "power2.out"
      });
    });
    
    return () => ctx.revert();
  }, []);
  
  return <div ref={ref}>{children}</div>;
};`;
  }

  if (request.type === 'scroll') {
    return `import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLayoutEffect, useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

export const ScrollAnimated${toPascalCase(request.element)} = ({ children }) => {
  const ref = useRef(null);
  
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(ref.current, {
        opacity: 0,
        y: 50,
        duration: ${durationSec},
        ease: "power2.out",
        scrollTrigger: {
          trigger: ref.current,
          start: "top 80%",
          toggleActions: "play none none reverse"
        }
      });
    });
    
    return () => ctx.revert();
  }, []);
  
  return <div ref={ref}>{children}</div>;
};`;
  }

  return preset.gsap || preset.css;
}

function generateReactSpringCode(
  request: AnimationRequest,
  preset: AnimationPreset,
  duration: number
): string {
  return `import { useSpring, animated } from '@react-spring/web';

export const Animated${toPascalCase(request.element)} = ({ children }) => {
  const springs = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 280, friction: 20 }
  });
  
  return (
    <animated.div style={springs}>
      {children}
    </animated.div>
  );
};`;
}

function generateAnimeJSCode(
  request: AnimationRequest,
  preset: AnimationPreset,
  easing: string,
  duration: number
): string {
  return `import anime from 'animejs';
import { useEffect, useRef } from 'react';

export const Animated${toPascalCase(request.element)} = ({ children }) => {
  const ref = useRef(null);
  
  useEffect(() => {
    anime({
      targets: ref.current,
      opacity: [0, 1],
      translateY: [20, 0],
      duration: ${duration},
      easing: 'easeOutCubic'
    });
  }, []);
  
  return <div ref={ref}>{children}</div>;
};`;
}

function generateCSSCode(
  request: AnimationRequest,
  preset: AnimationPreset,
  easing: string,
  duration: number
): string {
  return `/* ${request.element} ${request.type} Animation */

@keyframes ${request.element}${toPascalCase(request.type)} {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.${request.element}-${request.type} {
  animation: ${request.element}${toPascalCase(request.type)} ${duration}ms ${easing} forwards;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .${request.element}-${request.type} {
    animation: none;
    opacity: 1;
    transform: none;
  }
}`;
}

function generateCSSKeyframes(request: AnimationRequest, preset: AnimationPreset): string {
  return preset.css;
}

function generateUsageExample(request: AnimationRequest, code: string): string {
  if (request.library === 'framer-motion') {
    return `// Import the animated component
import { Animated${toPascalCase(request.element)} } from './animations';

// Use in your component
function MyComponent() {
  return (
    <Animated${toPascalCase(request.element)}>
      <div className="${request.element}">
        Your content here
      </div>
    </Animated${toPascalCase(request.element)}>
  );
}`;
  }

  if (request.library === 'css') {
    return `<!-- Add the CSS class to your element -->
<div class="${request.element}-${request.type}">
  Your content here
</div>

<!-- Or trigger with JavaScript -->
<script>
  element.classList.add('${request.element}-${request.type}');
</script>`;
  }

  return `// See the generated code above for usage`;
}

function generateAlternatives(
  request: AnimationRequest,
  preset: AnimationPreset
): AnimationOutput['alternatives'] {
  const alternatives: AnimationOutput['alternatives'] = [];

  if (request.library !== 'css' && preset.css) {
    alternatives.push({ library: 'CSS', code: preset.css });
  }
  if (request.library !== 'framer-motion' && preset.framerMotion) {
    alternatives.push({ library: 'Framer Motion', code: preset.framerMotion });
  }
  if (request.library !== 'gsap' && preset.gsap) {
    alternatives.push({ library: 'GSAP', code: preset.gsap });
  }

  return alternatives;
}

function generatePerformanceTips(request: AnimationRequest): string[] {
  const tips: string[] = [];

  tips.push('Use transform and opacity for smooth 60fps animations');
  tips.push('Avoid animating width, height, top, left (triggers layout)');
  tips.push('Use will-change sparingly on elements that will animate');

  if (request.type === 'scroll') {
    tips.push('Throttle scroll handlers or use Intersection Observer');
    tips.push('Consider using CSS scroll-timeline for better performance');
  }

  if (request.type === 'loading') {
    tips.push('Use CSS animations for looping effects (lower CPU)');
    tips.push('Avoid JS-based infinite loops');
  }

  tips.push('Test on low-end devices for real performance');

  return tips;
}

function generateAccessibilityCode(request: AnimationRequest): string {
  if (request.library === 'framer-motion') {
    return `// Framer Motion respects reduced motion automatically, or:
import { useReducedMotion } from 'framer-motion';

const shouldReduceMotion = useReducedMotion();
const animation = shouldReduceMotion ? {} : { y: [20, 0], opacity: [0, 1] };`;
  }

  return `@media (prefers-reduced-motion: reduce) {
  .${request.element}-${request.type} {
    animation: none;
    transition: none;
  }
}`;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// ============================================================================
// Get Animation Presets
// ============================================================================

export function getAnimationPresets(category?: string): AnimationPreset[] {
  const all = [
    ...Object.values(ENTRANCE_ANIMATIONS),
    ...Object.values(HOVER_ANIMATIONS),
    ...Object.values(LOADING_ANIMATIONS),
    ...Object.values(SCROLL_ANIMATIONS),
    ...Object.values(MICRO_INTERACTIONS)
  ];

  if (category) {
    return all.filter(p => p.category === category);
  }

  return all;
}

export default { generateAnimation, getAnimationPresets };
