---
id: services
title: Microservices
sidebar_position: 3
---

# Microservices

All services deployed via `fastapi-dapr-agent` skill.

## Triage Service
Routes student queries to the right specialist agent.
- `POST /triage` — Analyze query, route to concepts/debug/exercise

## Concepts Service
Explains Python concepts with examples, adapts to student level.
- `POST /explain` — Generate concept explanation with code examples

## Debug Service
Parses errors, identifies root causes, provides hints.
- `POST /debug` — Analyze error and provide debugging guidance

## Exercise Service
Generates and auto-grades coding challenges.
- `POST /generate` — Generate level-aware Python exercise
- `POST /grade` — Run code in sandbox, grade, update progress

## Code Review Service
AI-powered code review with PEP8 analysis.
- `POST /review` — Analyze code quality, return grade (pass/partial/fail)

## Progress Service
Tracks mastery scores across all topics.
- `GET /mastery/{student_id}` — Full mastery profile
- `POST /mastery/update` — Update single mastery component
- `GET /class/{teacher_id}` — Class-wide overview
- `GET /events/stream/{teacher_id}` — SSE struggle alerts

## Kong API Gateway Routes

| Path | Service |
|------|---------|
| `/triage/*` | triage-service |
| `/concepts/*` | concepts-service |
| `/debug/*` | debug-service |
| `/exercise/*` | exercise-service |
| `/code-review/*` | code-review-service |
| `/progress/*` | progress-service |
