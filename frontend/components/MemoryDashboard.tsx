"use client";

import { useState, useEffect, useCallback } from "react";
import { memoryApi, MemoryStats, MemoryDecayCheck } from "@/lib/api";

export default function MemoryDashboard() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [decay, setDecay] = useState<MemoryDecayCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      memoryApi.getStats(),
      memoryApi.checkDecay(),
    ])
      .then(([s, d]) => { setStats(s); setDecay(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSync = () => {
    setSyncing(true);
    setSyncMsg("");
    memoryApi.syncFromKnowledge()
      .then((r) => setSyncMsg(`同步完成: 新增 ${r.created} 个记忆节点, 跳过 ${r.skipped} 个`))
      .catch((e) => setSyncMsg(`同步失败: ${e.message}`))
      .finally(() => { setSyncing(false); loadData(); });
  };

  if (loading) {
    return <div className="loading-state" style={{ padding: 20 }}>加载记忆数据中...</div>;
  }

  if (!stats || stats.total_nodes === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
        <h3 style={{ marginBottom: 8 }}>记忆系统未初始化</h3>
        <p style={{ color: "var(--text-tertiary)", marginBottom: 16, fontSize: 14 }}>
          需要先从已有知识库同步数据到记忆系统
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn btn-primary"
          style={{ padding: "8px 20px" }}
        >
          {syncing ? "同步中..." : "初始化记忆系统"}
        </button>
        {syncMsg && <p style={{ marginTop: 12, fontSize: 12, color: "var(--accent-green)" }}>{syncMsg}</p>}
      </div>
    );
  }

  const total = stats.total_nodes;
  const longPct = total > 0 ? Math.round(stats.long_term_count / total * 100) : 0;
  const shortPct = total > 0 ? Math.round(stats.short_term_count / total * 100) : 0;
  const workingPct = 100 - longPct - shortPct;

  const layerBars = [
    { label: "长期", count: stats.long_term_count, pct: longPct, color: "#6366f1", icon: "🧠" },
    { label: "短期", count: stats.short_term_count, pct: shortPct, color: "#94a3b8", icon: "📋" },
    { label: "工作", count: stats.working_count, pct: workingPct, color: "#22d3ee", icon: "⚡" },
  ];

  const typeBars = [
    { label: "语义", count: stats.semantic_count, color: "#8b5cf6" },
    { label: "情节", count: stats.episodic_count, color: "#f59e0b" },
    { label: "过程", count: stats.procedural_count, color: "#10b981" },
  ];

  const decayPct = decay && decay.total > 0
    ? Math.round(decay.stable_count / decay.total * 100)
    : 100;

  return (
    <div className="memory-dashboard" style={{ padding: "12px 16px", fontSize: 13 }}>
      {/* 操作栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>🧠 记忆系统</h3>
        <button onClick={handleSync} disabled={syncing}
          className="btn btn-sm btn-outline" style={{ fontSize: 12 }}>
          {syncing ? "同步中..." : "刷新同步"}
        </button>
      </div>
      {syncMsg && <p style={{ fontSize: 11, color: "var(--accent-green)", marginBottom: 8 }}>{syncMsg}</p>}

      {/* 总览 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div className="stat-badge" style={{ flex: 1, textAlign: "center", padding: 10, background: "var(--surface)", borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total_nodes}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>总记忆节点</div>
        </div>
        <div className="stat-badge" style={{ flex: 1, textAlign: "center", padding: 10, background: "var(--surface)", borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total_evidences}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>证据片段</div>
        </div>
        <div className="stat-badge" style={{ flex: 1, textAlign: "center", padding: 10, background: "var(--surface)", borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>{decay?.needs_review_count ?? 0}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>需复习</div>
        </div>
      </div>

      {/* 三层架构分布 */}
      <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>记忆层级分布</h4>
      <div style={{ marginBottom: 16 }}>
        {layerBars.map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 36, fontSize: 11 }}>{l.icon} {l.label}</span>
            <div style={{ flex: 1, height: 16, background: "var(--border-color)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                width: `${Math.max(l.pct, 2)}%`, height: "100%", background: l.color,
                borderRadius: 4, transition: "width 0.5s ease",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: "#fff", fontWeight: 600,
              }}>
                {l.count > 0 ? l.count : ""}
              </div>
            </div>
            <span style={{ fontSize: 11, width: 36, textAlign: "right", color: "var(--text-tertiary)" }}>{l.pct}%</span>
          </div>
        ))}
      </div>

      {/* 记忆类型分布 */}
      <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>记忆类型</h4>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {typeBars.map((t) => (
          <div key={t.label} style={{
            flex: 1, textAlign: "center", padding: "6px 4px",
            background: `${t.color}15`, borderRadius: 6, border: `1px solid ${t.color}40`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{t.count}</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* 记忆健康度 */}
      <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>记忆健康度</h4>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
          <span>稳定记忆</span>
          <span style={{ color: "var(--accent-green)" }}>{decayPct}%</span>
        </div>
        <div style={{ height: 8, background: "var(--border-color)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            width: `${decayPct}%`, height: "100%",
            background: decayPct >= 80 ? "#22c55e" : decayPct >= 50 ? "#f59e0b" : "#ef4444",
            borderRadius: 4, transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 16 }}>
        <span>强度 (长期): <strong>{Math.round(stats.avg_strength_long_term * 100)}%</strong></span>
        <span>强度 (短期): <strong>{Math.round(stats.avg_strength_short_term * 100)}%</strong></span>
      </div>

      {/* 需复习列表 */}
      {decay && decay.needs_review.length > 0 && (
        <>
          <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#f59e0b" }}>
            ⚠ 需要复习 ({decay.needs_review_count})
          </h4>
          <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 11 }}>
            {decay.needs_review.slice(0, 15).map((item) => (
              <div key={item.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 8px", marginBottom: 2, borderRadius: 4,
                background: "var(--surface-hover, #f8fafc)",
              }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name}
                </span>
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 600,
                  color: item.strength < 0.2 ? "#ef4444" : "#f59e0b",
                }}>
                  {Math.round(item.strength * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 已遗忘列表 */}
      {decay && decay.forgotten.length > 0 && (
        <>
          <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#ef4444", marginTop: 12 }}>
            💀 已遗忘 ({decay.forgotten_count})
          </h4>
          <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 10, opacity: 0.7 }}>
            {decay.forgotten.slice(0, 10).map((item) => (
              <div key={item.id} style={{
                padding: "2px 8px", marginBottom: 1,
                textDecoration: "line-through", color: "var(--text-tertiary)",
              }}>
                {item.name} ({Math.round(item.strength * 100)}%)
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
