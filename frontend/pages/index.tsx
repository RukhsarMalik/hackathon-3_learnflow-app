// T053: Teacher dashboard — class overview table + real-time SSE struggle alerts
import { useEffect, useState, useRef } from "react";

const KONG_URL = process.env.NEXT_PUBLIC_KONG_URL || "http://localhost:30080";

interface TopicMastery {
  topic: string;
  mastery_level: string;
  mastery_score: number;
}

interface ClassStudent {
  student_id: string;
  name: string;
  topics: TopicMastery[];
}

interface StruggleAlert {
  type: string;
  student_id: string;
  topic: string;
  trigger_type: string;
  trigger_detail: string;
  timestamp: number;
  id: string;
}

const LEVEL_BADGE: Record<string, { bg: string; color: string }> = {
  Mastered: { bg: "#00a550", color: "#fff" },
  Proficient: { bg: "#0070f3", color: "#fff" },
  Learning: { bg: "#f0a500", color: "#fff" },
  Beginner: { bg: "#e53e3e", color: "#fff" },
};

export default function TeacherDashboard() {
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [alerts, setAlerts] = useState<StruggleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const getToken = () => localStorage.getItem("auth_token") || "";
  const getTeacherId = () => localStorage.getItem("teacher_id") || "demo-teacher";

  useEffect(() => {
    // Fetch class overview
    async function fetchClass() {
      try {
        const teacherId = getTeacherId();
        const res = await fetch(`${KONG_URL}/progress/class/${teacherId}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load class data");
        setStudents(data.students || []);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    }
    fetchClass();

    // Connect SSE for real-time struggle alerts
    const teacherId = getTeacherId();
    const es = new EventSource(`${KONG_URL}/events/stream/${teacherId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "struggle.detected") {
          const alert: StruggleAlert = { ...data, id: `${Date.now()}-${Math.random()}` };
          setAlerts((prev) => [alert, ...prev].slice(0, 20)); // Keep last 20
        }
      } catch (_) {}
    };

    es.onerror = () => {
      console.warn("SSE connection error — will retry automatically");
    };

    return () => {
      es.close();
    };
  }, []);

  function dismissAlert(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  // Collect all unique topics for table header
  const allTopics = Array.from(new Set(students.flatMap((s) => s.topics.map((t) => t.topic)))).sort();

  if (loading) return <div style={{ textAlign: "center", padding: 60, fontFamily: "sans-serif" }}>Loading dashboard...</div>;
  if (error) return <div style={{ color: "#c00", padding: 24, fontFamily: "sans-serif" }}>Error: {error}</div>;

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>Teacher Dashboard</h1>
      <p style={{ color: "#555", marginBottom: 20 }}>Real-time class mastery overview & struggle alerts</p>

      {/* Struggle alerts banner */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ color: "#c00", marginBottom: 8 }}>⚠ Struggle Alerts ({alerts.length})</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  background: "#fff3cd",
                  border: "1px solid #ffc107",
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{alert.student_id}</strong> needs help on{" "}
                  <strong>{alert.topic?.replace(/_/g, " ")}</strong>
                  {" — "}
                  <span style={{ color: "#666", fontSize: 13 }}>
                    {alert.trigger_type?.replace(/_/g, " ")}
                    {alert.trigger_detail ? `: ${alert.trigger_detail}` : ""}
                  </span>
                  <span style={{ marginLeft: 12, fontSize: 12, color: "#999" }}>
                    {new Date(alert.timestamp * 1000).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#666" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Class overview table */}
      <h2>Class Overview</h2>
      {students.length === 0 ? (
        <div style={{ color: "#999", padding: 20 }}>No student data yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", border: "1px solid #e2e8f0" }}>Student</th>
                {allTopics.map((t) => (
                  <th key={t} style={{ padding: "10px 14px", textAlign: "center", border: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                    {t.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const topicMap = Object.fromEntries(student.topics.map((t) => [t.topic, t]));
                return (
                  <tr key={student.student_id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 14px", border: "1px solid #e2e8f0", fontWeight: 600 }}>
                      {student.name}
                    </td>
                    {allTopics.map((topic) => {
                      const m = topicMap[topic];
                      if (!m) return <td key={topic} style={{ padding: "10px 14px", textAlign: "center", border: "1px solid #e2e8f0", color: "#ccc" }}>—</td>;
                      const badge = LEVEL_BADGE[m.mastery_level] || { bg: "#999", color: "#fff" };
                      return (
                        <td key={topic} style={{ padding: "10px 14px", textAlign: "center", border: "1px solid #e2e8f0" }}>
                          <span
                            style={{
                              background: badge.bg,
                              color: badge.color,
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {m.mastery_level}
                          </span>
                          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{Math.round(m.mastery_score * 100)}%</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
