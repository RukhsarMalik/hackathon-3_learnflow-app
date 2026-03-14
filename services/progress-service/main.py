import os
import logging
import json
import time
import asyncio
from collections import defaultdict
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, AsyncGenerator
from dapr.clients import DaprClient
import asyncpg
import uvicorn
from prometheus_client import Counter, Histogram, make_asgi_app

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="progress-service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# T054: Prometheus metrics
REQUEST_COUNT = Counter("progress_requests_total", "Total requests", ["op"])
REQUEST_LATENCY = Histogram("progress_request_latency_seconds", "Request latency", ["op"])
ERROR_COUNT = Counter("progress_errors_total", "Total errors", ["type"])

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

DAPR_PUBSUB = "kafka-pubsub"
DAPR_STATE_STORE = "redis-state"
DB_URL = os.getenv("DATABASE_URL", "postgresql://learnflow:learnflow@postgres.learnflow.svc.cluster.local:5432/learnflow")

# T048: In-memory SSE queues per teacher_id
_sse_queues: Dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)


# ─── Models ──────────────────────────────────────────────────────────────────

class MasteryUpdate(BaseModel):
    student_id: str
    topic: str
    component: str  # exercise_completion | quiz_score | code_quality | consistency_streak
    value: float


class TopicMastery(BaseModel):
    topic: str
    mastery_score: float
    mastery_level: str
    exercise_completion: float
    quiz_score: float
    code_quality: float
    consistency_streak: float


class MasteryProfile(BaseModel):
    student_id: str
    topics: List[TopicMastery]


class ClassStudent(BaseModel):
    student_id: str
    name: str
    topics: List[TopicMastery]


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "progress-service"}


# ─── T045: GET /mastery endpoints ────────────────────────────────────────────

@app.get("/mastery/{student_id}", response_model=MasteryProfile)
async def get_mastery(student_id: str):
    """T045: Full mastery profile for a student across all topics."""
    try:
        conn = await asyncpg.connect(DB_URL)
        rows = await conn.fetch(
            """SELECT topic, mastery_score, mastery_level, exercise_completion,
                      quiz_score, code_quality, consistency_streak
               FROM progress WHERE student_id = $1::uuid ORDER BY mastery_score DESC""",
            student_id,
        )
        await conn.close()
    except Exception as e:
        logger.error(f"DB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    topics = [
        TopicMastery(
            topic=r["topic"],
            mastery_score=float(r["mastery_score"]),
            mastery_level=r["mastery_level"],
            exercise_completion=float(r["exercise_completion"]),
            quiz_score=float(r["quiz_score"]),
            code_quality=float(r["code_quality"]),
            consistency_streak=float(r["consistency_streak"]),
        )
        for r in rows
    ]
    return MasteryProfile(student_id=student_id, topics=topics)


@app.get("/mastery/{student_id}/{topic}", response_model=TopicMastery)
async def get_mastery_topic(student_id: str, topic: str):
    """T045: Single-topic mastery for a student."""
    try:
        conn = await asyncpg.connect(DB_URL)
        row = await conn.fetchrow(
            """SELECT topic, mastery_score, mastery_level, exercise_completion,
                      quiz_score, code_quality, consistency_streak
               FROM progress WHERE student_id = $1::uuid AND topic = $2""",
            student_id, topic,
        )
        await conn.close()
    except Exception as e:
        logger.error(f"DB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not row:
        raise HTTPException(status_code=404, detail=f"No progress for student {student_id} on topic {topic}")

    return TopicMastery(
        topic=row["topic"],
        mastery_score=float(row["mastery_score"]),
        mastery_level=row["mastery_level"],
        exercise_completion=float(row["exercise_completion"]),
        quiz_score=float(row["quiz_score"]),
        code_quality=float(row["code_quality"]),
        consistency_streak=float(row["consistency_streak"]),
    )


# ─── T042: Mastery score calculation + UPSERT ─────────────────────────────

async def _upsert_progress(student_id: str, topic: str, component: str, value: float):
    """T042: Update one mastery component and UPSERT into progress table."""
    valid_components = {"exercise_completion", "quiz_score", "code_quality", "consistency_streak"}
    if component not in valid_components:
        raise ValueError(f"Invalid component: {component}")

    try:
        conn = await asyncpg.connect(DB_URL)
        await conn.execute(
            f"""INSERT INTO progress (student_id, topic, {component}, last_activity_at)
                VALUES ($1::uuid, $2, $3, NOW())
                ON CONFLICT (student_id, topic)
                DO UPDATE SET {component} = $3, last_activity_at = NOW(), updated_at = NOW()""",
            student_id, topic, min(1.0, max(0.0, value)),
        )
        # Publish mastery updated event
        row = await conn.fetchrow(
            "SELECT mastery_score, mastery_level FROM progress WHERE student_id=$1::uuid AND topic=$2",
            student_id, topic,
        )
        await conn.close()
        if row:
            _publish_mastery_updated(student_id, topic, float(row["mastery_score"]), row["mastery_level"])
    except Exception as e:
        logger.error(f"DB upsert error: {e}")


def _publish_mastery_updated(student_id: str, topic: str, mastery_score: float, mastery_level: str):
    try:
        with DaprClient() as dapr:
            dapr.publish_event(
                pubsub_name=DAPR_PUBSUB,
                topic_name="learning.mastery.updated",
                data=json.dumps({
                    "student_id": student_id,
                    "topic": topic,
                    "mastery_score": mastery_score,
                    "mastery_level": mastery_level,
                }),
                data_content_type="application/json",
            )
    except Exception as e:
        logger.error(f"Mastery event publish failed: {e}")


# ─── T052: POST /mastery/update ──────────────────────────────────────────────

@app.post("/mastery/update")
async def update_mastery(
    update: MasteryUpdate,
    x_user_role: str = Header(None),
):
    """T052: Teacher-initiated single component update."""
    valid_components = {"exercise_completion", "quiz_score", "code_quality", "consistency_streak"}
    if update.component not in valid_components:
        raise HTTPException(status_code=400, detail=f"Invalid component. Must be one of: {valid_components}")
    if not (0.0 <= update.value <= 1.0):
        raise HTTPException(status_code=400, detail="Value must be between 0.0 and 1.0")

    await _upsert_progress(update.student_id, update.topic, update.component, update.value)
    return {"status": "updated", "student_id": update.student_id, "topic": update.topic, "component": update.component}


# ─── T050: GET /class/{teacher_id} ───────────────────────────────────────────

@app.get("/class/{teacher_id}")
async def get_class_overview(teacher_id: str):
    """T050: Full class mastery overview for teacher dashboard."""
    try:
        conn = await asyncpg.connect(DB_URL)
        rows = await conn.fetch(
            """SELECT p.student_id, u.name, p.topic, p.mastery_score, p.mastery_level,
                      p.exercise_completion, p.quiz_score, p.code_quality, p.consistency_streak
               FROM progress p
               JOIN users u ON u.id = p.student_id::uuid
               WHERE u.role = 'student'
               ORDER BY u.name, p.topic""",
        )
        await conn.close()
    except Exception as e:
        logger.error(f"DB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    students: Dict[str, ClassStudent] = {}
    for r in rows:
        sid = str(r["student_id"])
        if sid not in students:
            students[sid] = ClassStudent(student_id=sid, name=r["name"], topics=[])
        students[sid].topics.append(TopicMastery(
            topic=r["topic"],
            mastery_score=float(r["mastery_score"]),
            mastery_level=r["mastery_level"],
            exercise_completion=float(r["exercise_completion"]),
            quiz_score=float(r["quiz_score"]),
            code_quality=float(r["code_quality"]),
            consistency_streak=float(r["consistency_streak"]),
        ))

    return {"teacher_id": teacher_id, "students": list(students.values())}


# ─── T048: SSE endpoint ───────────────────────────────────────────────────────

@app.get("/events/stream/{teacher_id}")
async def sse_stream(teacher_id: str):
    """T048: Server-Sent Events stream for real-time teacher struggle alerts."""
    queue = _sse_queues[teacher_id]

    async def event_generator() -> AsyncGenerator[str, None]:
        yield f"data: {json.dumps({'type': 'connected', 'teacher_id': teacher_id})}\n\n"
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15.0)
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                # Heartbeat every 15s to keep connection alive
                yield f": heartbeat\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ─── T043: Kafka consumer — exercise.completed ───────────────────────────────

@app.post("/events/exercise.completed")
async def handle_exercise_completed(data: dict):
    """T043: Update exercise_completion component when exercise passes."""
    student_id = data.get("student_id", "")
    topic = data.get("topic", "")
    score = float(data.get("score", 1.0))
    if not student_id or not topic:
        return {"status": "skipped"}

    # Use score as exercise_completion value (0–1)
    await _upsert_progress(student_id, topic, "exercise_completion", score)
    return {"status": "processed"}


# ─── T044: Kafka consumer — code.review.completed ────────────────────────────

@app.post("/events/code.review.completed")
async def handle_review_completed(data: dict):
    """T044: Update code_quality component from review verdict."""
    student_id = data.get("student_id", "")
    topic = data.get("topic", "")
    grade = data.get("grade", "fail")
    if not student_id or not topic:
        return {"status": "skipped"}

    # Map grade to code_quality score
    quality_map = {"pass": 1.0, "partial": 0.6, "fail": 0.2}
    code_quality = quality_map.get(grade, 0.2)
    await _upsert_progress(student_id, topic, "code_quality", code_quality)
    return {"status": "processed"}


# ─── T049: Kafka consumer — struggle.detected ────────────────────────────────

@app.post("/events/struggle.detected")
async def handle_struggle_detected(data: dict):
    """T049: Persist struggle event and push to all teacher SSE streams."""
    student_id = data.get("student_id", "")
    topic = data.get("topic", "")
    trigger_type = data.get("trigger_type", "unknown")
    trigger_detail = data.get("trigger_detail", "")

    # Persist to DB (StruggleEvent — stored in progress table metadata via JSON or separate table)
    try:
        conn = await asyncpg.connect(DB_URL)
        # Store struggle in a JSONB submissions entry for now (struggle_feedback)
        await conn.execute(
            """INSERT INTO submissions (student_id, code, review_feedback, topic)
               VALUES ($1::uuid, '', $2::jsonb, $3)""",
            student_id,
            json.dumps({
                "type": "struggle_event",
                "trigger_type": trigger_type,
                "trigger_detail": trigger_detail,
                "resolved": False,
            }),
            topic,
        )
        await conn.close()
    except Exception as e:
        logger.error(f"Struggle event persist error: {e}")

    # Push to all active teacher SSE queues
    alert = {
        "type": "struggle.detected",
        "student_id": student_id,
        "topic": topic,
        "trigger_type": trigger_type,
        "trigger_detail": trigger_detail,
        "timestamp": time.time(),
    }
    for teacher_id, queue in _sse_queues.items():
        try:
            queue.put_nowait(alert)
        except asyncio.QueueFull:
            logger.warning(f"SSE queue full for teacher {teacher_id}")

    return {"status": "processed"}


# ─── T051: Timeout-based struggle detection ───────────────────────────────────

@app.post("/activity/ping")
async def activity_ping(
    student_id: str,
    topic: str,
    x_student_id: str = Header(None),
):
    """T051: Update last_activity timestamp for timeout-based struggle detection."""
    sid = x_student_id or student_id
    activity_key = f"last_activity:{sid}:{topic}"
    try:
        with DaprClient() as dapr:
            dapr.save_state(
                store_name=DAPR_STATE_STORE,
                key=activity_key,
                value=str(time.time()),
            )
    except Exception as e:
        logger.error(f"Activity ping failed: {e}")
    return {"status": "ok"}


@app.post("/events/{topic}")
async def handle_event(topic: str, data: dict):
    """Dapr pub/sub event handler."""
    logger.info(f"Received event on {topic}: {data}")
    return {"status": "received"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
