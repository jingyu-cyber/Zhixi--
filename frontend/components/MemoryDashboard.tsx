"use client";
import { useState, useEffect, useCallback } from "react";

const API_BASE = "/api/proxy/api/memory";

function fmt(sec: number): string {
  if (sec < 60) return sec + "秒";
  if (sec < 3600) return Math.round(sec/60) + "分钟";
  return (sec/3600).toFixed(1) + "小时";
}

interface MemoryStats {
  total_concepts: number;
  study_logs: number;
  tracked_videos: number;
  total_seconds: number;
  study_days: number;
}

export default function MemoryDashboard() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    const sid = localStorage.getItem("bilimind_session") || "demo_session";
    setLoading(true);
    Promise.all([
      fetch(API_BASE + "/stats?session_id=" + sid).then(r => r.json()),
      fetch(API_BASE + "/history?limit=30").then(r => r.json()),
    ])
      .then(([s, h]) => {
        setStats(s);
        setHistory(h.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const doSync = async () => {
    setSyncMsg("同步中...");
    try {
      const sid = localStorage.getItem("bilimind_session") || "demo_session";
      const r = await fetch(API_BASE + "/sync-from-knowledge?session_id=" + sid, { method: "POST" });
      const d = await r.json();
      setSyncMsg("已同步 " + d.synced + " 条");
      // Reload
      const sid2 = localStorage.getItem("bilimind_session") || "demo_session";
      const [s, h] = await Promise.all([
        fetch(API_BASE + "/stats?session_id=" + sid2).then(r => r.json()),
        fetch(API_BASE + "/history?limit=30").then(r => r.json()),
      ]);
      setStats(s);
      setHistory(h.items || []);
    } catch {
      setSyncMsg("失败");
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)" }}>加载记忆数据...</div>;
  }

  const card = {
    padding: "16px 20px",
    borderRadius: 10,
    background: "var(--card-bg, #1e293b)",
    border: "1px solid var(--border)",
    textAlign: "center" as const,
  };

  const items = [
    { v: stats?.total_concepts || 0, l: "知识点总数", c: "#34d399" },
    { v: stats?.study_logs || 0, l: "学习记录", c: "#60a5fa" },
    { v: fmt(stats?.total_seconds || 0), l: "累计学习", c: "#a78bfa" },
    { v: stats?.study_days || 0, l: "学习天数", c: "#fbbf24" },
    { v: stats?.tracked_videos || 0, l: "追踪视频", c: "#f87171" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        {items.map((i, k) => (
          <div key={k} style={card}>
            <div style={{ fontSize: 26, fontWeight: 700, color: i.c }}>{i.v}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{i.l}</div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <button
          onClick={doSync}
          style={{ padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "var(--accent,#059669)", color: "#fff" }}
        >
          同步知识库到记忆系统
        </button>
        {syncMsg ? <span style={{ marginLeft: 12, fontSize: 12, color: "var(--text-secondary)" }}>{syncMsg}</span> : null}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>最近学习记录</h3>
      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--card-bg)" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)" }}>知识点</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)" }}>视频来源</th>
              <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)" }}>时长</th>
              <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)" }}>日期</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 15).map((h, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>{(h.concept_name || "知识点").substring(0, 25)}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-secondary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(h.video_title || "").substring(0, 30)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "monospace" }}>{fmt(h.duration_seconds || 0)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 11 }}>{(h.created_at || "").substring(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center", marginTop: 12 }}>
        记忆系统自动追踪学习历史，编译视频后自动记录
      </p>
    </div>
  );
}
