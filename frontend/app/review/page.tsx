"use client";

import { useState, useEffect, useCallback } from "react";
import NavSidebar from "@/components/NavSidebar";
import UserTopbar from "@/components/UserTopbar";
import { API_BASE_URL } from "@/lib/api";
import { useAuthSession } from "@/lib/session";

const API = API_BASE_URL;

interface DueItem {
  node_id: number;
  name: string;
  definition: string | null;
  node_type: string;
  easiness_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_date: string | null;
  implicit_review: boolean;
}

interface ImplicitNode {
  node_id: number;
  name: string;
  depth: number;
}

interface ReviewResult {
  node_id: number;
  easiness_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_date: string | null;
  implicit_reviewed: ImplicitNode[];
}

interface Stats {
  total_tracked: number;
  due_today: number;
  mastered: number;
  avg_retention: number;
}

const QUALITY_BUTTONS = [
  { value: 1, label: "完全忘记", emoji: "😰", color: "#ef4444" },
  { value: 2, label: "困难", emoji: "😣", color: "#f97316" },
  { value: 3, label: "一般", emoji: "🤔", color: "#f59e0b" },
  { value: 4, label: "容易", emoji: "😊", color: "#3b82f6" },
  { value: 5, label: "完美", emoji: "🤩", color: "#22c55e" },
];

export default function ReviewPage() {
  const { sessionId: session, scopeKey } = useAuthSession();
  const [items, setItems] = useState<DueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [stats, setStats] = useState<Stats>({ total_tracked: 0, due_today: 0, mastered: 0, avg_retention: 0 });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setItems([]); setCurrentIndex(0); setResult(null);
    setStats({ total_tracked: 0, due_today: 0, mastered: 0, avg_retention: 0 });
  }, [scopeKey]);

  const fetchDue = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/srs/due?session_id=${session}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []); setCurrentIndex(0); setResult(null);
      }
    } catch {} finally { setLoading(false); }
  }, [session]);

  const fetchStats = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`${API}/srs/stats?session_id=${session}`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [session]);

  useEffect(() => { if (session) { fetchDue(); fetchStats(); } }, [session, fetchDue, fetchStats]);

  const handleQuality = async (quality: number) => {
    if (!session || !items[currentIndex] || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/srs/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session, node_id: items[currentIndex].node_id, quality }),
      });
      if (res.ok) {
        const data: ReviewResult = await res.json();
        setResult(data);
        setTimeout(() => { setResult(null); setCurrentIndex((prev) => prev + 1); fetchStats(); }, 1800);
      }
    } catch {} finally { setSubmitting(false); }
  };

  const current = items[currentIndex] || null;
  const completed = currentIndex;
  const total = items.length;
  const allDone = !loading && (total === 0 || currentIndex >= total);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <span className="brand-title">知析 ZhiXi</span>
          <span className="brand-subtitle">🧠 记忆闪卡复习</span>
        </div>
        <div className="topbar-actions"><UserTopbar /></div>
      </header>
      <div className="app-with-nav">
        <NavSidebar />
        <main style={{
          flex: 1, display: "flex", justifyContent: "center", padding: "20px",
          background: "linear-gradient(180deg, var(--bg-sunken) 0%, rgba(139,92,246,0.03) 100%)",
          minHeight: "calc(100vh - 56px)", overflow: "auto"
        }}>
          <div style={{ maxWidth: 520, width: "100%" }}>
            {/* Stats Bar */}
            <div style={{
              display: "flex", gap: 10, marginBottom: 16, justifyContent: "center"
            }}>
              {[
                { v: stats.due_today, l: "待复习", c: "#f97316" },
                { v: stats.mastered, l: "已掌握", c: "#22c55e" },
                { v: stats.total_tracked, l: "总追踪", c: "#3b82f6" },
                { v: Math.round(stats.avg_retention * 100) + "%", l: "记忆率", c: "#8b5cf6" },
              ].map((s, i) => (
                <div key={i} style={{
                  flex: 1, background: "var(--bg-elevated)", borderRadius: 12,
                  padding: "10px 8px", textAlign: "center", border: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            {total > 0 && !allDone && (
              <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${(completed / total) * 100}%`,
                  background: "linear-gradient(90deg, #8b5cf6, #a78bfa)", borderRadius: 3,
                  transition: "width 0.4s ease",
                }} />
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", padding: 60, background: "var(--bg-elevated)", borderRadius: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 36, animation: "pulse 1s infinite" }}>🧠</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 14, marginTop: 8 }}>正在准备复习卡片...</div>
              </div>
            )}

            {/* All Done */}
            {allDone && !loading && (
              <div style={{
                textAlign: "center", padding: 48, background: "var(--bg-elevated)",
                borderRadius: 16, border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 56, marginBottom: 16, animation: "pulse 0.5s 3" }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)", marginBottom: 8 }}>
                  {total === 0 ? "暂无待复习内容" : "今日复习完成！"}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                  已掌握 {stats.mastered} 个知识点
                </div>
                {total > 0 && (
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={fetchDue}>
                    🔄 再来一轮
                  </button>
                )}
              </div>
            )}

            {/* Review Card */}
            {!loading && current && currentIndex < total && (
              <>
                <div style={{
                  background: "var(--bg-elevated)", borderRadius: 16,
                  border: "2px solid var(--border)", padding: "28px 24px",
                  textAlign: "center", boxShadow: "0 4px 20px rgba(139,92,246,0.06)",
                  minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "center",
                }}>
                  {/* Badge */}
                  <div style={{ marginBottom: 12 }}>
                    <span style={{
                      padding: "3px 12px", borderRadius: 12, fontSize: 11,
                      background: "rgba(139,92,246,0.1)", color: "#8b5cf6",
                    }}>
                      {current.node_type} · 第 {completed + 1}/{total} 个
                    </span>
                  </div>

                  {/* Name */}
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--primary)", marginBottom: 16, lineHeight: 1.4 }}>
                    {current.name}
                  </div>

                  {/* Definition */}
                  {current.definition && (
                    <div style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.7, padding: "0 8px" }}>
                      {current.definition}
                    </div>
                  )}

                  {/* Repetition info */}
                  <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-tertiary)" }}>
                    复习 {current.repetitions} 次 · 间隔 {current.interval_days} 天
                    {current.next_review_date && ` · 下次 ${current.next_review_date}`}
                  </div>
                </div>

                {/* Quality Buttons */}
                {!result && (
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    {QUALITY_BUTTONS.map((btn) => (
                      <button
                        key={btn.value}
                        onClick={() => handleQuality(btn.value)}
                        disabled={submitting}
                        style={{
                          flex: 1, padding: "12px 4px", borderRadius: 10,
                          border: `1px solid ${btn.color}30`, cursor: "pointer",
                          fontSize: 13, fontWeight: 600, background: btn.color + "12", color: btn.color,
                          transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{btn.emoji}</span>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Review Result */}
                {result && (
                  <div style={{
                    marginTop: 14, padding: "10px 16px", borderRadius: 10,
                    background: "rgba(139,92,246,0.08)", textAlign: "center",
                    fontSize: 13, color: "var(--text-secondary)", animation: "fadeInUp 0.3s",
                  }}>
                    已记录 ✨
                    {result.implicit_reviewed.length > 0 && (
                      <span style={{ marginLeft: 8, color: "var(--text-tertiary)", fontSize: 12 }}>
                        同时复习: {result.implicit_reviewed.map(n => n.name).join("、")}
                      </span>
                    )}
                  </div>
                )}
              </>
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
