import os
import logging
import json
import time
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from agents import Agent, Runner
import asyncpg
import uvicorn
from prometheus_client import Counter, Histogram, make_asgi_app

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

async def _publish_event(pubsub_name, topic_name, data, data_content_type="application/json"):
    """Non-blocking Dapr publish — skips if Dapr sidecar is unavailable."""
    import asyncio
    def _sync_publish():
        from dapr.clients import DaprClient
        with DaprClient() as dapr:
            dapr.publish_event(pubsub_name=pubsub_name, topic_name=topic_name,
                               data=data, data_content_type=data_content_type)
    try:
        await asyncio.wait_for(asyncio.to_thread(_sync_publish), timeout=2.0)
    except Exception as e:
        logger.warning(f"Dapr publish skipped ({topic_name}): {e}")


app = FastAPI(title="code-review-service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# T054: Prometheus metrics
REQUEST_COUNT = Counter("code_review_requests_total", "Total review requests")
REQUEST_LATENCY = Histogram("code_review_request_latency_seconds", "Request latency")
ERROR_COUNT = Counter("code_review_errors_total", "Total errors", ["type"])

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

DAPR_PUBSUB = "kafka-pubsub"
DB_URL = os.getenv("DATABASE_URL", "postgresql://learnflow:learnflow@postgres.learnflow.svc.cluster.local:5432/learnflow")


class PEP8Violation(BaseModel):
    line: int
    rule: str
    message: str


class ReviewRequest(BaseModel):
    code: str
    student_id: str = "anonymous"
    topic: str = "python_general"
    exercise_id: Optional[str] = None


class ReviewResponse(BaseModel):
    verdict: str
    pep8_violations: List[PEP8Violation] = []
    correctness_issues: List[str] = []
    suggestions: List[str] = []
    grade: str


@app.get("/health")
def health():
    return {"status": "ok", "service": "code-review-service"}


@app.post("/review", response_model=ReviewResponse)
async def review_code(
    req: ReviewRequest,
    x_student_id: str = Header(None),
    x_user_role: str = Header(None),
):
    """T031: AI code review with PEP8 check and correctness analysis."""
    # T056: Empty code validation guard
    if not req.code or not req.code.strip():
        raise HTTPException(status_code=400, detail={"error": "EMPTY_CODE", "message": "Code cannot be empty"})

    start = time.time()
    student_id = x_student_id or req.student_id

    agent = Agent(
        name="code-reviewer",
        instructions=(
            "You are an expert Python code reviewer. Analyze the code for: "
            "1) Correctness (logic errors, runtime errors), "
            "2) PEP8 style violations with line numbers. "
            "Respond ONLY with valid JSON: "
            '{"verdict": "pass|needs_work|fail", '
            '"pep8_violations": [{"line": <int>, "rule": "<e.g. E302>", "message": "<description>"}], '
            '"correctness_issues": ["<issue1>", ...], '
            '"suggestions": ["<suggestion1>", ...], '
            '"grade": "pass|partial|fail"}'
        ),
        model="gpt-4o-mini",
    )

    try:
        result = await Runner.run(agent, f"Review this Python code:\n```python\n{req.code}\n```")
        parsed = json.loads(result.final_output)
        verdict = parsed.get("verdict", "needs_work")
        pep8_violations = [PEP8Violation(**v) for v in parsed.get("pep8_violations", [])]
        correctness_issues = parsed.get("correctness_issues", [])
        suggestions = parsed.get("suggestions", [])
        grade = parsed.get("grade", "partial")
    except Exception as e:
        logger.error(f"Review error: {e}")
        ERROR_COUNT.labels(type="review").inc()
        verdict = "error"
        pep8_violations = []
        correctness_issues = [f"Review failed: {e}"]
        suggestions = []
        grade = "fail"

    review_feedback = {
        "verdict": verdict,
        "pep8_violations": [v.model_dump() for v in pep8_violations],
        "correctness_issues": correctness_issues,
        "suggestions": suggestions,
    }

    # T033: Persist submission to PostgreSQL
    await _persist_submission(student_id, req.exercise_id, req.code, None, review_feedback, grade, req.topic)

    # T032: Publish code.review.completed
    try:
        await _publish_event(pubsub_name=DAPR_PUBSUB,
                topic_name="code.review.completed",
                data=json.dumps({
                    "student_id": student_id,
                    "topic": req.topic,
                    "grade": grade,
                    "review_feedback": review_feedback,
                }),
                data_content_type="application/json",
            )
    except Exception as e:
        logger.error(f"Kafka publish failed: {e}. Progress tracking temporarily offline.")

    REQUEST_COUNT.inc()
    REQUEST_LATENCY.observe(time.time() - start)

    return ReviewResponse(
        verdict=verdict,
        pep8_violations=pep8_violations,
        correctness_issues=correctness_issues,
        suggestions=suggestions,
        grade=grade,
    )


async def _persist_submission(
    student_id: str,
    exercise_id: Optional[str],
    code: str,
    execution_result: Optional[str],
    review_feedback: dict,
    grade: str,
    topic: str,
):
    """T033: Write submission record to PostgreSQL submissions table."""
    try:
        conn = await asyncpg.connect(DB_URL)
        try:
            await conn.execute(
                """INSERT INTO submissions (student_id, exercise_id, code, execution_result, review_feedback, grade, topic)
                   VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)""",
                student_id, exercise_id, code, execution_result, json.dumps(review_feedback), grade, topic,
            )
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"Submission persist failed: {e}")


@app.post("/events/code.review.requested")
async def handle_review_requested(data: dict):
    """T032: Dapr subscription for code.review.requested topic."""
    logger.info(f"Received code review event: {data}")
    if not data.get("code", "").strip():
        return {"status": "skipped", "reason": "empty code"}
    req = ReviewRequest(
        code=data.get("code", ""),
        student_id=data.get("student_id", "anonymous"),
        topic=data.get("topic", "python_general"),
        exercise_id=data.get("exercise_id"),
    )
    await review_code(req)
    return {"status": "processed"}


@app.post("/events/{topic}")
async def handle_event(topic: str, data: dict):
    """Dapr pub/sub event handler."""
    logger.info(f"Received event on {topic}: {data}")
    return {"status": "received"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
