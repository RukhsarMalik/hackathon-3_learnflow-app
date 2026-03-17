import { useState } from "react";

const KONG_URL = process.env.NEXT_PUBLIC_KONG_URL || "http://localhost:30080";

const QUIZ_BANK: Record<string, { question: string; options: string[]; answer: number }[]> = {
  for_loops: [
    { question: "What does `for i in range(3)` iterate over?", options: ["[1,2,3]", "[0,1,2]", "[0,1,2,3]", "[1,2]"], answer: 1 },
    { question: "What is the output of `for i in range(2,5): print(i)`?", options: ["2 3 4", "2 3 4 5", "1 2 3 4", "0 1 2"], answer: 0 },
    { question: "Which keyword skips the current iteration?", options: ["break", "pass", "continue", "skip"], answer: 2 },
    { question: "What does `for i in [1,2,3]: print(i*2)` print last?", options: ["2", "4", "6", "8"], answer: 2 },
  ],
  while_loops: [
    { question: "What happens if a while loop condition is always True?", options: ["It runs once", "It never runs", "Infinite loop", "Syntax error"], answer: 2 },
    { question: "Which keyword exits a while loop immediately?", options: ["exit", "stop", "break", "return"], answer: 2 },
    { question: "What is the output of `x=0; while x<3: x+=1; print(x)`?", options: ["0 1 2", "1 2 3", "0 1 2 3", "1 2"], answer: 1 },
    { question: "What does `while False:` do?", options: ["Runs once", "Never executes", "Infinite loop", "Error"], answer: 1 },
  ],
  functions: [
    { question: "Which keyword defines a function in Python?", options: ["func", "define", "def", "function"], answer: 2 },
    { question: "What does a function return if no `return` statement?", options: ["0", "False", "None", "Error"], answer: 2 },
    { question: "What is `*args` used for?", options: ["Keyword arguments", "Variable positional args", "Default args", "Required args"], answer: 1 },
    { question: "What is a lambda function?", options: ["A class method", "An anonymous function", "A loop shortcut", "A decorator"], answer: 1 },
  ],
  lists: [
    { question: "How do you add an item to end of a list?", options: [".add()", ".insert()", ".append()", ".push()"], answer: 2 },
    { question: "What does `len([1,2,3])` return?", options: ["2", "3", "4", "1"], answer: 1 },
    { question: "What is the index of first element in a list?", options: ["1", "-1", "0", "None"], answer: 2 },
    { question: "How do you reverse a list `lst`?", options: ["lst.flip()", "lst.reverse()", "reverse(lst)", "lst.sort(reverse)"], answer: 1 },
  ],
  dictionaries: [
    { question: "How do you access value for key 'name' in dict `d`?", options: ["d.name", "d['name']", "d->name", "d.get['name']"], answer: 1 },
    { question: "Which method returns all keys of a dictionary?", options: [".values()", ".items()", ".keys()", ".all()"], answer: 2 },
    { question: "What does `d.get('x', 0)` return if 'x' not in d?", options: ["None", "Error", "0", "'x'"], answer: 2 },
    { question: "How do you add key 'age':25 to dict `d`?", options: ["d.add('age',25)", "d['age']=25", "d.insert('age',25)", "d.set('age',25)"], answer: 1 },
  ],
  classes: [
    { question: "What method is called when a class is instantiated?", options: ["__start__", "__init__", "__new__", "__create__"], answer: 1 },
    { question: "What is `self` in a class method?", options: ["The class itself", "The current instance", "A global variable", "The parent class"], answer: 1 },
    { question: "Which keyword creates a subclass?", options: ["extends", "inherits", "class Child(Parent):", "subclass"], answer: 2 },
    { question: "What is encapsulation?", options: ["Hiding internal state", "Multiple inheritance", "Looping over objects", "None of these"], answer: 0 },
  ],
  list_comprehensions: [
    { question: "What does `[x*2 for x in range(3)]` return?", options: ["[0,2,4]", "[1,2,3]", "[2,4,6]", "[0,1,2]"], answer: 0 },
    { question: "How do you filter evens: `[x for x in range(10) if ...]`?", options: ["x%2==1", "x%2==0", "x/2==0", "x&2==0"], answer: 1 },
    { question: "What type does a list comprehension return?", options: ["tuple", "set", "list", "dict"], answer: 2 },
    { question: "What is `{x:x**2 for x in range(3)}`?", options: ["List comp", "Set comp", "Dict comp", "Tuple comp"], answer: 2 },
  ],
  recursion: [
    { question: "What is required in every recursive function?", options: ["A loop", "A base case", "Multiple return values", "Global variables"], answer: 1 },
    { question: "What happens without a base case in recursion?", options: ["Returns None", "RecursionError", "Infinite loop silently", "Returns 0"], answer: 1 },
    { question: "What does a recursive function do?", options: ["Loops forever", "Calls itself", "Uses global state", "Imports modules"], answer: 1 },
    { question: "What is the base case for factorial(n)?", options: ["n==0 return 0", "n==1 return 1", "n==0 return 1", "n<0 return -1"], answer: 2 },
  ],
};

const TOPICS = Object.keys(QUIZ_BANK);

export default function QuizPage() {
  const [topic, setTopic] = useState("for_loops");
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const getStudentId = () => typeof window !== "undefined" ? localStorage.getItem("student_id") || "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000001";

  const questions = QUIZ_BANK[topic];
  const q = questions[current];
  const score = answers.filter(Boolean).length / questions.length;

  function startQuiz() {
    setStarted(true);
    setCurrent(0);
    setSelected(null);
    setAnswers([]);
    setFinished(false);
    setSaved(false);
  }

  function handleAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
  }

  function next() {
    const correct = selected === q.answer;
    const newAnswers = [...answers, correct];
    setAnswers(newAnswers);
    setSelected(null);
    if (current + 1 >= questions.length) {
      setFinished(true);
      saveScore(newAnswers.filter(Boolean).length / questions.length);
    } else {
      setCurrent(current + 1);
    }
  }

  async function saveScore(finalScore: number) {
    setSaving(true);
    try {
      await fetch(`${KONG_URL}/progress/mastery/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ student_id: getStudentId(), topic, component: "quiz_score", value: finalScore }),
      });
      setSaved(true);
    } catch (e) {
      console.error("Failed to save quiz score", e);
    } finally {
      setSaving(false);
    }
  }

  const gradeColor = score >= 0.75 ? "#51cf66" : score >= 0.5 ? "#ffa94d" : "#ff6b6b";
  const gradeLabel = score >= 0.75 ? "Excellent!" : score >= 0.5 ? "Good effort!" : "Keep practicing!";

  return (
    <div className="container">
      <div className="page-header">
        <h1>🧠 Python Quiz</h1>
        <p>Test your knowledge and boost your quiz score</p>
      </div>

      {!started ? (
        <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: "var(--text2)" }}>SELECT TOPIC</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
            {TOPICS.map(t => (
              <button key={t} onClick={() => setTopic(t)} className="btn" style={{
                background: topic === t ? "var(--primary)" : "var(--bg2)",
                color: topic === t ? "#fff" : "var(--text2)",
                border: `1px solid ${topic === t ? "var(--primary)" : "var(--border)"}`,
                fontSize: 13,
              }}>
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--text2)" }}>
            📋 {questions.length} questions · Multiple choice · Score saved to your progress
          </div>
          <button className="btn btn-primary btn-lg" onClick={startQuiz} style={{ width: "100%", justifyContent: "center" }}>
            Start Quiz →
          </button>
        </div>
      ) : finished ? (
        <div className="card" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{score >= 0.75 ? "🏆" : score >= 0.5 ? "⭐" : "📚"}</div>
          <h2 style={{ fontWeight: 700, marginBottom: 4, color: gradeColor }}>{gradeLabel}</h2>
          <div style={{ fontSize: 40, fontWeight: 800, color: gradeColor, marginBottom: 4 }}>{Math.round(score * 100)}%</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 24 }}>
            {answers.filter(Boolean).length} / {questions.length} correct · {topic.replace(/_/g, " ")}
          </div>
          {saving && <div style={{ color: "var(--text2)", fontSize: 13, marginBottom: 16 }}>⏳ Saving to progress...</div>}
          {saved && <div style={{ color: "#51cf66", fontSize: 13, marginBottom: 16 }}>✅ Progress updated!</div>}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={startQuiz}>Try Again</button>
            <button className="btn" style={{ background: "var(--bg2)" }} onClick={() => setStarted(false)}>Change Topic</button>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {/* Progress bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>
              <span>Question {current + 1} of {questions.length}</span>
              <span>{topic.replace(/_/g, " ")}</span>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${((current) / questions.length) * 100}%` }} />
            </div>
          </div>

          {/* Question */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>{q.question}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options.map((opt, idx) => {
                let bg = "var(--bg2)";
                let border = "var(--border)";
                let color = "var(--text)";
                if (selected !== null) {
                  if (idx === q.answer) { bg = "#51cf6622"; border = "#51cf66"; color = "#51cf66"; }
                  else if (idx === selected && selected !== q.answer) { bg = "#ff6b6b22"; border = "#ff6b6b"; color = "#ff6b6b"; }
                } else if (selected === idx) {
                  bg = "var(--primary)22"; border = "var(--primary)";
                }
                return (
                  <button key={idx} onClick={() => handleAnswer(idx)} style={{
                    background: bg, border: `1px solid ${border}`, color,
                    borderRadius: 8, padding: "12px 16px", textAlign: "left",
                    fontSize: 14, cursor: selected !== null ? "default" : "pointer",
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}>
                    <span style={{ fontWeight: 600, marginRight: 10 }}>{["A","B","C","D"][idx]}.</span>{opt}
                  </button>
                );
              })}
            </div>
          </div>

          {selected !== null && (
            <button className="btn btn-primary btn-lg" onClick={next} style={{ width: "100%", justifyContent: "center" }}>
              {current + 1 >= questions.length ? "Finish Quiz" : "Next Question →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
