"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import NavSidebar from "@/components/NavSidebar";
import UserTopbar from "@/components/UserTopbar";
import Live2DCharacter from "@/components/Live2DCharacter";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("bilimind_session") || "";
  } catch { return ""; }
}

function getUserName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("bilimind_user_name") || "";
  } catch { return ""; }
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [hasKnowledge, setHasKnowledge] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Jingyu: Load user's knowledge context and chat history on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const sid = getSessionId();
    if (!sid) return;

    const base = window.location.hostname === "localhost" ? "http://localhost:8000" : "/api/proxy";

    // Load knowledge stats for dynamic suggestions
    fetch(base + "/tree/graph?session_id=" + sid)
      .then(r => r.json())
      .then(data => {
        const nodes = data.nodes || [];
        if (nodes.length > 0) {
          setHasKnowledge(true);
          // Jingyu: Generate suggestions from actual knowledge concepts
          const concepts = nodes
            .filter((n: any) => n.node_type === "concept")
            .slice(0, 6);
          const dynamicSuggestions = concepts.map((c: any) =>
            `请详细解释「${c.name}」这个概念`
          );
          if (dynamicSuggestions.length >= 2) {
            dynamicSuggestions.push(`总结${getUserName() || "我"}的知识库中有哪些主要知识点`);
          }
          setSuggestions(dynamicSuggestions.length > 0 ? dynamicSuggestions : [
            "我的知识库中有哪些核心概念",
            "帮我总结知识库的主要内容",
            "根据我的收藏视频推荐学习路径",
            "列出知识库中置信度最高的知识点",
          ]);
        }
      })
      .catch(() => {});

    // Jingyu: Load recent chat history
    fetch(base + "/agent/conversations?session_id=" + sid)
      .then(r => r.json())
      .then(data => {
        const convs = data.conversations || data || [];
        if (convs.length > 0) {
          const latest = convs[0];
          if (latest.messages && latest.messages.length > 0) {
            setMessages(latest.messages.map((m: any) => ({
              role: m.role,
              content: m.content,
            })));
          }
        }
      })
      .catch(() => {});
  }, []);

  const ask = async () => {
    const q = input.trim();
    if (!q || loading) return;
    const sid = getSessionId();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setLoading(true);
    try {
      const base = window.location.hostname === "localhost" ? "http://localhost:8000" : "/api/proxy";
      const resp = await fetch(base + "/agent/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, session_id: sid }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.answer || "抱歉，暂未找到相关信息。" }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "请求失败，请稍后重试。" }]);
    }
    setLoading(false);
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand"><span style={{ fontSize: 18, fontWeight: 700 }}>知析 ZhiXi</span></div>
        <UserTopbar />
      </header>
      <main className="app-main">
        <div className="app-with-nav">
          <NavSidebar />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" }}>
            <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", padding: 60 }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>🏵️</div>
                  <div style={{ width: 180, height: 240, margin: "0 auto 12px" }}>
                    <Live2DCharacter onCharacterClick={() => {}} />
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>你好！我是小映</p>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
                    {hasKnowledge
                      ? `你的AI知识助手，已学习你的 ${getUserName() || ""} 知识库，可以回答相关问题`
                      : "你的AI知识助手，基于知识库为你解答问题"}
                  </p>
                  <div style={{ display: "grid", gap: 8, maxWidth: 440, margin: "0 auto" }}>
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => { setInput(s); }}
                        style={{ textAlign: "left", padding: "10px 18px", borderRadius: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--ink-soft)", fontSize: 13, cursor: "pointer" }}>
                        💡 {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "80%", padding: "10px 16px", borderRadius: 14, fontSize: 14, lineHeight: 1.7, wordBreak: "break-word",
                    ...(m.role === "user" ? { background: "var(--accent,#059669)", color: "#fff", borderBottomRightRadius: 4 }
                      : { background: "var(--bg-sunken)", color: "var(--ink)", border: "1px solid var(--border-light)", borderBottomLeftRadius: 4 }),
                  }}>
                    {m.role === "assistant" ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown> : m.content}
                  </div>
                </div>
              ))}
              {loading && <div style={{ textAlign: "center", padding: 8, color: "var(--text-tertiary)", fontSize: 12 }}>小映思考中...</div>}
              <div ref={chatEnd} />
            </div>

            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <input type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && ask()} placeholder="输入问题..." disabled={loading}
                style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, background: "var(--card-bg)", color: "var(--text-primary)" }} />
              <button onClick={ask} disabled={loading || !input.trim()}
                style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: loading || !input.trim() ? "#9ca3af" : "#059669", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                发送
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
