import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const KONG_URL = process.env.NEXT_PUBLIC_KONG_URL || "http://localhost:30080";

interface Message {
  role: "student" | "tutor";
  content: string;
  codeExample?: string;
}

export default function TutorPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "tutor", content: "👋 Hi! I'm your AI Python tutor. Ask me anything about Python — concepts, debugging, or exercises!" }
  ]);
  const [input, setInput] = useState("");
  const [code, setCode] = useState("# Write your Python code here\nprint('Hello, World!')\n");
  const [loading, setLoading] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const sessionId = useRef(`session-${Date.now()}`);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setMessages(prev => [...prev, { role: "student", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const triageRes = await fetch(`${KONG_URL}/triage/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message: text, session_id: sessionId.current, student_level: "beginner" }),
      });
      const triage = await triageRes.json();

      const explainRes = await fetch(`${KONG_URL}/concepts/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message: text, topic: triage.topic, student_level: "beginner" }),
      });
      const explain = await explainRes.json();

      setMessages(prev => [...prev, {
        role: "tutor",
        content: explain.explanation,
        codeExample: explain.code_example,
      }]);

      if (triage.struggle_triggered) {
        setMessages(prev => [...prev, {
          role: "tutor",
          content: "💡 I noticed you might be struggling — your teacher has been notified to check in with you!",
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "tutor", content: `❌ Error: ${err}. Please try again.` }]);
    } finally {
      setLoading(false);
    }
  }

  async function runCode() {
    setRunOutput("⏳ Running...");
    try {
      const res = await fetch(`${KONG_URL}/exercise/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ exercise_id: "sandbox-run", code, test_input: "", test_expected: "", topic: "sandbox" }),
      });
      const result = await res.json();
      setRunOutput(result.execution_output || result.feedback || JSON.stringify(result));
    } catch (err) {
      setRunOutput(`❌ Run error: ${err}`);
    }
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", gap: 0 }}>
      {/* Chat Panel */}
      <div style={{ width: "45%", display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>🤖 AI Python Tutor</h2>
          <p style={{ color: "var(--text2)", fontSize: 13 }}>Ask anything about Python</p>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "student" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "80%" }}>
                {m.role === "tutor" && (
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4, paddingLeft: 4 }}>AI Tutor</div>
                )}
                <div className={m.role === "student" ? "chat-bubble-student" : "chat-bubble-tutor"}>
                  {m.content}
                </div>
                {m.codeExample && (
                  <pre style={{
                    background: "#0d1117", color: "#e6edf3", padding: "12px 14px",
                    borderRadius: "0 0 12px 12px", fontSize: 13, overflowX: "auto",
                    marginTop: 2, border: "1px solid var(--border)", borderTop: "none",
                    lineHeight: 1.6,
                  }}>
                    {m.codeExample}
                  </pre>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--text3)", fontSize: 13 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "var(--primary)",
                    animation: "pulse 1s infinite", animationDelay: `${i * 0.2}s`, opacity: 0.6,
                  }} />
                ))}
              </div>
              Thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", background: "var(--card)", display: "flex", gap: 10 }}>
          <input
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Ask a Python question..."
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={sendMessage} disabled={loading} style={{ whiteSpace: "nowrap" }}>
            Send ↑
          </button>
        </div>
      </div>

      {/* Editor Panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--card)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>💻 Code Editor</h2>
            <p style={{ color: "var(--text2)", fontSize: 13 }}>Write and run Python code</p>
          </div>
          <button className="btn btn-success" onClick={runCode}>▶ Run Code</button>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Editor
            height="100%"
            defaultLanguage="python"
            value={code}
            onChange={v => setCode(v || "")}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 12 }, scrollBeyondLastLine: false }}
          />
        </div>

        {/* Output */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div style={{ padding: "10px 16px", background: "var(--card2)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text2)", fontWeight: 600, letterSpacing: 0.5 }}>
            OUTPUT
          </div>
          <pre style={{
            background: "#0d1117", color: "#e6edf3", padding: "14px 16px",
            fontSize: 13, minHeight: 80, maxHeight: 160, overflowY: "auto",
            lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}>
            {runOutput || "// Output will appear here after running code"}
          </pre>
        </div>
      </div>
    </div>
  );
}
