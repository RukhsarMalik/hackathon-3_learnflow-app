// T046: Exercise display with Monaco Editor, grade submission, result feedback
import { useState } from "react";
import Editor from "@monaco-editor/react";

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

export default function ExercisesPage() {
  const [topic, setTopic] = useState("for_loops");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [code, setCode] = useState("# Write your solution here\n");
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getToken = () => localStorage.getItem("auth_token") || "";

  async function generateExercise() {
    setLoading(true);
    setError("");
    setGradeResult(null);
    try {
      const res = await fetch(`${KONG_URL}/exercise/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
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
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${KONG_URL}/exercise/grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          exercise_id: exercise.exercise_id,
          code,
          test_input: exercise.test_input,
          test_expected: exercise.test_expected,
          topic,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || "Grading failed");
      setGradeResult(data);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  }

  const gradeColor = gradeResult
    ? gradeResult.grade === "pass" ? "#00a550" : gradeResult.grade === "partial" ? "#f0a500" : "#e53e3e"
    : "#000";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Python Exercises</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
        >
          {["for_loops", "while_loops", "functions", "lists", "dictionaries", "classes", "list_comprehensions", "recursion"].map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button
          onClick={generateExercise}
          disabled={loading}
          style={{ padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          {loading ? "Generating..." : "New Exercise"}
        </button>
      </div>

      {error && <div style={{ background: "#fee", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16 }}>{error}</div>}

      {exercise && (
        <>
          <div style={{ background: "#f8f9fa", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 8px" }}>Exercise: {topic.replace(/_/g, " ")}</h3>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{exercise.problem}</p>
            {exercise.expected_output && (
              <div style={{ marginTop: 8 }}>
                <strong>Expected output:</strong>
                <pre style={{ background: "#eee", padding: 8, borderRadius: 4, margin: "4px 0 0" }}>{exercise.expected_output}</pre>
              </div>
            )}
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
            <Editor
              height="300px"
              defaultLanguage="python"
              value={code}
              onChange={(v) => setCode(v || "")}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>

          <button
            onClick={submitSolution}
            disabled={loading}
            style={{ padding: "10px 24px", background: "#00a550", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15 }}
          >
            {loading ? "Grading..." : "Submit Solution"}
          </button>

          {gradeResult && (
            <div style={{ marginTop: 16, padding: 16, borderRadius: 8, border: `2px solid ${gradeColor}`, background: "#fff" }}>
              <h3 style={{ color: gradeColor, margin: "0 0 8px" }}>
                {gradeResult.grade === "pass" ? "✓ Passed!" : gradeResult.grade === "partial" ? "~ Partial Credit" : "✗ Failed"}
                {" "}({Math.round(gradeResult.score * 100)}%)
              </h3>
              <p style={{ margin: "0 0 8px" }}>{gradeResult.feedback}</p>
              {gradeResult.execution_output && (
                <div>
                  <strong>Your output:</strong>
                  <pre style={{ background: "#1e1e1e", color: "#d4d4d4", padding: 10, borderRadius: 4, margin: "4px 0 0", fontSize: 13 }}>
                    {gradeResult.execution_output}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!exercise && !loading && (
        <div style={{ textAlign: "center", color: "#999", padding: 40 }}>
          Select a topic and click "New Exercise" to get started.
        </div>
      )}
    </div>
  );
}
