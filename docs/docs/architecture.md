---
id: architecture
title: Architecture
sidebar_position: 2
---

# Architecture

## Kubernetes Cluster

```
┌─────────────────────────────────────────────┐
│              KUBERNETES (Minikube)           │
│                                             │
│  Next.js Frontend  ←→  Kong API Gateway     │
│         ↓                    ↓              │
│  ┌──────────────────────────────────────┐   │
│  │         FastAPI Microservices        │   │
│  │  triage · concepts · debug           │   │
│  │  exercise · code-review · progress   │   │
│  └──────────────────────────────────────┘   │
│         ↓                                   │
│      Kafka (Strimzi)  ←→  Dapr Sidecar      │
│         ↓                                   │
│      PostgreSQL                             │
└─────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 |
| Backend | FastAPI + OpenAI Agents SDK |
| API Gateway | Kong |
| Messaging | Kafka (Strimzi) |
| Service Mesh | Dapr 1.13 |
| Database | PostgreSQL 16 (Bitnami) |
| Orchestration | Kubernetes (Minikube) |

## Event Flow

```
Student submits exercise
  → exercise-service grades code (sandbox)
  → code-review-service reviews code quality (AI)
  → progress-service updates mastery scores (PostgreSQL)
  → Frontend shows updated progress
```

## MCP Code Execution Pattern

```
Agent context: SKILL.md (~100 tokens)
              ↓
         Script executes
              ↓
    Only result enters context (~10 tokens)

Total: ~110 tokens vs 50,000+ with direct MCP
```
