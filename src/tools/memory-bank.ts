import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getActiveProvider } from '../providers/llm-provider.js';

const MemoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  context: z.string(),
  key: z.string(),
  value: z.string(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(1).max(10).optional()
});

const MemoryStorageSchema = z.object({
  memories: z.array(MemoryEntrySchema),
  lastUpdated: z.string()
});

export const memoryBankTool = {
  name: 'atlas_memory_bank',
  description: 'Long-term memory storage across sessions. Store and retrieve important context, decisions, patterns, and learnings. Supports tagging, importance scoring, and semantic search.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['store', 'retrieve', 'search', 'list', 'clear'],
        description: 'Action to perform: store new memory, retrieve by key, search by query, list all, or clear memories'
      },
      key: {
        type: 'string',
        description: 'Unique identifier for the memory (required for store/retrieve)'
      },
      value: {
        type: 'string',
        description: 'Content to store (required for store action)'
      },
      context: {
        type: 'string',
        description: 'Context about this memory (e.g., project name, file path)'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization'
      },
      importance: {
        type: 'number',
        description: 'Importance rating 1-10 (default: 5)'
      },
      query: {
        type: 'string',
        description: 'Search query for semantic search'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)'
      }
    },
    required: ['action']
  }
};

export async function handleMemoryBank(args: any) {
  const memoryPath = path.join(process.cwd(), '.atlas', 'memory-bank.json');
  
  try {
    await fs.mkdir(path.dirname(memoryPath), { recursive: true });
    
    let storage: z.infer<typeof MemoryStorageSchema>;
    try {
      const data = await fs.readFile(memoryPath, 'utf-8');
      storage = JSON.parse(data);
    } catch {
      storage = { memories: [], lastUpdated: new Date().toISOString() };
    }

    const { action, key, value, context, tags, importance = 5, query, limit = 10 } = args;

    switch (action) {
      case 'store': {
        if (!key || !value) {
          return { error: 'Key and value required for store action' };
        }

        const existingIndex = storage.memories.findIndex(m => m.key === key);
        const existingMemory = existingIndex >= 0 ? storage.memories[existingIndex] : null;
        const memory: z.infer<typeof MemoryEntrySchema> = {
          id: existingMemory?.id || generateId(),
          timestamp: new Date().toISOString(),
          context: context || 'general',
          key,
          value,
          tags: tags || [],
          importance
        };

        if (existingIndex >= 0) {
          storage.memories[existingIndex] = memory;
        } else {
          storage.memories.push(memory);
        }

        storage.lastUpdated = new Date().toISOString();
        await fs.writeFile(memoryPath, JSON.stringify(storage, null, 2));

        return {
          action: 'stored',
          key,
          message: `Memory stored successfully${existingIndex >= 0 ? ' (updated existing)' : ''}`,
          importance
        };
      }

      case 'retrieve': {
        if (!key) {
          return { error: 'Key required for retrieve action' };
        }

        const memory = storage.memories.find(m => m.key === key);
        if (!memory) {
          return { error: `No memory found with key: ${key}` };
        }

        return {
          action: 'retrieved',
          memory
        };
      }

      case 'search': {
        if (!query) {
          return { error: 'Query required for search action' };
        }

        const results = await semanticSearch(storage.memories, query, limit);
        return {
          action: 'search',
          query,
          results,
          count: results.length
        };
      }

      case 'list': {
        const sorted = [...storage.memories].sort((a, b) => 
          (b.importance || 5) - (a.importance || 5)
        ).slice(0, limit);

        return {
          action: 'list',
          memories: sorted.map(m => ({
            key: m.key,
            context: m.context,
            importance: m.importance,
            timestamp: m.timestamp,
            tags: m.tags
          })),
          total: storage.memories.length,
          showing: sorted.length
        };
      }

      case 'clear': {
        const count = storage.memories.length;
        storage.memories = [];
        storage.lastUpdated = new Date().toISOString();
        await fs.writeFile(memoryPath, JSON.stringify(storage, null, 2));

        return {
          action: 'cleared',
          message: `Cleared ${count} memories`
        };
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  } catch (error: any) {
    return {
      error: 'Memory bank operation failed',
      details: error.message
    };
  }
}

async function semanticSearch(memories: any[], query: string, limit: number) {
  // Simple keyword-based search with scoring
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  const scored = memories.map(memory => {
    const text = `${memory.key} ${memory.value} ${memory.context} ${(memory.tags || []).join(' ')}`.toLowerCase();
    
    let score = 0;
    // Exact phrase match
    if (text.includes(queryLower)) score += 10;
    
    // Individual word matches
    for (const word of queryWords) {
      if (text.includes(word)) score += 2;
    }
    
    // Boost by importance
    score *= (memory.importance || 5) / 5;

    return { memory, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.memory);
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
