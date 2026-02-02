# Atlas MCP Server

A powerful Model Context Protocol (MCP) server featuring a multi-stage AI pipeline for intelligent code generation. Works with **any LLM provider** (Ollama, OpenAI, Anthropic) and **any MCP-compatible IDE** (Cursor, GitHub Copilot, Claude Desktop, Windsurf, and more).

## 🚀 Features

- **7-Stage AI Pipeline**: Intent → Context → Git → Decompose → Variants → Critique → Optimize
- **Multi-Provider Support**: Automatically detects and uses Ollama, OpenAI, or Anthropic
- **IDE Agnostic**: Works with any MCP-compatible editor
- **Git Integration**: Analyzes repository history for context-aware code generation
- **Quality Assurance**: Built-in critique and optimization stages

## 📦 Installation

### From GitHub (Recommended)

```bash
# Clone the repository
git clone https://github.com/IamNishant51/atlas-mcp-server.git
cd atlas-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

### From npm (Coming Soon)

```bash
npm install -g atlas-mcp-server
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# For Ollama (local, free)
OLLAMA_BASE_URL=http://localhost:11434

# For OpenAI
OPENAI_API_KEY=your-openai-key

# For Anthropic
ANTHROPIC_API_KEY=your-anthropic-key
```

The server auto-detects available providers in this order: Anthropic → OpenAI → Ollama

### IDE Configuration

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/dist/mcp.js"]
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/dist/mcp.js"]
    }
  }
}
```

#### VS Code with GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/dist/mcp.js"]
    }
  }
}
```

#### Windsurf

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/dist/mcp.js"]
    }
  }
}
```

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `atlas_intent` | Analyze user intent and extract requirements |
| `atlas_context` | Gather project context (files, dependencies, patterns) |
| `atlas_git` | Analyze git history for coding patterns |
| `atlas_decompose` | Break down tasks into subtasks |
| `atlas_variants` | Generate multiple code implementation variants |
| `atlas_critique` | Evaluate code quality and provide feedback |
| `atlas_optimize` | Optimize code based on critique feedback |
| `atlas_pipeline` | Run the complete 7-stage pipeline |
| `atlas_providers` | List available LLM providers |

## 📊 Pipeline Stages

1. **Intent** - Understands what you want to build
2. **Context** - Gathers project structure, dependencies, and patterns
3. **Git** - Analyzes commit history for coding conventions
4. **Decompose** - Breaks complex tasks into manageable subtasks
5. **Variants** - Generates multiple implementation approaches
6. **Critique** - Evaluates each variant for quality and correctness
7. **Optimize** - Refines the best variant based on feedback

## 🏃 Running

### MCP Mode (for IDEs)

```bash
npm run start:mcp
# or
node dist/mcp.js
```

### HTTP Server Mode

```bash
npm start
# or
node dist/server.js
```

The HTTP server runs on port 3000 with these endpoints:
- `GET /health` - Health check
- `GET /api/info` - Server information
- `GET /api/models` - Available LLM models
- `POST /api/pipeline` - Run the full pipeline

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Links

- **GitHub**: https://github.com/IamNishant51/atlas-mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io
