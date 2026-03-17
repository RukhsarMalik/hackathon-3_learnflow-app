---
id: skills
title: Skills Library
sidebar_position: 4
---

# Skills Library

7 reusable Skills built with the **MCP Code Execution pattern**. Each skill works on both **Claude Code** and **Goose** (AAIF Standard).

## Skills Overview

| Skill | Purpose | Tokens |
|-------|---------|--------|
| `kafka-k8s-setup` | Deploy Kafka on Kubernetes | ~100 |
| `postgres-k8s-setup` | Deploy PostgreSQL + migrations | ~100 |
| `fastapi-dapr-agent` | Scaffold FastAPI + Dapr service | ~100 |
| `nextjs-k8s-deploy` | Build + deploy Next.js to K8s | ~100 |
| `mcp-code-execution` | MCP client with token efficiency | ~100 |
| `docusaurus-deploy` | Deploy docs site to K8s | ~100 |
| `agents-md-gen` | Generate AGENTS.md for any repo | ~100 |

## Usage

### Claude Code
```bash
# Single prompt → Skill auto-triggers → K8s deployment
"Deploy Kafka on Kubernetes"
```

### Goose
```bash
# Same skill, different agent
goose run --recipe .claude/skills/kafka-k8s-setup/recipe.yaml
```

## MCP Code Execution Pattern

```
SKILL.md (~100 tokens)         ← Agent loads this
    ↓
scripts/deploy.sh              ← Executes (0 tokens in context)
    ↓
"✓ Kafka deployed"             ← Only result enters context
```

**Token reduction: 80-98%** vs direct MCP tool calls.

## Cross-Agent Compatibility

```
.claude/skills/kafka-k8s-setup/
├── SKILL.md       # Claude Code reads this
├── recipe.yaml    # Goose reads this
├── REFERENCE.md   # Deep docs (loaded on-demand)
└── scripts/
    ├── deploy.sh  # Executed, never loaded
    └── verify.py  # Returns ≤5 line summary
```
