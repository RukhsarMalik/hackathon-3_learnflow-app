import os
import logging
import json
import time
from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dapr.clients import DaprClient
from agents import Agent, Runner
import uvicorn
from prometheus_client import Counter, Histogram, make_asgi_app

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="triage-service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# T054: Prometheus metrics
REQUEST_COUNT = Counter("triage_requests_total", "Total triage requests", ["route"])
REQUEST_LATENCY = Histogram("triage_request_latency_seconds", "Request latency")
ERROR_COUNT = Counter("triage_errors_total", "Total errors", ["type"])

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

DAPR_PUBSUB = "kafka-pubsub"

STRUGGLE_SIGNALS = [
    "i don't understand", "i dont understand", "i'm stuck", "im stuck",
    "i'm confused", "im confused", "help me", "i can't figure out",
    "i cannot figure out", "not working", "doesn't work", "doesnt work",
    "i'm lost", "im lost",
]

TOPIC_MAP = {
    "concept": "learning.concept.requested",
    "code_review": "code.review.requested",
    "debug_help": "code.debug.requested",
    "exercise_request": "exercise.generation.requested",
}


class TriageRequest(BaseModel):
    message: str
    session_id: str
    student_id: str = "anonymous"
    student_level: str = "beginner"


class TriageResponse(BaseModel):
    routed_to: str
    confidence: float
    topic: str
    classification: str
    struggle_triggered: bool = False


@app.get("/health")
def health():
    return {"status": "ok", "service": "triage-service"}


@app.post("/route", response_model=TriageResponse)
async def route_message(
    req: TriageRequest,
    x_student_id: str = Header(None),
    x_user_role: str = Header(None),
):
    """T024+T025+T026: Classify message, detect struggle, publish to Kafka."""
    start = time.time()
    student_id = x_student_id or req.student_id

    # T026: Detect explicit struggle signal before routing
    struggle_triggered = False
    msg_lower = req.message.lower()
    if any(signal in msg_lower for signal in STRUGGLE_SIGNALS):
        struggle_triggered = True
        _publish_struggle(student_id, req.session_id, "explicit_signal", req.message[:200])

    # T024: OpenAI Agents SDK classification
    agent = Agent(
        name="triage-agent",
        instructions=(
            "You are a triage agent for a Python tutoring platform. "
            "Classify student messages into exactly one category: "
            "concept (wants to understand Python theory), "
            "code_review (wants code reviewed), "
            "debug_help (has error/bug needs help), "
            "exercise_request (wants a practice exercise). "
            "Also identify the Python topic (e.g. list_comprehensions, for_loops, functions). "
            'Respond ONLY with valid JSON: {"classification": "<cat>", "confidence": <0-1>, "topic": "<topic>"}'
        ),
        model="gpt-4o-mini",
    )

    try:
        result = await Runner.run(agent, req.message)
        parsed = json.loads(result.final_output)
        classification = parsed.get("classification", "concept")
        confidence = float(parsed.get("confidence", 0.8))
        topic = parsed.get("topic", "python_general")
    except Exception as e:
        logger.error(f"Classification error: {e}")
        ERROR_COUNT.labels(type="classification").inc()
        classification = "concept"
        confidence = 0.5
        topic = "python_general"

    # T025: Publish to Kafka via Dapr pub/sub
    kafka_topic = TOPIC_MAP.get(classification, "learning.concept.requested")
    event_data = {
        "student_id": student_id,
        "session_id": req.session_id,
        "message": req.message,
        "topic": topic,
        "student_level": req.student_level,
        "classification": classification,
    }
    try:
        with DaprClient() as dapr:
            dapr.publish_event(
                pubsub_name=DAPR_PUBSUB,
                topic_name=kafka_topic,
                data=json.dumps(event_data),
                data_content_type="application/json",
            )
    except Exception as e:
        # T055: Kafka unavailability graceful degradation
        logger.error(f"Kafka publish failed: {e}. Progress tracking temporarily offline.")

    REQUEST_COUNT.labels(route=classification).inc()
    REQUEST_LATENCY.observe(time.time() - start)

    return TriageResponse(
        routed_to=classification.replace("_", "-"),
        confidence=confidence,
        topic=topic,
        classification=classification,
        struggle_triggered=struggle_triggered,
    )


def _publish_struggle(student_id: str, session_id: str, trigger_type: str, detail: str):
    event = {
        "student_id": student_id,
        "session_id": session_id,
        "trigger_type": trigger_type,
        "trigger_detail": detail,
    }
    try:
        with DaprClient() as dapr:
            dapr.publish_event(
                pubsub_name=DAPR_PUBSUB,
                topic_name="struggle.detected",
                data=json.dumps(event),
                data_content_type="application/json",
            )
    except Exception as e:
        logger.error(f"Struggle event publish failed: {e}")


@app.post("/events/{topic}")
async def handle_event(topic: str, data: dict):
    """Dapr pub/sub event handler."""
    logger.info(f"Received event on {topic}: {data}")
    return {"status": "received"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
