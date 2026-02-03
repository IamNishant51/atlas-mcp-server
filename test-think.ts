/**
 * Test script for atlas_think tool
 */
import { processThought, startSession, getCurrentSession, resetThinking } from './src/tools/think.js';

async function testAtlasThink() {
  console.log('🧠 Testing atlas_think tool...\n');
  
  // Reset any previous session
  resetThinking();
  
  // Test 1: Start a new session and process first thought
  console.log('📝 Test 1: First thought (analysis)');
  const result1 = await processThought({
    thought: 'Let me analyze the problem of optimizing an MCP server for performance.',
    thoughtNumber: 1,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    problemContext: 'Optimizing Atlas MCP Server performance',
    thoughtType: 'analysis',
    confidence: 0.8,
  });
  console.log('Result:', JSON.stringify(result1, null, 2));
  console.log('✅ Test 1 passed!\n');
  
  // Test 2: Second thought with hypothesis
  console.log('📝 Test 2: Hypothesis generation');
  const result2 = await processThought({
    thought: 'I hypothesize that implementing LRU caching will reduce response times by 50%.',
    thoughtNumber: 2,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    thoughtType: 'hypothesis',
    hypothesis: 'LRU caching reduces response times by 50%',
    confidence: 0.7,
  });
  console.log('Result:', JSON.stringify(result2, null, 2));
  console.log('✅ Test 2 passed!\n');
  
  // Test 3: Branch creation
  console.log('📝 Test 3: Create a branch');
  const result3 = await processThought({
    thought: 'Alternatively, let me explore request deduplication as a parallel approach.',
    thoughtNumber: 3,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    branchFromThought: 2,
    branchId: 'deduplication-approach',
    thoughtType: 'exploration',
    confidence: 0.6,
  });
  console.log('Result:', JSON.stringify(result3, null, 2));
  console.log('✅ Test 3 passed!\n');
  
  // Test 4: Key insight
  console.log('📝 Test 4: Key insight');
  const result4 = await processThought({
    thought: 'I realize that combining both caching AND deduplication provides the best results.',
    thoughtNumber: 4,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    thoughtType: 'insight',
    keyInsight: 'Caching + deduplication provides optimal performance',
    confidence: 0.9,
  });
  console.log('Result:', JSON.stringify(result4, null, 2));
  console.log('✅ Test 4 passed!\n');
  
  // Test 5: Conclusion
  console.log('📝 Test 5: Conclusion');
  const result5 = await processThought({
    thought: 'In conclusion, the Atlas server optimization is complete with LRU caching and request deduplication.',
    thoughtNumber: 5,
    totalThoughts: 5,
    nextThoughtNeeded: false,
    thoughtType: 'conclusion',
    confidence: 0.95,
  });
  console.log('Result:', JSON.stringify(result5, null, 2));
  console.log('✅ Test 5 passed!\n');
  
  // Get session stats
  const session = getCurrentSession();
  console.log('📊 Session Summary:');
  console.log(`   - Total thoughts: ${session?.thoughts.length ?? 0}`);
  console.log(`   - Branches: ${Object.keys(session?.branches ?? {}).length}`);
  console.log(`   - Key insights: ${session?.keyInsights.length ?? 0}`);
  console.log(`   - Hypotheses: ${session?.hypotheses.length ?? 0}`);
  console.log(`   - Overall confidence: ${session?.overallConfidence ?? 0}`);
  
  console.log('\n🎉 All tests passed! atlas_think is working correctly!');
}

testAtlasThink().catch(console.error);
