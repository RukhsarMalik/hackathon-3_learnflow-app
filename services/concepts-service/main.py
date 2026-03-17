import os
import logging
import json
import time
from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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


app = FastAPI(title="concepts-service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# T054: Prometheus metrics
REQUEST_COUNT = Counter("concepts_requests_total", "Total explanation requests")
REQUEST_LATENCY = Histogram("concepts_request_latency_seconds", "Request latency")
ERROR_COUNT = Counter("concepts_errors_total", "Total errors", ["type"])

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

DAPR_PUBSUB = "kafka-pubsub"

LEVEL_DESCRIPTIONS = {
    "beginner": "a complete beginner who just started Python",
    "intermediate": "an intermediate student who knows basic Python syntax",
    "advanced": "an advanced student comfortable with Python fundamentals",
}


class ExplainRequest(BaseModel):
    message: str
    topic: str = "python_general"
    student_id: str = "anonymous"
    student_level: str = "beginner"
    mastery_context: str = ""


class ExplainResponse(BaseModel):
    explanation: str
    code_example: str
    topic: str
    student_level: str


@app.get("/health")
def health():
    return {"status": "ok", "service": "concepts-service"}


@app.post("/explain", response_model=ExplainResponse)
async def explain_concept(
    req: ExplainRequest,
    x_student_id: str = Header(None),
    x_user_role: str = Header(None),
):
    """T027: OpenAI Agent explains Python concept with code example."""
    start = time.time()
    level_desc = LEVEL_DESCRIPTIONS.get(req.student_level, LEVEL_DESCRIPTIONS["beginner"])
    context_block = f"\n\nStudent mastery context:\n{req.mastery_context}" if req.mastery_context else ""

    agent = Agent(
        name="python-tutor",
        instructions=(
            f"You are a friendly Python tutor explaining to {level_desc}. "
            "Your explanations must be clear, ≤150 words, and include exactly one runnable code example. "
            "Respond ONLY with valid JSON: "
            '{"explanation": "<150 word explanation>", "code_example": "<runnable Python code>", "topic": "<topic>"}'
            + context_block
        ),
        model="gpt-4o-mini",
    )

    try:
        result = await Runner.run(agent, req.message)
        parsed = json.loads(result.final_output)
        explanation = parsed.get("explanation", "")
        code_example = parsed.get("code_example", "")
        topic = parsed.get("topic", req.topic)
    except Exception as e:
        logger.error(f"Explanation error: {e}")
        ERROR_COUNT.labels(type="generation").inc()
        explanation = f"An error occurred generating the explanation: {e}"
        code_example = "# Example not available"
        topic = req.topic

    # T028: Publish learning.concept.delivered event
    try:
        await _publish_event(pubsub_name=DAPR_PUBSUB,
                topic_name="learning.concept.delivered",
                data=json.dumps({
                    "student_id": x_student_id or req.student_id,
                    "topic": topic,
                    "student_level": req.student_level,
                }),
                data_content_type="application/json",
            )
    except Exception as e:
        logger.error(f"Kafka publish failed: {e}. Progress tracking temporarily offline.")

    REQUEST_COUNT.inc()
    REQUEST_LATENCY.observe(time.time() - start)

    return ExplainResponse(
        explanation=explanation,
        code_example=code_example,
        topic=topic,
        student_level=req.student_level,
    )


@app.post("/events/learning.concept.requested")
async def handle_concept_requested(data: dict):
    """T028: Dapr subscription handler for learning.concept.requested."""
    logger.info(f"Received concept request event: {data}")
    req = ExplainRequest(
        message=data.get("message", ""),
        topic=data.get("topic", "python_general"),
        student_id=data.get("student_id", "anonymous"),
        student_level=data.get("student_level", "beginner"),
    )
    await explain_concept(req)
    return {"status": "processed"}


@app.post("/events/{topic}")
async def handle_event(topic: str, data: dict):
    """Dapr pub/sub event handler."""
    logger.info(f"Received event on {topic}: {data}")
    return {"status": "received"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
