"use client";
import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<{ role: string; content: string }[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState("");
  const [project, setProject] = useState("");
  const [goal, setGoal] = useState("");
  const [lastActivity, setLastActivity] = useState("");
  const [view, setView] = useState<"chat" | "pulse">("chat");

  async function sendMessage() {
    if (!message.trim()) return;
    setLoading(true);
    const userMsg = { role: "user", content: message };
    setChat((prev) => [...prev, userMsg]);
    setMessage("");

    const res = await fetch("http://localhost:8080/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    const data = await res.json();
    setHistory(data.history);
    setChat((prev) => [...prev, { role: "assistant", content: data.reply }]);
    setLoading(false);
  }

  async function getPulse() {
    if (!project || !goal || !lastActivity) return;
    setLoading(true);
    const res = await fetch("http://localhost:8080/pulse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: project, goal, lastActivity }),
    });
    const data = await res.json();
    setPulse(data.pulse);
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-indigo-400">⚡ Meridian</h1>
          <p className="text-gray-400 mt-2">Your AI Accountability Agent</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setView("chat")}
            className={`px-4 py-2 rounded-lg font-medium ${view === "chat" ? "bg-indigo-600" : "bg-gray-800"}`}
          >
            💬 Chat
          </button>
          <button
            onClick={() => setView("pulse")}
            className={`px-4 py-2 rounded-lg font-medium ${view === "pulse" ? "bg-indigo-600" : "bg-gray-800"}`}
          >
            🌅 Daily Pulse
          </button>
        </div>

        {/* Chat View */}
        {view === "chat" && (
          <div>
            <div className="bg-gray-900 rounded-xl p-4 h-96 overflow-y-auto mb-4 flex flex-col gap-3">
              {chat.length === 0 && (
                <p className="text-gray-500 text-center mt-32">Start talking to Meridian...</p>
              )}
              {chat.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`px-4 py-2 rounded-xl max-w-lg text-sm ${msg.role === "user" ? "bg-indigo-600" : "bg-gray-700"}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <p className="text-gray-500 text-sm animate-pulse">Meridian is thinking...</p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-gray-800 rounded-lg px-4 py-2 text-white outline-none"
                placeholder="Talk to your AI agent..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button
                onClick={sendMessage}
                disabled={loading}
                className="bg-indigo-600 px-6 py-2 rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Pulse View */}
        {view === "pulse" && (
          <div className="bg-gray-900 rounded-xl p-6 flex flex-col gap-4">
            <input
              className="bg-gray-800 rounded-lg px-4 py-2 text-white outline-none"
              placeholder="Project name (e.g. Meridian)"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
            <input
              className="bg-gray-800 rounded-lg px-4 py-2 text-white outline-none"
              placeholder="Your goal (e.g. Launch in 8 weeks)"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <input
              className="bg-gray-800 rounded-lg px-4 py-2 text-white outline-none"
              placeholder="Last activity (e.g. Built the backend)"
              value={lastActivity}
              onChange={(e) => setLastActivity(e.target.value)}
            />
            <button
              onClick={getPulse}
              disabled={loading}
              className="bg-indigo-600 px-6 py-2 rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Get My Daily Pulse ⚡"}
            </button>
            {pulse && (
              <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-200 whitespace-pre-wrap mt-2 leading-relaxed">
                {pulse}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
