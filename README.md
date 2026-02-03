
# Atlas MCP Server (`atlas-pipeline-mcp`)

**The Agentic AI Pipeline for your IDE.**
Works natively with **Cursor**, **GitHub Copilot**, **Windsurf**, and **VS Code**.

Atlas is an MCP server that gives your IDE "Agentic Superpowers". Instead of just creating code, it enables a full analysis pipeline:
**Intent → Context → Decomposition → Variants → Critique → Optimization**.

---

## 🚀 What's New in v1.0.19

**Performance Optimizations:**
- ⚡ **LRU Cache** - Intelligent caching for LLM responses and pipeline results
- 🔄 **Request Deduplication** - Prevents duplicate concurrent API calls
- 📊 **Metrics Collection** - Built-in performance monitoring with P50/P95/P99 stats
- 🔒 **Circuit Breaker** - Resilient provider connections with automatic recovery
- 🧹 **Session Management** - Automatic cleanup of stale thinking sessions
- 🚀 **Parallel Execution** - Independent pipeline stages run concurrently

**All 15 Powerful Tools:**
- 🔒 **atlas_security** - Scan code for vulnerabilities (SQL injection, XSS, secrets, etc.)
- 🧪 **atlas_test** - Auto-generate comprehensive test cases
- 📚 **atlas_docs** - Generate documentation (JSDoc, TSDoc, PyDoc)
- 💡 **atlas_explain** - Explain code with complexity analysis & design patterns
- 🐛 **atlas_debug** - Debug errors with root cause analysis & fix suggestions
- 🧠 **atlas_think** - Advanced sequential reasoning with branching & verification

---

## Key Features

- **Zero Config**: No API keys required. It uses your IDE's built-in AI (Copilot/Cursor) for analysis.
- **Agentic Workflow**: Breaks down specific tasks into a DAG (Directed Acyclic Graph) of subtasks.
- **Optimization Loop**: Generates variants, critiques them, and produces a final optimized solution.
- **Context Aware**: Deeply analyzes project structure, file dependencies, and git history.
- **Security Scanner**: Detects vulnerabilities with CWE IDs and OWASP categories.
- **Test Generator**: Creates unit/integration tests for Jest, Vitest, Pytest, Mocha.
- **Smart Debugging**: Analyzes errors, parses stack traces, suggests fixes.
- **Sequential Thinking**: Advanced reasoning with branching, revision, and hypothesis verification.
- **High Performance**: LRU caching, request deduplication, and parallel execution.

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

## All Available Tools (15 Total)

| Tool | Description |
| :--- | :--- |
| `atlas_pipeline` | Full agentic pipeline: Intent → Context → Decompose → Variants → Critique → Optimize |
| `atlas_intent` | Analyze user intent from natural language |
| `atlas_context` | Gather project context, dependencies, and structure |
| `atlas_git` | Analyze Git history, branches, and file changes |
| `atlas_decompose` | Break down complex tasks into subtasks (DAG) |
| `atlas_variants` | Generate multiple solution approaches |
| `atlas_critique` | Review code for quality, security, best practices |
| `atlas_optimize` | Optimize code based on feedback |
| `atlas_security` | Scan for security vulnerabilities (CWE, OWASP) |
| `atlas_test` | Generate comprehensive test cases |
| `atlas_docs` | Generate documentation (JSDoc/TSDoc/PyDoc) |
| `atlas_explain` | Explain code with complexity & pattern analysis |
| `atlas_debug` | Debug errors with root cause analysis |
| `atlas_think` | Advanced sequential reasoning with branching |
| `atlas_providers` | Check LLM provider status |

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
| **Security Scan** | "**Scan this code for security vulnerabilities**." | `atlas_security` |
| **Generate Tests** | "**Generate tests** for this authentication module." | `atlas_test` |
| **Add Documentation** | "**Document** this API with examples." | `atlas_docs` |
| **Understand Code** | "**Explain** how this algorithm works." | `atlas_explain` |
| **Debug Error** | "**Debug** this TypeError, here's the stack trace..." | `atlas_debug` |
| **Complex Reasoning** | "**Think through** how to design this system." | `atlas_think` |
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

*Built by Nishant Unavane*
