#!/usr/bin/env python3
"""MCP client for fetching student mastery context at query time.
Pattern: call progress-service → filter/aggregate locally → return ≤5 lines to agent context.
T029: fetch student mastery context via GET /progress/mastery/{student_id}
"""
import asyncio
import sys
import httpx

PROGRESS_SERVICE_URL = "http://progress-service.learnflow.svc.cluster.local:8000"


async def get_mastery_context(student_id: str) -> str:
    """Fetch student mastery profile and return ≤5-line summary for agent context."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{PROGRESS_SERVICE_URL}/mastery/{student_id}")
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        return f"mastery context unavailable: {e}"

    topics = data.get("topics", [])
    if not topics:
        return f"student {student_id}: no mastery data yet (Beginner across all topics)"

    # ---- Filter/aggregate — never return raw result to agent ----
    # Sort by mastery_score desc, take top 3 topics
    sorted_topics = sorted(topics, key=lambda t: t.get("mastery_score", 0), reverse=True)
    lines = [f"student {student_id} mastery ({len(topics)} topics):"]
    for t in sorted_topics[:3]:
        lines.append(
            f"  {t['topic']}: {t['mastery_level']} ({t['mastery_score']:.2f}) "
            f"— recent errors: {t.get('recent_error_types', 'none')}"
        )
    if len(topics) > 3:
        lines.append(f"  ...and {len(topics) - 3} more topics")
    return "\n".join(lines[:5])


async def run():
    student_id = sys.argv[1] if len(sys.argv) > 1 else "anonymous"
    summary = await get_mastery_context(student_id)
    print(summary)


if __name__ == "__main__":
    asyncio.run(run())
