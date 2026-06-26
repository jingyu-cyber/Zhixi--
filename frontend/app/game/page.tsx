"use client";

import { useState, useEffect, useCallback } from "react";
import NavSidebar from "@/components/NavSidebar";
import UserTopbar from "@/components/UserTopbar";
import { API_BASE_URL } from "@/lib/api";
import { useAuthSession } from "@/lib/session";

const API = API_BASE_URL;

interface NodeInfo {
  id: number;
  name: string;
  type: string;
  definition: string;
}

interface Challenge {
  node_a: NodeInfo;
  node_b: NodeInfo;
  options: string[];
  option_labels: Record<string, string>;
}

interface AnswerResult {
  correct: boolean;
  correct_answer: string;
  correct_answer_label: string;
  explanation: string;
  score: number;
  streak: number;
}

interface Stats {
  total: number;
  correct: number;
  streak: number;
  best_streak: number;
  score: number;
}

export default function GamePage() {
  const { sessionId: session, scopeKey } = useAuthSession();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, correct: 0, streak: 0, best_streak: 0, score: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChallenge(null); setSelected(null); setResult(null);
    setStats({ total: 0, correct: 0, streak: 0, best_streak: 0, score: 0 }); setError(null);
  }, [scopeKey]);

  const fetchChallenge = useCallback(async () => {
    if (!session) return;
    setLoading(true); setSelected(null); setResult(null); setError(null);
    try {
      const res = await fetch(`${API}/game/challenge?session_id=${session}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load challenge");
      if (data.empty) setChallenge(null); else setChallenge(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [session]);

  const fetchStats = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`${API}/game/stats?session_id=${session}`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [session]);

  useEffect(() => { if (session) { fetchChallenge(); fetchStats(); } }, [session, fetchChallenge, fetchStats]);

  const handleAnswer = async (answer: string) => {
    if (!session || !challenge || selected) return;
    setSelected(answer);
    try {
      const res = await fetch(`${API}/game/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session, node_a_id: challenge.node_a.id,
          node_b_id: challenge.node_b.id, answer,
        }),
      });
      if (!res.ok) throw new Error("Submit failed");
      const data: AnswerResult = await res.json();
      setResult(data);
      setStats(prev => ({ ...prev, score: data.score, streak: data.streak }));
      setTimeout(() => { fetchChallenge(); fetchStats(); }, 2200);
    } catch { setError("Failed to submit answer"); }
  };

  const getOptionStyle = (opt: string) => {
    const base: React.CSSProperties = {
      padding: "14px 18px", borderRadius: 10, border: "2px solid var(--border)",
      cursor: "pointer", fontSize: 14, textAlign: "left",
      transition: "all 0.25s", background: "var(--bg-elevated)", color: "var(--ink)",
      fontWeight: 500,
    };
    if (!selected) return base;
    if (result && opt === result.correct_answer) return { ...base, borderColor: "#22c55e", background: "#f0fdf4", color: "#16a34a" };
    if (opt === selected && !result?.correct) return { ...base, borderColor: "#ef4444", background: "#fef2f2", color: "#dc2626" };
    if (result && opt === result.correct_answer) return { ...base, borderColor: "#22c55e", opacity: 0.7 };
    return { ...base, opacity: 0.4 };
  };

  const relationIcon = (label: string) => {
    if (label.includes("前置")) return "⬆️";
    if (label.includes("包含") || label.includes("属于")) return "📦";
    if (label.includes("支撑")) return "🏗️";
    if (label.includes("解释")) return "💡";
    if (label.includes("推荐")) return "👉";
    if (label.includes("无关系")) return "✂️";
    if (label.includes("相关")) return "🔗";
    return "❓";
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <span className="brand-title">知析 ZhiXi</span>
          <span className="brand-subtitle">🌌 知识星际对战</span>
        </div>
        <div className="topbar-actions"><UserTopbar /></div>
      </header>
      <div className="app-with-nav">
        <NavSidebar />
        <main style={{
          flex: 1, display: "flex", justifyContent: "center", padding: "20px",
          background: "linear-gradient(180deg, var(--bg-sunken) 0%, rgba(79,70,229,0.04) 100%)",
          minHeight: "calc(100vh - 56px)", overflow: "auto"
        }}>
          <div className="game-container" style={{ maxWidth: 560 }}>
            {/* Score Bar */}
            <div style={{
              background: "linear-gradient(135deg, #1e1b4b, #3730a3)", borderRadius: 16,
              padding: "14px 22px", marginBottom: 20, color: "#fff",
              display: "flex", justifyContent: "space-around", textAlign: "center",
              boxShadow: "0 4px 18px rgba(55,48,163,0.3)",
            }}>
              {[
                { v: stats.score, l: "⭐ 分数", c: "#fbbf24" },
                { v: stats.streak, l: "🔥 连胜", c: "#f97316" },
                { v: stats.best_streak, l: "🏆 最佳", c: "#a78bfa" },
                { v: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) + "%" : "0%", l: "🎯 正确率", c: "#34d399" },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ textAlign: "center", padding: 32, background: "var(--bg-elevated)", borderRadius: 14, border: "1px solid var(--border)", marginBottom: 16 }}>
                <div style={{ color: "#f87171", marginBottom: 12, fontSize: 14 }}>{error}</div>
                <button className="btn btn-primary btn-sm" onClick={fetchChallenge}>🔄 重试</button>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", padding: 60, background: "var(--bg-elevated)", borderRadius: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 36, animation: "pulse 1s infinite" }}>🚀</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 14, marginTop: 8 }}>正在穿越知识星云...</div>
              </div>
            )}

            {!loading && challenge && (
              <>
                {/* Two concept cards */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
                  <div style={{
                    flex: 1, background: "var(--bg-elevated)", borderRadius: 14, padding: "16px 14px",
                    border: "2px solid var(--border)", textAlign: "center", minHeight: 100,
                    display: "flex", flexDirection: "column", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase" }}>
                      {challenge.node_a.type}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", lineHeight: 1.3 }}>
                      {challenge.node_a.name}
                    </div>
                    {challenge.node_a.definition && (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.4 }}>
                        {challenge.node_a.definition.length > 50
                          ? challenge.node_a.definition.slice(0, 50) + "..."
                          : challenge.node_a.definition}
                      </div>
                    )}
                  </div>

                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 18, fontWeight: 700,
                    boxShadow: "0 4px 12px rgba(99,102,241,0.4)", flexShrink: 0,
                  }}>VS</div>

                  <div style={{
                    flex: 1, background: "var(--bg-elevated)", borderRadius: 14, padding: "16px 14px",
                    border: "2px solid var(--border)", textAlign: "center", minHeight: 100,
                    display: "flex", flexDirection: "column", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase" }}>
                      {challenge.node_b.type}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", lineHeight: 1.3 }}>
                      {challenge.node_b.name}
                    </div>
                    {challenge.node_b.definition && (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.4 }}>
                        {challenge.node_b.definition.length > 50
                          ? challenge.node_b.definition.slice(0, 50) + "..."
                          : challenge.node_b.definition}
                      </div>
                    )}
                  </div>
                </div>

                {/* Question prompt */}
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <span style={{
                    display: "inline-block", padding: "4px 14px", borderRadius: 20,
                    background: "rgba(99,102,241,0.1)", color: "var(--primary)",
                    fontSize: 12, fontWeight: 600,
                  }}>
                    🤔 这两个概念之间的关系是？
                  </span>
                </div>

                {/* Options */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {challenge.options.map((opt, i) => (
                    <button
                      key={opt}
                      style={{ ...getOptionStyle(opt), animation: `fadeInUp 0.3s ${i * 0.08}s both` }}
                      onClick={() => handleAnswer(opt)}
                      disabled={!!selected}
                    >
                      <span style={{ marginRight: 8 }}>{relationIcon(challenge.option_labels[opt] || opt)}</span>
                      {challenge.option_labels[opt] || opt}
                    </button>
                  ))}
                </div>

                {/* Result */}
                {result && (
                  <div style={{
                    marginTop: 16, padding: "14px 18px", borderRadius: 12,
                    background: result.correct
                      ? "linear-gradient(135deg, #f0fdf4, #dcfce7)"
                      : "linear-gradient(135deg, #fef2f2, #fee2e2)",
                    border: `1px solid ${result.correct ? "#bbf7d0" : "#fecaca"}`,
                    color: result.correct ? "#16a34a" : "#dc2626",
                    fontSize: 14, textAlign: "center", animation: "fadeInUp 0.3s",
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {result.correct ? "🎉 回答正确！" : "💡 再想想！"}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
                      正确关系：{result.correct_answer_label}
                    </div>
                  </div>
                )}
              </>
            )}

            {!loading && !challenge && !error && (
              <div style={{ textAlign: "center", padding: 48, background: "var(--bg-elevated)", borderRadius: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🌌</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>请先构建知识图谱后再开始答题</div>
              </div>
            )}
          </div>
        </main>
      </div>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
