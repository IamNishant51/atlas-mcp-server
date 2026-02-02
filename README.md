# Atlas MCP Server

[![npm version](https://badge.fury.io/js/atlas-mcp-server.svg)](https://www.npmjs.com/package/atlas-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-grade **Model Context Protocol (MCP)** server with a multi-stage AI pipeline. Works with **any LLM provider** (Ollama, OpenAI, Anthropic) and **any IDE** that supports MCP (Cursor, GitHub Copilot, Windsurf, Claude Desktop, and more).

## 🚀 Features

- **Multi-Stage AI Pipeline**: Intent → Context → Git → Decompose → Variants → Critique → Optimize
- **Universal LLM Support**: Works with Ollama (local), OpenAI, Anthropic - auto-detects available providers
- **IDE Integration**: Full MCP protocol support for seamless IDE integration
- **Git-Aware**: Understands repository state, history, and uncommitted changes
- **Variant Generation**: Creates multiple solution approaches with trade-off analysis
- **Self-Critique**: Automatically reviews and scores generated solutions
- **Optimization**: Refines the best solution based on critique feedback
- **Zero Configuration**: Auto-detects models and providers - just works out of the box

## 📦 Quick Install

```bash
# Install globally
npm install -g atlas-mcp-server

# Or use directly with npx
npx atlas-mcp-server
```

## 🔧 IDE Integration

### Cursor IDE

Add to your Cursor settings (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "atlas": {
      "command": "npx",
      "args": ["atlas-mcp-server"],
      "env": {
        "OLLAMA_BASE_URL": "http://localhost:11434"
      }
    }
  }
}
```

### GitHub Copilot (VS Code)

Add to your VS Code settings (`.vscode/mcp.json`):

```json
{
  "servers": {
    "atlas": {
      "command": "npx",
      "args": ["atlas-mcp-server"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "atlas": {
      "command": "npx",
      "args": ["atlas-mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "npx",
      "args": ["atlas-mcp-server"]
    }
  }
}
```

## 🛠️ Available Tools

Once connected, these tools are available in your IDE:

| Tool | Description |
|------|-------------|
| `atlas_intent` | Analyze user intent from natural language |
| `atlas_context` | Gather project context and structure |
| `atlas_git` | Analyze Git repository state and history |
| `atlas_decompose` | Break down complex tasks into subtasks |
| `atlas_variants` | Generate multiple solution approaches |
| `atlas_critique` | Review and score code quality |
| `atlas_optimize` | Optimize code based on critique |
| `atlas_pipeline` | Run the full 7-stage pipeline |
| `atlas_providers` | Check available LLM providers |

## ⚙️ Configuration

Configure via environment variables:

```bash
# LLM Provider (auto-detects if not set)
LLM_PROVIDER=auto          # auto | ollama | openai | anthropic

# Ollama (local, free)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=              # Auto-detects first available model

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Logging
LOG_LEVEL=info             # debug | info | warn | error
```

## 📊 Pipeline Stages

| Stage | Description | Output |
|-------|-------------|--------|
| **Intent** | Analyzes user query to determine intent | `IntentAnalysis` |
| **Context** | Gathers project structure and relevant code | `PipelineContext` |
| **Git** | Retrieves repository state and history | `GitContext` |
| **Decompose** | Breaks complex requests into subtasks | `DecompositionResult` |
| **Variants** | Generates 2-3 different solution approaches | `VariantGenerationResult` |
| **Critique** | Reviews each variant for quality | `CritiqueResult` |
| **Optimize** | Refines the best variant | `OptimizedOutput` |

## 🖥️ HTTP Server Mode

Atlas also includes a standalone HTTP server for direct API access:

```bash
# Start the HTTP server
npm start
# or
atlas-server
```

### API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Run full pipeline
curl -X POST http://localhost:3000/api/pipeline \
  -H "Content-Type: application/json" \
  -d '{"query": "Create a TypeScript function to validate emails"}'

# Light pipeline (faster)
curl -X POST http://localhost:3000/api/pipeline/light \
  -H "Content-Type: application/json" \
  -d '{"query": "Explain async/await"}'

# List available models
curl http://localhost:3000/api/models
```

## 🏗️ Project Structure

```
atlas-server/
├── src/
│   ├── mcp.ts                 # MCP protocol server
│   ├── server.ts              # HTTP server
│   ├── pipeline.ts            # Pipeline orchestration
│   ├── types.ts               # TypeScript interfaces
│   ├── utils.ts               # Utilities
│   ├── providers/
│   │   ├── index.ts           # Provider exports
│   │   └── llm-provider.ts    # Multi-provider LLM abstraction
│   └── tools/
│       ├── intent.ts          # Intent analysis
│       ├── context.ts         # Context aggregation
│       ├── git.ts             # Git operations
│       ├── decompose.ts       # Task decomposition
│       ├── variants.ts        # Solution variants
│       ├── critique.ts        # Code review
│       ├── optimize.ts        # Optimization
│       └── ollama.ts          # Ollama client
├── package.json
├── tsconfig.json
└── .env.example
```

## 🔌 LLM Provider Priority

When `LLM_PROVIDER=auto` (default), providers are tried in this order:

1. **Anthropic** - If `ANTHROPIC_API_KEY` is set
2. **OpenAI** - If `OPENAI_API_KEY` is set
3. **Ollama** - If running locally (always checked last, free fallback)

## 📋 Requirements

- **Node.js** >= 20.0.0
- At least one LLM provider:
  - **Ollama** running locally, OR
  - **OpenAI API key**, OR
  - **Anthropic API key**

### Setting up Ollama (Free Local LLM)

```bash
# Install Ollama (macOS)
brew install ollama

# Install Ollama (Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.2
# or
ollama pull codellama
# or
ollama pull mistral

# Start Ollama server
ollama serve
```

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/atlas-mcp-server.git
cd atlas-mcp-server

# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```

## 📄 License

MIT - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 🙏 Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol)
- Powered by [Ollama](https://ollama.com), [OpenAI](https://openai.com), and [Anthropic](https://anthropic.com)
