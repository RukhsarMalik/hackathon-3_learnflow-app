import { useEffect, useState, useRef } from "react";
import Link from "next/link";

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

const LEVEL_COLORS: Record<string, string> = {
  Mastered: "#51cf66",
  Proficient: "#6c63ff",
  Learning: "#ffa94d",
  Beginner: "#ff6b6b",
};

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:30090";

const NAV_CARDS = [
  {
    href: "/tutor",
    icon: "🤖",
    title: "AI Tutor",
    desc: "Chat with AI and get Python explanations with code examples",
    color: "#6c63ff",
  },
  {
    href: "/exercises",
    icon: "💻",
    title: "Exercises",
    desc: "Generate and solve Python exercises with real-time grading",
    color: "#00c9a7",
  },
  {
    href: "/progress",
    icon: "📈",
    title: "My Progress",
    desc: "Track your mastery levels across all Python topics",
    color: "#ffa94d",
  },
  {
    href: DOCS_URL,
    icon: "📚",
    title: "Docs",
    desc: "LearnFlow architecture, API reference, and service documentation",
    color: "#ff6b9d",
    external: true,
  },
];

export default function TeacherDashboard() {
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [alerts, setAlerts] = useState<StruggleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const getTeacherId = () => typeof window !== "undefined" ? localStorage.getItem("teacher_id") || "00000000-0000-0000-0000-000000000002" : "00000000-0000-0000-0000-000000000002";

  useEffect(() => {
    async function fetchClass() {
      try {
        const res = await fetch(`${KONG_URL}/progress/class/${getTeacherId()}`, {
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

    const es = new EventSource(`${KONG_URL}/events/stream/${getTeacherId()}`);
    eventSourceRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "struggle.detected") {
          const alert: StruggleAlert = { ...data, id: `${Date.now()}-${Math.random()}` };
          setAlerts((prev) => [alert, ...prev].slice(0, 20));
        }
      } catch (_) {}
    };
    return () => es.close();
  }, []);

  const allTopics = Array.from(new Set(students.flatMap((s) => s.topics.map((t) => t.topic)))).sort();

  return (
    <div className="container">
      {/* Hero */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, marginBottom: 8 }}>
          Welcome to <span className="gradient-text">LearnFlow</span>
        </h1>
        <p style={{ color: "var(--text2)", fontSize: 16 }}>
          AI-powered Python learning platform. Explore the tools below.
        </p>
      </div>

      {/* Nav Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 48 }}>
        {NAV_CARDS.map((card) => {
          const cardContent = (
            <div
              className="card"
              style={{
                cursor: "pointer",
                transition: "all 0.2s",
                borderColor: "transparent",
                background: `linear-gradient(135deg, var(--card) 0%, rgba(${card.color === "#6c63ff" ? "108,99,255" : card.color === "#00c9a7" ? "0,201,167" : card.color === "#ffa94d" ? "255,169,77" : "255,107,157"},0.08) 100%)`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLElement).style.borderColor = card.color;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${card.color}33`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `${card.color}22`,
                border: `1px solid ${card.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, marginBottom: 16,
              }}>
                {card.icon}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{card.title}</h3>
              <p style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6 }}>{card.desc}</p>
              <div style={{ marginTop: 16, color: card.color, fontSize: 13, fontWeight: 600 }}>
                Open {card.title} →
              </div>
            </div>
          );
          return "external" in card && card.external ? (
            <a key={card.href} href={card.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              {cardContent}
            </a>
          ) : (
            <Link key={card.href} href={card.href} style={{ textDecoration: "none" }}>
              {cardContent}
            </Link>
          );
        })}
      </div>

      {/* Teacher Dashboard Section */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🏫 Teacher Dashboard</h2>
        <p style={{ color: "var(--text2)", fontSize: 14 }}>Real-time class mastery overview & struggle alerts</p>
      </div>

      {/* Struggle Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ color: "var(--danger)", marginBottom: 12, fontSize: 16, fontWeight: 600 }}>
            ⚠ Struggle Alerts ({alerts.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((alert) => (
              <div key={alert.id} className="alert alert-warning" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{alert.student_id}</strong> needs help on{" "}
                  <strong>{alert.topic?.replace(/_/g, " ")}</strong>
                  <span style={{ color: "var(--text3)", marginLeft: 8, fontSize: 12 }}>
                    {alert.trigger_type?.replace(/_/g, " ")}
                    {alert.trigger_detail ? `: ${alert.trigger_detail}` : ""}
                  </span>
                </div>
                <button
                  onClick={() => setAlerts(p => p.filter(a => a.id !== alert.id))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", fontSize: 20 }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Class Table */}
      {loading ? (
        <div className="card spinner">
          <div style={{ fontSize: 32 }}>⏳</div>
          <span>Loading class data...</span>
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : students.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <h3 style={{ fontWeight: 600, marginBottom: 8 }}>No student data yet</h3>
          <p style={{ color: "var(--text2)", fontSize: 14 }}>
            Students need to complete exercises first.{" "}
            <Link href="/exercises" style={{ color: "var(--primary)" }}>Go to Exercises →</Link>
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                {allTopics.map(t => <th key={t}>{t.replace(/_/g, " ")}</th>)}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const topicMap = Object.fromEntries(student.topics.map(t => [t.topic, t]));
                return (
                  <tr key={student.student_id}>
                    <td style={{ fontWeight: 600 }}>{student.name}</td>
                    {allTopics.map(topic => {
                      const m = topicMap[topic];
                      if (!m) return <td key={topic} style={{ color: "var(--text3)" }}>—</td>;
                      const color = LEVEL_COLORS[m.mastery_level] || "#999";
                      return (
                        <td key={topic}>
                          <span className="badge" style={{ background: `${color}22`, color }}>
                            {m.mastery_level}
                          </span>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>
                            {Math.round(m.mastery_score * 100)}%
                          </div>
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
