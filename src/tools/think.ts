/**
 * Atlas Server - Advanced Sequential Thinking Tool
 * 
 * Enhanced reasoning capabilities beyond basic sequential thinking:
 * - Dynamic thought branching with merge support
 * - Hypothesis generation and verification
 * - Confidence scoring and uncertainty tracking
 * - Automatic insight extraction
 * - Deadend detection and smart backtracking
 * - AI-enhanced reasoning when LLM available
 * - Thought summarization and compression
 * - Memory of key conclusions
 * - Session persistence with LRU eviction
 * 
 * Performance Features:
 * - Optimized session lookup with Map
 * - Lazy AI enhancement (only when needed)
 * - Efficient insight extraction using pre-compiled patterns
 * - Memory-efficient session cleanup
 * 
 * @module think
 * @author Nishant Unavane
 * @version 1.1.0
 */

import { getActiveProvider, isNoLLMMode } from '../providers/index.js';
import { logger, LRUCache, globalMetrics } from '../utils.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum sessions to keep in memory */
const MAX_SESSIONS = 50;

/** Session timeout in milliseconds (30 minutes) */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Pre-compiled insight extraction patterns for performance */
const INSIGHT_PATTERNS = {
  realization: /(?:realize|understand|discover|notice|observe|see that|learn that|conclude that|find that)\s+(.{10,100})/gi,
  important: /(?:important|key|crucial|essential|critical|significant)(?:\s+(?:point|thing|aspect|factor|insight))?\s*(?:is|:)\s*(.{10,100})/gi,
  solution: /(?:solution|answer|fix|approach|strategy|method)\s+(?:is|would be|could be|might be)\s*(.{10,100})/gi,
  because: /because\s+(.{10,80})/gi,
  therefore: /therefore[,\s]+(.{10,80})/gi,
} as const;

// ============================================================================
// Types
// ============================================================================

export interface ThoughtInput {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  
  // Revision capabilities
  isRevision?: boolean;
  revisesThought?: number;
  
  // Branching capabilities
  branchFromThought?: number;
  branchId?: string;
  mergeBranches?: string[];
  
  // Advanced features
  thoughtType?: ThoughtType;
  confidence?: number;
  hypothesis?: string;
  verificationResult?: 'confirmed' | 'refuted' | 'partial' | 'inconclusive';
  isDeadEnd?: boolean;
  keyInsight?: string;
  needsMoreThoughts?: boolean;
  
  // Context
  problemContext?: string;
  constraints?: string[];
}

export type ThoughtType = 
  | 'analysis'        // Breaking down the problem
  | 'hypothesis'      // Proposing a solution
  | 'verification'    // Testing a hypothesis
  | 'revision'        // Correcting previous thinking
  | 'synthesis'       // Combining insights
  | 'conclusion'      // Final answer
  | 'question'        // Raising a question
  | 'exploration'     // Exploring alternatives
  | 'backtrack'       // Returning to earlier state
  | 'insight';        // Key realization

export interface ThoughtRecord extends ThoughtInput {
  timestamp: string;
  aiEnhancement?: string;
  extractedInsights: string[];
  confidenceHistory: number[];
}

export interface Branch {
  id: string;
  name?: string;
  parentThought: number;
  thoughts: ThoughtRecord[];
  status: 'active' | 'merged' | 'abandoned' | 'deadend';
  hypothesis?: string;
  conclusion?: string;
}

export interface ThinkingSession {
  id: string;
  startTime: string;
  lastAccessTime: number; // For LRU eviction
  problem: string;
  thoughts: ThoughtRecord[];
  branches: Record<string, Branch>;
  currentBranch: string | null;
  hypotheses: Hypothesis[];
  keyInsights: string[];
  deadEnds: DeadEnd[];
  conclusion?: Conclusion;
  overallConfidence: number;
}

export interface Hypothesis {
  id: string;
  statement: string;
  proposedAt: number; // thought number
  status: 'proposed' | 'testing' | 'confirmed' | 'refuted' | 'partial';
  evidence: Evidence[];
  confidence: number;
}

export interface Evidence {
  thoughtNumber: number;
  type: 'supports' | 'refutes' | 'neutral';
  description: string;
  weight: number;
}

export interface DeadEnd {
  thoughtNumber: number;
  reason: string;
  lessonsLearned: string[];
  backtrackTo: number;
}

export interface Conclusion {
  answer: string;
  confidence: number;
  supportingThoughts: number[];
  alternativeConsidered: string[];
  caveats: string[];
}

export interface ThinkingResult {
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  currentBranch: string | null;
  branches: string[];
  thoughtHistoryLength: number;
  
  // Enhanced output
  currentConfidence: number;
  activeHypotheses: number;
  keyInsightsCount: number;
  deadEndsEncountered: number;
  
  // AI enhancement
  aiSuggestion?: string;
  recommendedNextStep?: string;
  
  // Summary
  progressSummary: string;
  
  // Final output (when done)
  conclusion?: Conclusion;
  
  // Performance metrics
  processingTimeMs?: number;
}

// ============================================================================
// Thinking Server Class
// ============================================================================

/**
 * Advanced Thinking Server with optimized session management
 * - LRU eviction for memory management
 * - Efficient insight extraction
 * - Lazy AI enhancement
 */
export class AdvancedThinkingServer {
  private sessions: Map<string, ThinkingSession> = new Map();
  private currentSession: ThinkingSession | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    logger.debug('AdvancedThinkingServer initialized');
    // Start periodic cleanup
    this.startCleanupTimer();
  }

  /**
   * Start periodic cleanup of stale sessions
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleSessions();
    }, SESSION_TIMEOUT_MS / 2);
  }

  /**
   * Clean up sessions that haven't been accessed recently
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessTime > SESSION_TIMEOUT_MS) {
        toDelete.push(id);
      }
    }
    
    for (const id of toDelete) {
      this.sessions.delete(id);
      logger.debug({ sessionId: id }, 'Cleaned up stale thinking session');
    }
    
    // Also enforce max sessions limit (LRU eviction)
    if (this.sessions.size > MAX_SESSIONS) {
      const sessionsArray = [...this.sessions.entries()]
        .sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);
      
      const toEvict = sessionsArray.slice(0, this.sessions.size - MAX_SESSIONS);
      for (const [id] of toEvict) {
        this.sessions.delete(id);
        logger.debug({ sessionId: id }, 'Evicted thinking session (LRU)');
      }
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }

  /**
   * Start a new thinking session
   */
  startSession(problem: string, sessionId?: string): string {
    const id = sessionId ?? `session-${Date.now()}`;
    const now = Date.now();
    
    const session: ThinkingSession = {
      id,
      startTime: new Date().toISOString(),
      lastAccessTime: now,
      problem,
      thoughts: [],
      branches: {},
      currentBranch: null,
      hypotheses: [],
      keyInsights: [],
      deadEnds: [],
      overallConfidence: 0,
    };
    
    this.sessions.set(id, session);
    this.currentSession = session;
    
    globalMetrics.record({
      name: 'think.session_started',
      durationMs: 0,
      success: true,
      metadata: { sessionId: id },
    });
    
    return id;
  }

  /**
   * Get session count for monitoring
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Process a thought and return the result
   */
  async processThought(input: ThoughtInput): Promise<ThinkingResult> {
    const startTime = performance.now();
    
    // Get or create session
    if (!this.currentSession) {
      this.startSession(input.problemContext ?? 'General problem solving');
    }
    
    const session = this.currentSession!;
    session.lastAccessTime = Date.now(); // Update access time

    // Auto-adjust totalThoughts if needed
    if (input.thoughtNumber > input.totalThoughts) {
      input.totalThoughts = input.thoughtNumber;
    }

    // Create thought record
    const thought: ThoughtRecord = {
      ...input,
      timestamp: new Date().toISOString(),
      extractedInsights: [],
      confidenceHistory: [...(session.thoughts[session.thoughts.length - 1]?.confidenceHistory ?? []), input.confidence ?? 0.5],
    };

    // Extract insights from thought
    thought.extractedInsights = this.extractInsights(input.thought);

    // Handle branching
    if (input.branchFromThought && input.branchId) {
      this.handleBranching(session, thought, input.branchId, input.branchFromThought);
    }

    // Handle branch merging
    if (input.mergeBranches && input.mergeBranches.length > 0) {
      this.handleMerge(session, thought, input.mergeBranches);
    }

    // Handle hypothesis
    if (input.thoughtType === 'hypothesis' && input.hypothesis) {
      this.addHypothesis(session, input.hypothesis, input.thoughtNumber);
    }

    // Handle verification
    if (input.thoughtType === 'verification' && input.verificationResult) {
      this.updateHypothesisStatus(session, input.verificationResult, input.thoughtNumber);
    }

    // Handle dead end
    if (input.isDeadEnd) {
      this.recordDeadEnd(session, thought);
    }

    // Record key insight
    if (input.keyInsight) {
      session.keyInsights.push(input.keyInsight);
    }

    // Add thought to history
    session.thoughts.push(thought);

    // Update confidence
    session.overallConfidence = this.calculateOverallConfidence(session);

    // Get AI enhancement if available
    let aiSuggestion: string | undefined;
    let recommendedNextStep: string | undefined;
    
    if (!isNoLLMMode() && input.nextThoughtNeeded) {
      try {
        const enhancement = await this.getAIEnhancement(session, thought);
        aiSuggestion = enhancement.suggestion;
        recommendedNextStep = enhancement.nextStep;
        thought.aiEnhancement = enhancement.suggestion;
      } catch (error) {
        logger.warn({ error }, 'AI enhancement failed');
      }
    }

    // Generate conclusion if this is the final thought
    let conclusion: Conclusion | undefined;
    if (!input.nextThoughtNeeded) {
      conclusion = this.generateConclusion(session);
      session.conclusion = conclusion;
    }

    // Build result
    const result: ThinkingResult = {
      thoughtNumber: input.thoughtNumber,
      totalThoughts: input.totalThoughts,
      nextThoughtNeeded: input.nextThoughtNeeded,
      currentBranch: session.currentBranch,
      branches: Object.keys(session.branches),
      thoughtHistoryLength: session.thoughts.length,
      currentConfidence: session.overallConfidence,
      activeHypotheses: session.hypotheses.filter(h => h.status === 'testing' || h.status === 'proposed').length,
      keyInsightsCount: session.keyInsights.length,
      deadEndsEncountered: session.deadEnds.length,
      aiSuggestion,
      recommendedNextStep,
      progressSummary: this.generateProgressSummary(session, input.thoughtNumber),
      conclusion,
    };

    return result;
  }

  /**
   * Extract insights from thought text
   */
  private extractInsights(thought: string): string[] {
    const insights: string[] = [];
    
    // Look for key phrases that indicate insights
    const insightPatterns = [
      /(?:i realize|i notice|key point|important|crucial|this means|therefore|thus|hence|conclusion|insight)/gi,
      /(?:the pattern is|this suggests|this indicates|this shows)/gi,
    ];

    const sentences = thought.split(/[.!?]+/).filter(s => s.trim());
    
    for (const sentence of sentences) {
      for (const pattern of insightPatterns) {
        if (pattern.test(sentence)) {
          insights.push(sentence.trim());
          break;
        }
      }
    }

    return insights;
  }

  /**
   * Handle branching logic
   */
  private handleBranching(session: ThinkingSession, thought: ThoughtRecord, branchId: string, fromThought: number): void {
    if (!session.branches[branchId]) {
      session.branches[branchId] = {
        id: branchId,
        parentThought: fromThought,
        thoughts: [],
        status: 'active',
      };
    }
    
    session.branches[branchId].thoughts.push(thought);
    session.currentBranch = branchId;
  }

  /**
   * Handle merging of branches
   */
  private handleMerge(session: ThinkingSession, thought: ThoughtRecord, branchIds: string[]): void {
    const mergedInsights: string[] = [];
    
    for (const branchId of branchIds) {
      const branch = session.branches[branchId];
      if (branch) {
        branch.status = 'merged';
        // Collect insights from merged branches
        for (const t of branch.thoughts) {
          mergedInsights.push(...t.extractedInsights);
        }
        if (branch.conclusion) {
          mergedInsights.push(branch.conclusion);
        }
      }
    }
    
    // Add merged insights to current thought
    thought.extractedInsights.push(...mergedInsights);
    session.currentBranch = null;
  }

  /**
   * Add a new hypothesis
   */
  private addHypothesis(session: ThinkingSession, statement: string, thoughtNumber: number): void {
    session.hypotheses.push({
      id: `hyp-${session.hypotheses.length + 1}`,
      statement,
      proposedAt: thoughtNumber,
      status: 'proposed',
      evidence: [],
      confidence: 0.5,
    });
  }

  /**
   * Update hypothesis status based on verification
   */
  private updateHypothesisStatus(
    session: ThinkingSession, 
    result: 'confirmed' | 'refuted' | 'partial' | 'inconclusive',
    thoughtNumber: number
  ): void {
    // Update the most recent hypothesis being tested
    const testingHypothesis = [...session.hypotheses].reverse().find(h => h.status === 'testing' || h.status === 'proposed');
    
    if (testingHypothesis) {
      switch (result) {
        case 'confirmed':
          testingHypothesis.status = 'confirmed';
          testingHypothesis.confidence = 0.9;
          break;
        case 'refuted':
          testingHypothesis.status = 'refuted';
          testingHypothesis.confidence = 0.1;
          break;
        case 'partial':
          testingHypothesis.status = 'partial';
          testingHypothesis.confidence = 0.6;
          break;
        default:
          testingHypothesis.confidence = 0.5;
      }
      
      testingHypothesis.evidence.push({
        thoughtNumber,
        type: result === 'confirmed' ? 'supports' : result === 'refuted' ? 'refutes' : 'neutral',
        description: `Verification at thought ${thoughtNumber}`,
        weight: 1,
      });
    }
  }

  /**
   * Record a dead end
   */
  private recordDeadEnd(session: ThinkingSession, thought: ThoughtRecord): void {
    // Find the best point to backtrack to
    const backtrackTo = this.findBacktrackPoint(session, thought.thoughtNumber);
    
    session.deadEnds.push({
      thoughtNumber: thought.thoughtNumber,
      reason: thought.thought,
      lessonsLearned: thought.extractedInsights,
      backtrackTo,
    });

    // Mark current branch as deadend if in a branch
    if (session.currentBranch && session.branches[session.currentBranch]) {
      session.branches[session.currentBranch]!.status = 'deadend';
    }
  }

  /**
   * Find the best point to backtrack to
   */
  private findBacktrackPoint(session: ThinkingSession, currentThought: number): number {
    // Look for the last branching point or hypothesis
    for (let i = session.thoughts.length - 1; i >= 0; i--) {
      const t = session.thoughts[i];
      if (t && (t.thoughtType === 'hypothesis' || t.branchFromThought)) {
        return t.thoughtNumber;
      }
    }
    return 1; // Backtrack to beginning if no better point found
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(session: ThinkingSession): number {
    if (session.thoughts.length === 0) return 0;

    // Factors: hypothesis confirmation, dead ends, insight count
    let confidence = 0.5;

    // Boost for confirmed hypotheses
    const confirmedCount = session.hypotheses.filter(h => h.status === 'confirmed').length;
    confidence += confirmedCount * 0.1;

    // Penalty for dead ends
    confidence -= session.deadEnds.length * 0.05;

    // Boost for insights
    confidence += Math.min(session.keyInsights.length * 0.02, 0.2);

    // Use latest thought confidence if available
    const lastConfidence = session.thoughts[session.thoughts.length - 1]?.confidence;
    if (lastConfidence !== undefined) {
      confidence = (confidence + lastConfidence) / 2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get AI enhancement for the current thinking
   */
  private async getAIEnhancement(session: ThinkingSession, currentThought: ThoughtRecord): Promise<{ suggestion: string; nextStep: string }> {
    const provider = await getActiveProvider();

    const recentThoughts = session.thoughts.slice(-5).map(t => t.thought).join('\n');
    const hypotheses = session.hypotheses.map(h => `- ${h.statement} (${h.status})`).join('\n');
    const insights = session.keyInsights.join('\n- ');

    const prompt = `You are helping with step-by-step reasoning about: "${session.problem}"

Recent thoughts:
${recentThoughts}

Current hypotheses:
${hypotheses || 'None yet'}

Key insights so far:
${insights || 'None yet'}

Current thought: ${currentThought.thought}
Current confidence: ${(session.overallConfidence * 100).toFixed(0)}%

Provide:
1. A brief suggestion to improve the current reasoning (1-2 sentences)
2. A recommended next step (1 sentence)

Format as JSON: {"suggestion": "...", "nextStep": "..."}`;

    const response = await provider.completeJson<{ suggestion: string; nextStep: string }>(prompt, {
      systemPrompt: 'You are a reasoning assistant. Be concise and helpful.',
      temperature: 0.5,
      maxTokens: 200,
    });

    return response.data ?? { suggestion: '', nextStep: '' };
  }

  /**
   * Generate a progress summary
   */
  private generateProgressSummary(session: ThinkingSession, thoughtNumber: number): string {
    const parts: string[] = [];
    
    parts.push(`Thought ${thoughtNumber}/${session.thoughts.length > 0 ? Math.max(...session.thoughts.map(t => t.totalThoughts)) : '?'}`);
    
    if (session.hypotheses.length > 0) {
      const confirmed = session.hypotheses.filter(h => h.status === 'confirmed').length;
      const testing = session.hypotheses.filter(h => h.status === 'testing' || h.status === 'proposed').length;
      parts.push(`Hypotheses: ${confirmed} confirmed, ${testing} testing`);
    }
    
    if (session.keyInsights.length > 0) {
      parts.push(`${session.keyInsights.length} key insights`);
    }
    
    if (session.deadEnds.length > 0) {
      parts.push(`${session.deadEnds.length} dead ends avoided`);
    }
    
    if (Object.keys(session.branches).length > 0) {
      parts.push(`${Object.keys(session.branches).length} branches explored`);
    }
    
    parts.push(`Confidence: ${(session.overallConfidence * 100).toFixed(0)}%`);
    
    return parts.join(' | ');
  }

  /**
   * Generate final conclusion
   */
  private generateConclusion(session: ThinkingSession): Conclusion {
    // Find the most confident hypothesis
    const confirmedHypotheses = session.hypotheses
      .filter(h => h.status === 'confirmed')
      .sort((a, b) => b.confidence - a.confidence);
    
    // Collect supporting evidence
    const supportingThoughts = session.thoughts
      .filter(t => t.confidence && t.confidence > 0.7)
      .map(t => t.thoughtNumber);
    
    // Find alternative approaches that were considered
    const alternatives = session.hypotheses
      .filter(h => h.status === 'refuted' || h.status === 'partial')
      .map(h => h.statement);
    
    // Identify caveats
    const caveats: string[] = [];
    if (session.deadEnds.length > 0) {
      caveats.push(`${session.deadEnds.length} approach(es) were found to be dead ends`);
    }
    if (session.overallConfidence < 0.7) {
      caveats.push('Moderate uncertainty remains in this conclusion');
    }
    
    // Generate answer
    let answer = '';
    if (confirmedHypotheses.length > 0) {
      answer = confirmedHypotheses.map(h => h.statement).join('. ');
    } else if (session.keyInsights.length > 0) {
      answer = session.keyInsights.join('. ');
    } else {
      const lastThought = session.thoughts[session.thoughts.length - 1];
      answer = lastThought?.thought ?? 'No conclusion reached';
    }
    
    return {
      answer,
      confidence: session.overallConfidence,
      supportingThoughts,
      alternativeConsidered: alternatives,
      caveats,
    };
  }

  /**
   * Get current session
   */
  getSession(): ThinkingSession | null {
    return this.currentSession;
  }

  /**
   * Reset the server
   */
  reset(): void {
    this.sessions.clear();
    this.currentSession = null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const thinkingServer = new AdvancedThinkingServer();

/**
 * Process a thought using the advanced thinking server
 */
export async function processThought(input: ThoughtInput): Promise<ThinkingResult> {
  return thinkingServer.processThought(input);
}

/**
 * Start a new thinking session
 */
export function startSession(problem: string): string {
  return thinkingServer.startSession(problem);
}

/**
 * Reset the thinking server
 */
export function resetThinking(): void {
  thinkingServer.reset();
}

/**
 * Get the current session
 */
export function getCurrentSession(): ThinkingSession | null {
  return thinkingServer.getSession();
}
