// T030: Student chat interface with Monaco Editor and AI tutor
import { useState, useRef } from "react";
import Editor from "@monaco-editor/react";

const KONG_URL = process.env.NEXT_PUBLIC_KONG_URL || "http://localhost:30080";

interface TutorResponse {
  routed_to: string;
  confidence: number;
  topic: string;
  classification: string;
  struggle_triggered: boolean;
}

interface ExplainResponse {
  explanation: string;
  code_example: string;
  topic: string;
  student_level: string;
}

interface Message {
  role: "student" | "tutor";
  content: string;
  codeExample?: string;
}

export default function TutorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("# Write your Python code here\n");
  const [loading, setLoading] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const sessionId = useRef(`session-${Date.now()}`);

  const getToken = () => localStorage.getItem("auth_token") || "";

  async function sendMessage() {
    if (!input.trim()) return;
    const userMsg: Message = { role: "student", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Step 1: Triage
      const triageRes = await fetch(`${KONG_URL}/triage/route`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          message: input,
          session_id: sessionId.current,
          student_level: "beginner",
        }),
      });
      const triage: TutorResponse = await triageRes.json();

      // Step 2: Get explanation from concepts-service
      const explainRes = await fetch(`${KONG_URL}/concepts/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          message: input,
          topic: triage.topic,
          student_level: "beginner",
        }),
      });
      const explain: ExplainResponse = await explainRes.json();

      const tutorMsg: Message = {
        role: "tutor",
        content: explain.explanation,
        codeExample: explain.code_example,
      };
      setMessages((prev) => [...prev, tutorMsg]);

      if (triage.struggle_triggered) {
        setMessages((prev) => [
          ...prev,
          {
            role: "tutor",
            content: "I noticed you might be struggling — your teacher has been alerted and will check in soon.",
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "tutor", content: `Error: ${err}. Please try again.` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function runCode() {
    setRunOutput("Running...");
    try {
      const res = await fetch(`${KONG_URL}/exercise/grade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          exercise_id: "sandbox-run",
          code,
          test_input: "",
          test_expected: "",
          topic: "sandbox",
        }),
      });
      const result = await res.json();
      setRunOutput(result.execution_output || result.feedback || JSON.stringify(result));
    } catch (err) {
      setRunOutput(`Run error: ${err}`);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      {/* Chat panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, borderRight: "1px solid #ddd" }}>
        <h2 style={{ margin: "0 0 12px" }}>Python AI Tutor</h2>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, textAlign: m.role === "student" ? "right" : "left" }}>
              <div
                style={{
                  display: "inline-block",
                  background: m.role === "student" ? "#0070f3" : "#f0f0f0",
                  color: m.role === "student" ? "#fff" : "#000",
                  padding: "8px 12px",
                  borderRadius: 8,
                  maxWidth: "80%",
                }}
              >
                {m.content}
              </div>
              {m.codeExample && (
                <pre
                  style={{
                    background: "#1e1e1e",
                    color: "#d4d4d4",
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 13,
                    textAlign: "left",
                    marginTop: 8,
                    overflowX: "auto",
                  }}
                >
                  {m.codeExample}
                </pre>
              )}
            </div>
          ))}
          {loading && <div style={{ color: "#999" }}>Thinking...</div>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask a Python question..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Code editor panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16 }}>
        <h2 style={{ margin: "0 0 12px" }}>Code Editor</h2>
        <div style={{ flex: 1, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
          <Editor
            height="100%"
            defaultLanguage="python"
            value={code}
            onChange={(v) => setCode(v || "")}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14 }}
          />
        </div>
        <button
          onClick={runCode}
          style={{ padding: "8px 16px", background: "#00a550", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 8 }}
        >
          Run Code
        </button>
        <pre
          style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: 12,
            borderRadius: 6,
            minHeight: 80,
            fontSize: 13,
            overflowX: "auto",
          }}
        >
          {runOutput || "Output will appear here..."}
        </pre>
      </div>
    </div>
  );
}
