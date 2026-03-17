import os
import logging
import json
import time
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from agents import Agent, Runner
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


app = FastAPI(title="debug-service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# T054: Prometheus metrics
REQUEST_COUNT = Counter("debug_requests_total", "Total debug requests")
REQUEST_LATENCY = Histogram("debug_request_latency_seconds", "Request latency")
ERROR_COUNT = Counter("debug_errors_total", "Total errors", ["type"])

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

DAPR_PUBSUB = "kafka-pubsub"
DAPR_STATE_STORE = "redis-state"
STRUGGLE_ERROR_THRESHOLD = 3
CONSECUTIVE_FAILURE_THRESHOLD = 5


class DebugRequest(BaseModel):
    code: str
    error_message: str
    student_id: str = "anonymous"
    topic: str = "python_general"
    session_id: str = "default"


class DebugResponse(BaseModel):
    explanation: str
    location: str
    hint: str
    error_type: str
    struggle_triggered: bool = False


@app.get("/health")
def health():
    return {"status": "ok", "service": "debug-service"}


@app.post("/debug", response_model=DebugResponse)
async def debug_code(
    req: DebugRequest,
    x_student_id: str = Header(None),
    x_user_role: str = Header(None),
):
    """T034: AI debug help — root cause + location + specific hint, no raw traceback."""
    # T056: Empty code validation guard
    if not req.code or not req.code.strip():
        raise HTTPException(status_code=400, detail={"error": "EMPTY_CODE", "message": "Code cannot be empty"})

    start = time.time()
    student_id = x_student_id or req.student_id

    agent = Agent(
        name="python-debugger",
        instructions=(
            "You are a Python debugging assistant. Given code and an error, explain: "
            "1) Root cause in 1-2 plain English sentences (NO raw tracebacks), "
            "2) Exact location (function/line description), "
            "3) One specific, actionable fix hint. "
            "Respond ONLY with valid JSON: "
            '{"explanation": "<1-2 sentences plain English>", '
            '"location": "<where the bug is>", '
            '"hint": "<specific fix>", '
            '"error_type": "<e.g. NameError, TypeError>"}'
        ),
        model="gpt-4o-mini",
    )

    try:
        prompt = f"Code:\n```python\n{req.code}\n```\nError: {req.error_message}"
        result = await Runner.run(agent, prompt)
        parsed = json.loads(result.final_output)
        explanation = parsed.get("explanation", "")
        location = parsed.get("location", "")
        hint = parsed.get("hint", "")
        error_type = parsed.get("error_type", "Unknown")
    except Exception as e:
        logger.error(f"Debug analysis error: {e}")
        ERROR_COUNT.labels(type="analysis").inc()
        explanation = f"Unable to analyze error: {e}"
        location = "unknown"
        hint = "Check your code for syntax errors"
        error_type = "Unknown"

    # T035/T036: Struggle tracking (Dapr/Redis unavailable in this env)
    struggle_triggered = False

    # T037: Publish code.debug.completed
    await _publish_event(
        pubsub_name=DAPR_PUBSUB,
        topic_name="code.debug.completed",
        data=json.dumps({
            "student_id": student_id,
            "topic": req.topic,
            "error_type": error_type,
            "struggle_triggered": struggle_triggered,
        }),
        data_content_type="application/json",
    )

    REQUEST_COUNT.inc()
    REQUEST_LATENCY.observe(time.time() - start)

    return DebugResponse(
        explanation=explanation,
        location=location,
        hint=hint,
        error_type=error_type,
        struggle_triggered=struggle_triggered,
    )




@app.post("/events/code.debug.requested")
async def handle_debug_requested(data: dict):
    """T037: Dapr subscription for code.debug.requested topic."""
    logger.info(f"Received debug event: {data}")
    if not data.get("code", "").strip():
        return {"status": "skipped", "reason": "empty code"}
    req = DebugRequest(
        code=data.get("code", ""),
        error_message=data.get("error_message", ""),
        student_id=data.get("student_id", "anonymous"),
        topic=data.get("topic", "python_general"),
        session_id=data.get("session_id", "default"),
    )
    await debug_code(req)
    return {"status": "processed"}


@app.post("/events/{topic}")
async def handle_event(topic: str, data: dict):
    """Dapr pub/sub event handler."""
    logger.info(f"Received event on {topic}: {data}")
    return {"status": "received"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
