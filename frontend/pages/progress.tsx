// T047: Student progress page — mastery profile with per-topic levels and component scores
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
  Mastered: "#00a550",
  Proficient: "#0070f3",
  Learning: "#f0a500",
  Beginner: "#e53e3e",
};

const LEVEL_BARS: Record<string, number> = {
  Mastered: 100,
  Proficient: 75,
  Learning: 50,
  Beginner: 25,
};

function ComponentBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555" }}>
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${value * 100}%`, background: "#0070f3", height: "100%", transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const [profile, setProfile] = useState<MasteryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const getToken = () => localStorage.getItem("auth_token") || "";
  const getStudentId = () => localStorage.getItem("student_id") || "demo-student";

  useEffect(() => {
    async function fetchProfile() {
      try {
        const studentId = getStudentId();
        const res = await fetch(`${KONG_URL}/progress/mastery/${studentId}`, {
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

  if (loading) return <div style={{ textAlign: "center", padding: 60, fontFamily: "sans-serif" }}>Loading progress...</div>;
  if (error) return <div style={{ color: "#c00", padding: 24, fontFamily: "sans-serif" }}>Error: {error}</div>;
  if (!profile || profile.topics.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "#999", fontFamily: "sans-serif" }}>No progress data yet. Complete some exercises to see your mastery levels!</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>My Python Progress</h1>
      <p style={{ color: "#555" }}>Student ID: {profile.student_id}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginTop: 20 }}>
        {profile.topics.map((t) => {
          const levelColor = LEVEL_COLORS[t.mastery_level] || "#999";
          return (
            <div key={t.topic} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{t.topic.replace(/_/g, " ")}</h3>
                <span
                  style={{
                    background: levelColor,
                    color: "#fff",
                    padding: "3px 10px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {t.mastery_level}
                </span>
              </div>

              <div style={{ background: "#e2e8f0", borderRadius: 6, height: 10, overflow: "hidden", marginBottom: 12 }}>
                <div
                  style={{
                    width: `${t.mastery_score * 100}%`,
                    background: levelColor,
                    height: "100%",
                    transition: "width 0.4s",
                  }}
                />
              </div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                Overall: <strong>{Math.round(t.mastery_score * 100)}%</strong>
              </div>

              <ComponentBar label="Exercise completion (×0.40)" value={t.exercise_completion} />
              <ComponentBar label="Quiz score (×0.30)" value={t.quiz_score} />
              <ComponentBar label="Code quality (×0.20)" value={t.code_quality} />
              <ComponentBar label="Consistency streak (×0.10)" value={t.consistency_streak} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
