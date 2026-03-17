import os
import logging
import json
import time
import uuid
import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from agents import Agent, Runner
import uvicorn
from prometheus_client import Counter, Histogram, make_asgi_app
from sandbox import run_code, SandboxError

PROGRESS_SERVICE_URL = os.getenv("PROGRESS_SERVICE_URL", "http://progress-service:8000")

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


app = FastAPI(title="exercise-service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# T054: Prometheus metrics
REQUEST_COUNT = Counter("exercise_requests_total", "Total exercise requests", ["op"])
REQUEST_LATENCY = Histogram("exercise_request_latency_seconds", "Request latency", ["op"])
ERROR_COUNT = Counter("exercise_errors_total", "Total errors", ["type"])

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

DAPR_PUBSUB = "kafka-pubsub"

LEVEL_DESCRIPTIONS = {
    "beginner": "beginner who just started Python",
    "learning": "intermediate student who knows basic Python",
    "proficient": "proficient student comfortable with Python",
    "mastered": "advanced student who has mastered Python basics",
}


class GenerateRequest(BaseModel):
    topic: str = "python_general"
    student_id: str = "anonymous"
    student_level: str = "beginner"
    mastery_context: str = ""


class GenerateResponse(BaseModel):
    exercise_id: str
    problem: str
    expected_output: str
    test_input: str
    test_expected: str


class GradeRequest(BaseModel):
    exercise_id: str
    code: str
    test_input: str
    test_expected: str
    student_id: str = "anonymous"
    topic: str = "python_general"


class GradeResponse(BaseModel):
    grade: str
    score: float
    execution_output: str
    feedback: str


@app.get("/health")
def health():
    return {"status": "ok", "service": "exercise-service"}


@app.post("/generate", response_model=GenerateResponse)
async def generate_exercise(
    req: GenerateRequest,
    x_student_id: str = Header(None),
    x_user_role: str = Header(None),
):
    """T039: Generate a mastery-level-aware Python exercise."""
    start = time.time()
    level_desc = LEVEL_DESCRIPTIONS.get(req.student_level.lower(), LEVEL_DESCRIPTIONS["beginner"])
    context_block = f"\n\nStudent mastery context:\n{req.mastery_context}" if req.mastery_context else ""

    agent = Agent(
        name="exercise-generator",
        instructions=(
            f"You generate Python exercises for a {level_desc}. "
            f"Topic: {req.topic}. "
            "Create a clear 2-3 sentence problem statement with exact expected output and one test case. "
            "Respond ONLY with valid JSON: "
            '{"problem": "<2-3 sentence problem>", '
            '"expected_output": "<exact stdout output>", '
            '"test_input": "<stdin input or empty>", '
            '"test_expected": "<expected stdout>"}'
            + context_block
        ),
        model="gpt-4o-mini",
    )

    try:
        result = await Runner.run(agent, f"Generate a Python exercise on: {req.topic}")
        parsed = json.loads(result.final_output)
        problem = parsed.get("problem", "")
        expected_output = parsed.get("expected_output", "")
        test_input = parsed.get("test_input", "")
        test_expected = parsed.get("test_expected", "")
    except Exception as e:
        logger.error(f"Exercise generation error: {e}")
        ERROR_COUNT.labels(type="generation").inc()
        raise HTTPException(status_code=500, detail=f"Exercise generation failed: {e}")

    exercise_id = str(uuid.uuid4())

    # T041: Publish exercise.generated event
    try:
        await _publish_event(pubsub_name=DAPR_PUBSUB,
                topic_name="exercise.generated",
                data=json.dumps({
                    "exercise_id": exercise_id,
                    "student_id": x_student_id or req.student_id,
                    "topic": req.topic,
                    "student_level": req.student_level,
                }),
                data_content_type="application/json",
            )
    except Exception as e:
        logger.error(f"Kafka publish failed: {e}. Progress tracking temporarily offline.")

    REQUEST_COUNT.labels(op="generate").inc()
    REQUEST_LATENCY.labels(op="generate").observe(time.time() - start)

    return GenerateResponse(
        exercise_id=exercise_id,
        problem=problem,
        expected_output=expected_output,
        test_input=test_input,
        test_expected=test_expected,
    )


@app.post("/grade", response_model=GradeResponse)
async def grade_exercise(
    req: GradeRequest,
    x_student_id: str = Header(None),
    x_user_role: str = Header(None),
):
    """T040: Run student code in sandbox, compare to expected, return grade."""
    # T056: Empty code validation guard
    if not req.code or not req.code.strip():
        raise HTTPException(status_code=400, detail={"error": "EMPTY_CODE", "message": "Code cannot be empty"})

    start = time.time()
    student_id = x_student_id or req.student_id

    try:
        sandbox_result = run_code(req.code, stdin_input=req.test_input)
        execution_output = sandbox_result["stdout"].strip()
        sandbox_error = sandbox_result["stderr"].strip()
        exit_code = sandbox_result["exit_code"]
    except SandboxError as e:
        raise HTTPException(status_code=e.status_code, detail={"error": e.error_code, "message": e.message})

    # Compare output to expected
    expected = req.test_expected.strip()
    if exit_code != 0:
        grade = "fail"
        score = 0.0
        feedback = f"Code raised an error: {sandbox_error[:200]}"
    elif execution_output == expected:
        grade = "pass"
        score = 1.0
        feedback = "Correct! Your output matches the expected result."
    elif execution_output.lower() == expected.lower():
        grade = "partial"
        score = 0.7
        feedback = "Almost correct — check case sensitivity in your output."
    else:
        grade = "fail"
        score = 0.0
        feedback = f"Output did not match. Expected: '{expected}', Got: '{execution_output[:100]}'"

    # T041: Publish exercise.completed or exercise.failed
    event_topic = "exercise.completed" if grade == "pass" else "exercise.failed"
    try:
        await _publish_event(pubsub_name=DAPR_PUBSUB,
                topic_name=event_topic,
                data=json.dumps({
                    "exercise_id": req.exercise_id,
                    "student_id": student_id,
                    "topic": req.topic,
                    "grade": grade,
                    "score": score,
                }),
                data_content_type="application/json",
            )
    except Exception as e:
        logger.error(f"Kafka publish failed: {e}. Progress tracking temporarily offline.")

    # Direct HTTP fallback to progress-service (in case Dapr/Kafka unavailable)
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{PROGRESS_SERVICE_URL}/events/exercise.completed",
                json={"student_id": student_id, "topic": req.topic, "grade": grade, "score": score},
            )
    except Exception as e:
        logger.warning(f"Direct progress update skipped: {e}")

    # Auto code review → update code_quality
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            review_res = await client.post(
                "http://code-review-service:8000/review",
                json={"code": req.code, "student_id": student_id, "topic": req.topic, "exercise_id": req.exercise_id},
            )
            logger.info(f"Code review response: {review_res.status_code}")
            if review_res.status_code == 200:
                review_grade = review_res.json().get("grade", "partial")
                logger.info(f"Code review grade: {review_grade}, updating progress for {student_id}")
                progress_res = await client.post(
                    f"{PROGRESS_SERVICE_URL}/events/code.review.completed",
                    json={"student_id": student_id, "topic": req.topic, "grade": review_grade},
                )
                logger.info(f"Progress code_quality update: {progress_res.status_code}")
            else:
                logger.warning(f"Code review returned {review_res.status_code}: {review_res.text}")
    except Exception as e:
        logger.warning(f"Code review skipped: {e}")

    # Update consistency_streak (student is active)
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{PROGRESS_SERVICE_URL}/mastery/update",
                json={"student_id": student_id, "topic": req.topic, "component": "consistency_streak", "value": 1.0},
            )
    except Exception as e:
        logger.warning(f"Consistency update skipped: {e}")

    REQUEST_COUNT.labels(op="grade").inc()
    REQUEST_LATENCY.labels(op="grade").observe(time.time() - start)

    return GradeResponse(
        grade=grade,
        score=score,
        execution_output=execution_output,
        feedback=feedback,
    )


@app.post("/events/exercise.generation.requested")
async def handle_generation_requested(data: dict):
    """T041: Dapr subscription for exercise.generation.requested topic."""
    logger.info(f"Received exercise generation event: {data}")
    req = GenerateRequest(
        topic=data.get("topic", "python_general"),
        student_id=data.get("student_id", "anonymous"),
        student_level=data.get("student_level", "beginner"),
    )
    await generate_exercise(req)
    return {"status": "processed"}


@app.post("/events/{topic}")
async def handle_event(topic: str, data: dict):
    """Dapr pub/sub event handler."""
    logger.info(f"Received event on {topic}: {data}")
    return {"status": "received"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
