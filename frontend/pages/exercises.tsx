import { useState } from "react";

const KONG_URL = process.env.NEXT_PUBLIC_KONG_URL || "http://localhost:30080";

interface Exercise {
  exercise_id: string;
  problem: string;
  expected_output: string;
  test_input: string;
  test_expected: string;
}

interface GradeResult {
  grade: string;
  score: number;
  execution_output: string;
  feedback: string;
}

const TOPICS = [
  "for_loops", "while_loops", "functions", "lists",
  "dictionaries", "classes", "list_comprehensions", "recursion"
];

export default function ExercisesPage() {
  const [topic, setTopic] = useState("for_loops");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [code, setCode] = useState("# Write your solution here\n");
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const getStudentId = () => typeof window !== "undefined" ? localStorage.getItem("student_id") || "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000001";

  async function generateExercise() {
    setLoading(true);
    setError("");
    setGradeResult(null);
    setExercise(null);
    try {
      const res = await fetch(`${KONG_URL}/exercise/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ topic, student_level: "beginner" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Generation failed");
      setExercise(data);
      setCode("# Write your solution here\n");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitSolution() {
    if (!exercise) return;
    setGrading(true);
    setError("");
    try {
      const res = await fetch(`${KONG_URL}/exercise/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ exercise_id: exercise.exercise_id, code, test_input: exercise.test_input, test_expected: exercise.test_expected, topic, student_id: getStudentId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || "Grading failed");
      setGradeResult(data);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setGrading(false);
    }
  }

  const gradeColor = gradeResult
    ? gradeResult.grade === "pass" ? "var(--success)" : gradeResult.grade === "partial" ? "var(--warning)" : "var(--danger)"
    : "";
  const gradeIcon = gradeResult
    ? gradeResult.grade === "pass" ? "✅" : gradeResult.grade === "partial" ? "🔶" : "❌"
    : "";

  return (
    <div className="container">
      <div className="page-header">
        <h1>💻 Python Exercises</h1>
        <p>Generate AI-powered exercises and get instant feedback</p>
      </div>

      {/* Topic Selector */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: "var(--text2)" }}>SELECT TOPIC</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {TOPICS.map(t => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className="btn"
              style={{
                background: topic === t ? "var(--primary)" : "var(--bg2)",
                color: topic === t ? "#fff" : "var(--text2)",
                border: `1px solid ${topic === t ? "var(--primary)" : "var(--border)"}`,
                fontSize: 13,
              }}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-lg" onClick={generateExercise} disabled={loading}>
          {loading ? "⏳ Generating..." : "✨ Generate Exercise"}
        </button>
      </div>

      {error && <div className="alert alert-error">⚠ {error}</div>}

      {exercise && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Problem */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>📋 Problem</h3>
                <span className="badge" style={{ background: "var(--primary)22", color: "var(--primary)", border: "1px solid var(--primary)44" }}>
                  {topic.replace(/_/g, " ")}
                </span>
              </div>
              <p style={{ lineHeight: 1.7, color: "var(--text2)", fontSize: 14 }}>{exercise.problem}</p>
              {exercise.expected_output && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)", marginBottom: 6 }}>EXPECTED OUTPUT</div>
                  <pre style={{ background: "var(--bg2)", padding: "10px 12px", borderRadius: 8, fontSize: 13, color: "var(--secondary)" }}>
                    {exercise.expected_output}
                  </pre>
                </div>
              )}
            </div>

            {/* Grade Result */}
            {gradeResult && (
              <div className="card" style={{ border: `1px solid ${gradeColor}66` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>{gradeIcon}</span>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: gradeColor }}>
                      {gradeResult.grade === "pass" ? "Passed!" : gradeResult.grade === "partial" ? "Partial Credit" : "Failed"}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text2)" }}>Score: {Math.round(gradeResult.score * 100)}%</div>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.6, marginBottom: 12 }}>{gradeResult.feedback}</p>
                {gradeResult.execution_output && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)", marginBottom: 6 }}>YOUR OUTPUT</div>
                    <pre style={{ background: "#0d1117", color: "#e6edf3", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}>
                      {gradeResult.execution_output}
                    </pre>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Editor */}
          <div>
            <div style={{ background: "var(--card)", borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border)", marginBottom: 12 }}>
              <div style={{ padding: "12px 16px", background: "var(--card2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>SOLUTION.PY</span>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>Python 3</span>
              </div>
              <textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%",
                  height: "340px",
                  background: "#1e1e1e",
                  color: "#d4d4d4",
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: 14,
                  padding: "12px 16px",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  boxSizing: "border-box",
                  lineHeight: 1.6,
                }}
              />
            </div>
            <button
              className="btn btn-success btn-lg"
              onClick={submitSolution}
              disabled={grading}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {grading ? "⏳ Grading..." : "🚀 Submit Solution"}
            </button>
          </div>
        </div>
      )}

      {!exercise && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎯</div>
          <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Ready to practice?</h3>
          <p style={{ color: "var(--text2)", fontSize: 14 }}>Select a topic above and click "Generate Exercise" to get started.</p>
        </div>
      )}
    </div>
  );
}
