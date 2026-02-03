
# Atlas MCP Server (`atlas-pipeline-mcp`)

**The Agentic AI Pipeline for your IDE.**
Works natively with **Cursor**, **GitHub Copilot**, **Windsurf**, and **VS Code**.

Atlas is an MCP server that gives your IDE "Agentic Superpowers". Instead of just creating code, it enables a full analysis pipeline:
**Intent → Context → Decomposition → Variants → Critique → Optimization**.

---

## Key Features

- **Zero Config**: No API keys required. It uses your IDE's built-in AI (Copilot/Cursor) for analysis.
- **Agentic Workflow**: Breaks down specific tasks into a DAG (Directed Acyclic Graph) of subtasks.
- **Optimization Loop**: Generates variants, critiques them, and produces a final optimized solution.
- **Context Aware**: Deeply analyzes project structure, file dependencies, and git history.

---

## Installation (1-Click Setup)

### 1. Install Globally
Open your terminal and run the following command to install the package globally via NPM:

```bash
npm install -g atlas-pipeline-mcp
```

### 2. Run Auto-Setup
Run the setup command to automatically configure your IDE (works for Cursor and VS Code):

```bash
atlas-mcp-setup
```

### 3. Restart IDE
Restart your editor. You should see the Atlas server connected in your MCP settings.

---

## How to Use (Cheat Sheet)

Once installed, simply chat with your AI Assistant (Copilot Chat or Cursor Chat). The server automatically activates based on your intent.

| Goal | What to Ask | Tool Used |
| :--- | :--- | :--- |
| **Fix a complex file** | "Run the **pipeline** on `utils.ts` to refactor it." | `atlas_pipeline` |
| **Plan a feature** | "**Decompose** the task of adding JWT auth." | `atlas_decompose` |
| **Explore ideas** | "Generate **3 variants** for this button component." | `atlas_variants` |
| **Review Code** | "**Critique** this code for security issues." | `atlas_critique` |
| **Polish Code** | "**Optimize** this function based on best practices." | `atlas_optimize` |
| **Project Context** | "Analyze the **project context** and dependencies." | `atlas_context` |

---

## Advanced Integration (Optional)

### Using Local LLMs
If you prefer running models locally (e.g. Ollama) or want to use your own API keys instead of your IDE's subscription, you can manually configure the server in your settings:

```json
"atlas": {
  "command": "npx",
  "args": ["-y", "atlas-pipeline-mcp"],
  "env": {
    "OLLAMA_BASE_URL": "http://localhost:11434",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-..."
  }
}
```

*Note: If no keys are provided, Atlas defaults to **Client Sampling mode**, delegating generation to your IDE.*

---

## Contributing

We welcome contributions to improve the Atlas pipeline.
- **Repository**: [github.com/IamNishant51/atlas-mcp-server](https://github.com/IamNishant51/atlas-mcp-server)
- **Issues**: Report bugs on GitHub.

---

*Built by Antigravity*
