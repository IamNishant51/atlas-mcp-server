
const { spawn } = require('child_process');
const path = require('path');

// Use the local build to ensure we catch recent changes
const mcpScript = path.join(__dirname, 'dist', 'mcp.js');
const child = spawn('node', [mcpScript], {
  env: { ...process.env, LOG_LEVEL: 'silent' }
});

let buffer = '';
const pendingRequests = new Map();
let requestCounter = 0;

child.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); 

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const json = JSON.parse(line);
      
      // Handle Sampling Request (Mocking Client)
      if (json.method === 'sampling/createMessage') {
         // In a real scenario, this would go to the LLM (Antigravity/Copilot)
         // For this analysis script, we'll just acknowledge it
         const response = {
            jsonrpc: '2.0',
            id: json.id, 
            result: {
                role: 'assistant',
                content: { type: 'text', text: 'AI Analysis Mock: Project looks good, but types in llm-provider.ts need tightening.' },
                model: 'analysis-mock'
            }
         };
         child.stdin.write(JSON.stringify(response) + '\n');
         return;
      }

      if (json.id !== undefined && pendingRequests.has(json.id)) {
        const { resolve } = pendingRequests.get(json.id);
        resolve(json);
        pendingRequests.delete(json.id);
      }
    } catch (e) { }
  }
});

function callTool(name, args) {
  return new Promise((resolve) => {
    requestCounter++;
    const id = requestCounter;
    const req = {
      jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args }
    };
    pendingRequests.set(id, { resolve });
    child.stdin.write(JSON.stringify(req) + '\n');
  });
}

async function analyze() {
    console.log("🚀 Starting Atlas MCP Analysis...");
    
    // 1. Analyze Context
    const contextRes = await callTool('atlas_context', { 
        projectPath: __dirname,
        query: "Identify areas for code optimization and type safety improvements"
    });
    
    const contextContent = JSON.parse(contextRes.result.content[0].text);
    console.log("\n📁 Project Context Analysis:");
    if (contextContent.projectInfo) {
        console.log(`   - Language: ${contextContent.projectInfo.language}`);
        if (contextContent.projectInfo.structure && contextContent.projectInfo.structure.files) {
            console.log(`   - Files: ${contextContent.projectInfo.structure.files.length}`);
        } else {
             console.log(`   - Files: (Structure not available in partial context)`);
        }
        const deps = contextContent.projectInfo.dependencies || {};
        console.log(`   - Dependencies: ${Object.keys(deps).length}`);
    }

    // 2. Identify Issues (Simulated via Intent/Heuristics)
    const intentRes = await callTool('atlas_intent', { 
        message: "Refactor llm-provider.ts to remove 'any' types and improve error handling" 
    });
    const intent = JSON.parse(intentRes.result.content[0].text);
    console.log("\n🎯 Optimization Intent:");
    console.log(`   - Primary: ${intent.primaryIntent}`);
    console.log(`   - Confidence: ${intent.confidence}`);

    console.log("\n✅ Analysis Complete. Proceeding with optimizations...");
    process.exit(0);
}

// Init delay
setTimeout(analyze, 1000);
