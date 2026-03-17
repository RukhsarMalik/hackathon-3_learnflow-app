---
id: intro
title: Introduction
sidebar_position: 1
slug: /
---

# LearnFlow — AI-Powered Python Tutoring Platform

LearnFlow is a cloud-native, agentic AI tutoring platform built entirely using **Claude Code Skills** and the **MCP Code Execution pattern** during Hackathon III.

## What is LearnFlow?

LearnFlow helps students learn Python programming through conversational AI agents:

| Role | Features |
|------|----------|
| **Student** | Chat with AI tutor, write & run code, take quizzes, view progress |
| **Teacher** | View class progress, receive struggle alerts, monitor mastery |

## Built with Skills

Every component was deployed using reusable Skills — no manual code written:

```
"Deploy Kafka on Kubernetes"  →  kafka-k8s-setup skill executes
"Scaffold FastAPI service"    →  fastapi-dapr-agent skill executes
"Deploy Next.js frontend"     →  nextjs-k8s-deploy skill executes
```

## Quick Start

```bash
# Access LearnFlow
minikube service learnflow-frontend -n learnflow --url

# Access API Gateway
minikube service kong-gateway -n learnflow --url
```

## Mastery System

Topic Mastery = weighted average:
- **Exercise completion**: 40%
- **Quiz scores**: 30%
- **Code quality**: 20%
- **Consistency**: 10%
