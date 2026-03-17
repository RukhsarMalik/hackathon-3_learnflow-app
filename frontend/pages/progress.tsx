import { useEffect, useState } from "react";

const KONG_URL = process.env.NEXT_PUBLIC_KONG_URL || "http://localhost:30080";

interface TopicMastery {
  topic: string;
  mastery_score: number;
  mastery_level: string;
  exercise_completion: number;
  quiz_score: number;
  code_quality: number;
  consistency_streak: number;
}

interface MasteryProfile {
  student_id: string;
  topics: TopicMastery[];
}

const LEVEL_COLORS: Record<string, string> = {
  Mastered: "#51cf66",
  Proficient: "#6c63ff",
  Learning: "#ffa94d",
  Beginner: "#ff6b6b",
};

const LEVEL_ICONS: Record<string, string> = {
  Mastered: "🏆",
  Proficient: "⭐",
  Learning: "📚",
  Beginner: "🌱",
};

function Bar({ label, value, color = "var(--primary)" }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)", marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: "var(--text)" }}>{Math.round(value * 100)}%</span>
      </div>
      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${value * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const [profile, setProfile] = useState<MasteryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const getStudentId = () => typeof window !== "undefined" ? localStorage.getItem("student_id") || "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000001";

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`${KONG_URL}/progress/mastery/${getStudentId()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load progress");
        setProfile(data);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  // Summary stats
  const avgMastery = profile?.topics.length
    ? profile.topics.reduce((s, t) => s + t.mastery_score, 0) / profile.topics.length
    : 0;
  const topicCount = profile?.topics.length || 0;
  const masteredCount = profile?.topics.filter(t => t.mastery_level === "Mastered").length || 0;

  return (
    <div className="container">
      <div className="page-header">
        <h1>📈 My Progress</h1>
        <p>Track your Python mastery across all topics</p>
      </div>

      {loading ? (
        <div className="card spinner">
          <div style={{ fontSize: 32 }}>⏳</div>
          <span>Loading your progress...</span>
        </div>
      ) : error ? (
        <div className="alert alert-error">⚠ {error}</div>
      ) : !profile || profile.topics.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🌱</div>
          <h3 style={{ fontWeight: 600, marginBottom: 8 }}>No progress yet</h3>
          <p style={{ color: "var(--text2)", fontSize: 14 }}>
            Complete some exercises to see your mastery levels here!
          </p>
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
            <div className="stat-card">
              <div className="stat-card-value gradient-text">{Math.round(avgMastery * 100)}%</div>
              <div className="stat-card-label">Average Mastery</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value" style={{ color: "var(--secondary)" }}>{topicCount}</div>
              <div className="stat-card-label">Topics Studied</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value" style={{ color: "#51cf66" }}>{masteredCount}</div>
              <div className="stat-card-label">Topics Mastered</div>
            </div>
          </div>

          {/* Topic Cards */}
          <div className="grid-3">
            {profile.topics.map(t => {
              const color = LEVEL_COLORS[t.mastery_level] || "#999";
              const icon = LEVEL_ICONS[t.mastery_level] || "📖";
              return (
                <div key={t.topic} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{t.topic.replace(/_/g, " ")}</h3>
                    <span className="badge" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                      {icon} {t.mastery_level}
                    </span>
                  </div>

                  {/* Overall bar */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: "var(--text2)" }}>Overall Mastery</span>
                      <span style={{ fontWeight: 700, color }}>{Math.round(t.mastery_score * 100)}%</span>
                    </div>
                    <div className="progress-bar-wrap" style={{ height: 10 }}>
                      <div className="progress-bar-fill" style={{ width: `${t.mastery_score * 100}%`, background: color }} />
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <Bar label="Exercises (×0.40)" value={t.exercise_completion} color={color} />
                    <Bar label="Quiz Score (×0.30)" value={t.quiz_score} color={color} />
                    <Bar label="Code Quality (×0.20)" value={t.code_quality} color={color} />
                    <Bar label="Consistency (×0.10)" value={t.consistency_streak} color={color} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
