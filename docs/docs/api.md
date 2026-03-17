---
id: api
title: API Reference
sidebar_position: 5
---

# API Reference

All endpoints accessible via Kong Gateway at `http://localhost:30080`.

## Exercise API

### Generate Exercise
```http
POST /exercise/generate
Content-Type: application/json

{
  "topic": "for_loops",
  "student_level": "beginner",
  "student_id": "uuid"
}
```

**Response:**
```json
{
  "exercise_id": "uuid",
  "problem": "Write a for loop that...",
  "expected_output": "0\n1\n2",
  "test_input": "",
  "test_expected": "0\n1\n2"
}
```

### Grade Solution
```http
POST /exercise/grade
Content-Type: application/json

{
  "exercise_id": "uuid",
  "code": "for i in range(3):\n    print(i)",
  "test_input": "",
  "test_expected": "0\n1\n2",
  "topic": "for_loops",
  "student_id": "uuid"
}
```

**Response:**
```json
{
  "grade": "pass",
  "score": 1.0,
  "execution_output": "0\n1\n2",
  "feedback": "Correct! Your output matches."
}
```

## Progress API

### Get Mastery Profile
```http
GET /progress/mastery/{student_id}
```

**Response:**
```json
{
  "student_id": "uuid",
  "topics": [
    {
      "topic": "for_loops",
      "mastery_score": 0.72,
      "mastery_level": "Proficient",
      "exercise_completion": 1.0,
      "quiz_score": 0.75,
      "code_quality": 0.8,
      "consistency_streak": 1.0
    }
  ]
}
```

### Update Mastery Component
```http
POST /progress/mastery/update
Content-Type: application/json

{
  "student_id": "uuid",
  "topic": "for_loops",
  "component": "quiz_score",
  "value": 0.75
}
```

## Tutor API

### Chat with AI Tutor
```http
POST /triage/chat
Content-Type: application/json

{
  "message": "How do for loops work?",
  "student_id": "uuid"
}
```
