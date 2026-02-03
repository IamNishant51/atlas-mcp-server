# Atlas MCP Server

<div align="center">

[![npm version](https://img.shields.io/npm/v/atlas-pipeline-mcp.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/atlas-pipeline-mcp)
[![npm downloads](https://img.shields.io/npm/dm/atlas-pipeline-mcp.svg?style=flat-square&color=green)](https://www.npmjs.com/package/atlas-pipeline-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js)](https://nodejs.org/)

**The Agentic AI Pipeline for your IDE**

Advanced AI/ML-powered development tools with RAG search, ML bug prediction, intelligent code migration, and comprehensive test generation.

[Installation](#installation-1-click-setup) • [Features](#key-features) • [Tools](#all-available-tools-17-total) • [Usage](#how-to-use-cheat-sheet) • [Documentation](#advanced-integration-optional)

</div>

---

## Overview

Atlas MCP Server gives your IDE "Agentic Superpowers" through a full analysis pipeline:

**Intent → Context → Decomposition → Variants → Critique → Optimization**

Works natively with **Cursor**, **Windsurf**, **Claude Desktop**, **GitHub Copilot**, and **VS Code**.

---

---

## ✨ What's New in v1.0.25

### 🌟 5 Advanced Senior Developer Tools (NEW!)

These tools help frontend developers think like senior engineers with AI-powered guidance:

<table>
<tr>
<td width="25%"><b>🧠 Senior Mentor</b></td>
<td>Architectural guidance from a 15+ year veteran perspective with trade-off analysis and senior lessons</td>
</tr>
<tr>
<td><b>⚡ Performance Optimizer</b></td>
<td>Deep performance analysis with Web Vitals optimization and bottleneck detection</td>
</tr>
<tr>
<td><b>🔒 Security Scanner</b></td>
<td>Enterprise-grade vulnerability detection with compliance assessment (GDPR, CCPA, HIPAA, PCI-DSS)</td>
</tr>
<tr>
<td><b>📦 State Management Architect</b></td>
<td>Pattern comparison and scalability analysis for Redux, Zustand, Jotai, Recoil, and more</td>
</tr>
<tr>
<td><b>🏗️ API Design Consultant</b></td>
<td>RESTful and GraphQL API design review with best practices and documentation templates</td>
</tr>
</table>

### Previous Releases (v1.0.23)

#### Advanced AI/ML Tools (4)

<table>
<tr>
<td width="25%"><b>RAG Search</b></td>
<td>Semantic code search with knowledge graphs and natural language queries</td>
</tr>
<tr>
<td><b>ML Predictor</b></td>
<td>Bug & performance prediction with 70-85% accuracy using machine learning</td>
</tr>
<tr>
<td><b>Code Migration</b></td>
<td>Intelligent migration (12 types: JS→TS, React upgrades, Callbacks→Async)</td>
</tr>
<tr>
<td><b>Test Generator</b></td>
<td>Advanced test generation with edge cases, mocks, and property-based testing</td>
</tr>
</table>

### Core Professional Tools (13)

<table>
<tr>
<td width="25%"><b>Refactor</b></td>
<td>Code refactoring engine with complexity analysis</td>
</tr>
<tr>
<td><b>Profiler</b></td>
<td>Performance profiling & bottleneck detection (O(n), O(n²), etc.)</td>
</tr>
<tr>
<td><b>Review</b></td>
<td>Automated code review with quality scores and security checks</td>
</tr>
<tr>
<td><b>Dependencies</b></td>
<td>Dependency analysis, unused package detection, vulnerability scanning</td>
</tr>
<tr>
<td><b>Dashboard</b></td>
<td>Interactive HTML metrics dashboards with real-time data</td>
</tr>
<tr>
<td><b>Security</b></td>
<td>Security vulnerability scanning (CWE, OWASP standards)</td>
</tr>
<tr>
<td><b>Test Gen</b></td>
<td>Comprehensive test case generation (Jest, Vitest, Pytest, Mocha)</td>
</tr>
<tr>
<td><b>Docs Gen</b></td>
<td>Auto-generate documentation (JSDoc, TSDoc, PyDoc)</td>
</tr>
</table>

---

## ✨ What's New in v1.0.23

---

## 🎯 Key Features

<table>
<tr>
<td width="50%" valign="top">

### 🤖 AI/ML Capabilities
- **RAG Search** - Semantic code understanding with knowledge graphs
- **ML Prediction** - Bug & performance forecasting (70-85% accuracy)
- **Code Migration** - 12 intelligent migration types
- **Test Generation** - Advanced test suites with edge cases

</td>
<td width="50%" valign="top">

### ⚡ Professional Tools
- **Full Pipeline** - Intent → Context → Variants → Optimize
- **Quality Analysis** - Code review, security, complexity
- **Performance** - Profiling, bottleneck detection
- **Automation** - Tests, docs, refactoring

</td>
</tr>
</table>

### 🌟 Why Atlas?

- **Zero Config**: No API keys required - uses your IDE's built-in AI (Copilot/Cursor)
- **22 Professional Tools**: 13 core + 4 advanced AI/ML + 5 senior developer tools
- **Agentic Workflow**: DAG-based task decomposition
- **Context Aware**: Project structure, dependencies, git history analysis
- **High Performance**: LRU caching, request deduplication, parallel execution

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

## 🛠️ All Available Tools (22 Total)

### 🔥 Advanced AI/ML Tools

<table>
<tr>
<td width="30%"><code>atlas_rag_search</code></td>
<td><b>RAG-Powered Semantic Search</b><br/>Natural language code search with knowledge graphs. Ask "how does auth work?" and get contextual results.</td>
</tr>
<tr>
<td><code>atlas_ml_predict</code></td>
<td><b>ML Bug & Performance Prediction</b><br/>Predict bugs before production with 70-85% accuracy. Analyzes complexity, churn, and code patterns.</td>
</tr>
<tr>
<td><code>atlas_migrate</code></td>
<td><b>Intelligent Code Migration</b><br/>Automated migration support for 12 types: JS→TS, React upgrades, Callbacks→Async, and more.</td>
</tr>
<tr>
<td><code>atlas_testgen_advanced</code></td>
<td><b>Advanced Test Generation</b><br/>Generate comprehensive test suites with edge cases, mocks, stubs, and 90%+ coverage projection.</td>
</tr>
</table>

### ⚡ Core Pipeline & Analysis Tools

<table>
<tr>
<td width="30%"><code>atlas_pipeline</code></td>
<td><b>Full Agentic Pipeline</b><br/>Complete workflow: Intent → Context → Decompose → Variants → Critique → Optimize</td>
</tr>
<tr>
<td><code>atlas_intent</code></td>
<td><b>Intent Analysis</b><br/>Extract actionable intent from natural language requests</td>
</tr>
<tr>
<td><code>atlas_context</code></td>
<td><b>Project Context Gathering</b><br/>Analyze project structure, dependencies, and file relationships</td>
</tr>
<tr>
<td><code>atlas_git</code></td>
<td><b>Git History Analysis</b><br/>Analyze commits, branches, file changes, and code evolution</td>
</tr>
<tr>
<td><code>atlas_decompose</code></td>
<td><b>Task Decomposition</b><br/>Break complex tasks into DAG (Directed Acyclic Graph) of subtasks</td>
</tr>
<tr>
<td><code>atlas_variants</code></td>
<td><b>Solution Variants</b><br/>Generate multiple implementation approaches with pros/cons analysis</td>
</tr>
</table>

### 🎯 Quality & Optimization Tools

<table>
<tr>
<td width="30%"><code>atlas_review</code></td>
<td><b>Automated Code Review</b><br/>Comprehensive analysis with quality scores, security checks, and best practice validation</td>
</tr>
<tr>
<td><code>atlas_critique</code></td>
<td><b>Code Critique</b><br/>Deep review for quality, security, performance, and maintainability</td>
</tr>
<tr>
<td><code>atlas_optimize</code></td>
<td><b>Code Optimization</b><br/>Apply improvements based on critique feedback and best practices</td>
</tr>
<tr>
<td><code>atlas_refactor</code></td>
<td><b>Smart Refactoring</b><br/>Code restructuring with complexity metrics and structural analysis</td>
</tr>
<tr>
<td><code>atlas_security</code></td>
<td><b>Security Scanner</b><br/>Detect vulnerabilities with CWE IDs and OWASP category mapping</td>
</tr>
</table>

### 🧠 Advanced Senior Developer Tools (NEW!)

<table>
<tr>
<td width="30%"><code>atlas_senior_mentor</code></td>
<td><b>Senior Mentor</b><br/>Architectural guidance from 15+ year veteran perspective with trade-off analysis and senior lessons</td>
</tr>
<tr>
<td><code>atlas_performance_optimizer</code></td>
<td><b>Performance Optimizer</b><br/>Deep performance analysis with Web Vitals optimization and bottleneck detection</td>
</tr>
<tr>
<td><code>atlas_security_scanner</code></td>
<td><b>Security Scanner Pro</b><br/>Enterprise-grade vulnerability detection with compliance assessment (GDPR, CCPA, HIPAA, PCI-DSS)</td>
</tr>
<tr>
<td><code>atlas_state_architect</code></td>
<td><b>State Management Architect</b><br/>Pattern comparison and scalability analysis for Redux, Zustand, Jotai, Recoil</td>
</tr>
<tr>
<td><code>atlas_api_consultant</code></td>
<td><b>API Design Consultant</b><br/>RESTful and GraphQL API design review with best practices and documentation templates</td>
</tr>
</table>

### 🚀 Development Productivity Tools

<table>
<tr>
<td width="30%"><code>atlas_profiler</code></td>
<td><b>Performance Profiling</b><br/>Detect bottlenecks, analyze time complexity (O(n), O(n²)), and memory usage</td>
</tr>
<tr>
<td><code>atlas_test</code></td>
<td><b>Test Case Generation</b><br/>Generate comprehensive tests for Jest, Vitest, Pytest, Mocha</td>
</tr>
<tr>
<td><code>atlas_docs</code></td>
<td><b>Auto Documentation</b><br/>Generate JSDoc, TSDoc, or PyDoc documentation automatically</td>
</tr>
<tr>
<td><code>atlas_dependencies</code></td>
<td><b>Dependency Analysis</b><br/>Detect unused packages, analyze dependencies, scan for vulnerabilities</td>
</tr>
<tr>
<td><code>atlas_dashboard</code></td>
<td><b>Metrics Dashboard</b><br/>Generate interactive HTML dashboards with real-time metrics</td>
</tr>
<tr>
<td><code>atlas_explain</code></td>
<td><b>Code Explanation</b><br/>Explain code with complexity analysis and pattern detection</td>
</tr>
<tr>
<td><code>atlas_debug</code></td>
<td><b>Smart Debugging</b><br/>Root cause analysis, stack trace parsing, and fix suggestions</td>
</tr>
<tr>
<td><code>atlas_think</code></td>
<td><b>Advanced Reasoning</b><br/>Sequential reasoning with branching logic for complex problems</td>
</tr>
</table>

### 🔧 Utility Tools

<table>
<tr>
<td width="30%"><code>atlas_providers</code></td>
<td><b>Provider Status</b><br/>Check available LLM providers and their current status</td>
</tr>
</table>

---

## How to Use (Cheat Sheet)

Once installed, simply chat with your AI Assistant (Copilot Chat or Cursor Chat). The server automatically activates based on your intent.

### Advanced AI/ML Tools
| Goal | What to Ask | Tool Used |
| :--- | :--- | :--- |
| **Semantic Code Search** | "Search for authentication code using RAG" | `atlas_rag_search` |
| **Predict Bugs** | "Predict bug probability in payment-processor.ts" | `atlas_ml_predict` |
| **Migrate Codebase** | "Migrate this file from JavaScript to TypeScript" | `atlas_migrate` |
| **Advanced Testing** | "Generate comprehensive tests with edge cases" | `atlas_testgen_advanced` |

### Professional Development Tools
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
