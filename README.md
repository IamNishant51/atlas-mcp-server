
# Atlas MCP Server (`atlas-pipeline-mcp`)

**The Agentic AI Pipeline for your IDE.**
Works natively with **Cursor**, **GitHub Copilot**, **Windsurf**, and **VS Code**.

Atlas is an MCP server that gives your IDE "Agentic Superpowers". Instead of just creating code, it enables a full analysis pipeline:
**Intent → Context → Decomposition → Variants → Critique → Optimization**.

---

## 🚀 What's New in v1.0.22

**🔥 4 Advanced AI/ML Tools Added:**
- 🔍 **atlas_rag_search** - RAG-powered semantic code search with knowledge graphs
- 🤖 **atlas_ml_predict** - ML bug & performance prediction (70-85% accuracy)
- 🔄 **atlas_migrate** - Intelligent code migration (12 types: JS→TS, React upgrade, etc.)
- ✅ **atlas_testgen_advanced** - Advanced test generation with edge cases & mocks

**Professional Tools (13 Total):**
- 🔧 **atlas_refactor** - Code refactoring engine with complexity analysis
- ⚡ **atlas_profiler** - Performance profiling & bottleneck detection
- 📝 **atlas_review** - Automated code review with quality scores
- 📦 **atlas_dependencies** - Dependency analysis & vulnerability scanning
- 📊 **atlas_dashboard** - Interactive metrics dashboard generator
- 🔒 **atlas_security** - Security vulnerability scanning (CWE, OWASP)
- 🧪 **atlas_test** - Comprehensive test case generation
- 📚 **atlas_docs** - Auto-generate documentation (JSDoc, TSDoc, PyDoc)
- 💡 **atlas_explain** - Code explanation with complexity analysis
- 🐛 **atlas_debug** - Root cause analysis & fix suggestions
- 🧠 **atlas_think** - Advanced sequential reasoning with branching
- 🎯 **atlas_critique** - Code quality critique with actionable feedback
- 🚀 **atlas_optimize** - Code optimization based on best practices

---

## Key Features

- **Zero Config**: No API keys required. Uses your IDE's built-in AI (Copilot/Cursor) for analysis.
- **17 Professional Tools**: 13 core tools + 4 advanced AI/ML tools (RAG search, ML prediction, migration, advanced testing).
- **RAG-Powered Search**: Semantic code understanding with knowledge graphs - find code by asking "how does auth work?"
- **ML Bug Prediction**: Predict bugs before production with 70-85% accuracy based on complexity, churn, and patterns.
- **Intelligent Migration**: Automated code migration (JS→TS, React upgrades, Callbacks→Async) with breaking change detection.
- **Advanced Test Generation**: Generate comprehensive test suites with edge cases, mocks, and 90%+ coverage projection.
- **Agentic Workflow**: Breaks down tasks into a DAG (Directed Acyclic Graph) of subtasks.
- **Optimization Loop**: Generates variants, critiques them, produces optimized solutions.
- **Context Aware**: Analyzes project structure, file dependencies, and git history.
- **Security Scanner**: Detects vulnerabilities with CWE IDs and OWASP categories.
- **Smart Debugging**: Analyzes errors, parses stack traces, suggests fixes.
- **High Performance**: LRU caching, request deduplication, parallel execution.

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

## All Available Tools (17 Total)

### 🔥 Advanced AI/ML Tools (4)
| Tool | Description |
| :--- | :--- |
| `atlas_rag_search` | Semantic code search with RAG, knowledge graphs, and natural language queries |
| `atlas_ml_predict` | ML-powered bug & performance prediction with 70-85% accuracy |
| `atlas_migrate` | Intelligent code migration (12 types: JS→TS, React, Callbacks→Async, etc.) |
| `atlas_testgen_advanced` | Advanced test generation with edge cases, mocks, property-based testing |

### 🛠️ Professional Development Tools (13)
| Tool | Description |
| :--- | :--- |
| `atlas_pipeline` | Full agentic pipeline: Intent → Context → Decompose → Variants → Critique → Optimize |
| `atlas_refactor` | Code refactoring with complexity metrics and structural analysis |
| `atlas_profiler` | Performance profiling and bottleneck detection (O(n), O(n²), etc.) |
| `atlas_review` | Automated code review with quality scores and security checks |
| `atlas_dependencies` | Dependency analysis, unused package detection, vulnerability scanning |
| `atlas_dashboard` | Generate interactive HTML metrics dashboards |
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

### 🔥 Advanced AI/ML Tools
| Goal | What to Ask | Tool Used |
| :--- | :--- | :--- |
| **Semantic Code Search** | "Search for authentication code using RAG" | `atlas_rag_search` |
| **Predict Bugs** | "Predict bug probability in payment-processor.ts" | `atlas_ml_predict` |
| **Migrate Codebase** | "Migrate this file from JavaScript to TypeScript" | `atlas_migrate` |
| **Advanced Testing** | "Generate comprehensive tests with edge cases" | `atlas_testgen_advanced` |

### 🛠️ Professional Development Tools
| Goal | What to Ask | Tool Used |
| :--- | :--- | :--- |
| **Fix a complex file** | "Run the **pipeline** on `utils.ts` to refactor it." | `atlas_pipeline` |
| **Refactor Code** | "Refactor this code and reduce complexity" | `atlas_refactor` |
| **Performance Analysis** | "Profile this code for performance bottlenecks" | `atlas_profiler` |
| **Code Review** | "Review this PR for quality and security" | `atlas_review` |
| **Check Dependencies** | "Analyze dependencies and find unused packages" | `atlas_dependencies` |
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
