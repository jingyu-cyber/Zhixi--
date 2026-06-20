"use client";

import { useState, useEffect, useCallback } from "react";

const API = typeof window !== "undefined" && window.location.hostname !== "localhost"
  ? "/api/proxy/api/memory"
  : "http://localhost:8000/api/memory";

export default function MemoryDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(API + "/stats?session_id=x");
      const data = await resp.json();
      setStats(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const resp = await fetch(API + "/sync-from-knowledge", { method: "POST" });
      const data = await resp.json();
      setSyncMsg("Synced " + data.synced + " items");
      loadData();
    } catch {
      setSyncMsg("Sync failed");
    }
    setSyncing(false);
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)", fontSize: 14 }}>Loading memory...</div>;
  }

  const cards = [
    { label: "Total Concepts", value: stats?.total_concepts || 0, color: "#059669" },
    { label: "Memory Items", value: stats?.memory_items || 0, color: "#3b82f6" },
    { label: "Mastery", value: (stats?.mastery_percent || 0) + "%", color: "#8b5cf6" },
    { label: "Videos", value: stats?.compiled_videos || 0, color: "#f59e0b" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ padding: 20, borderRadius: 12, background: "var(--card-bg, #fff)", border: "1px solid var(--border, #e5e7eb)", textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <button onClick={handleSync} disabled={syncing} style={{
          padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600, cursor: syncing ? "default" : "pointer",
          background: syncing ? "#9ca3af" : "#059669", color: "#fff"
        }}>
          {syncing ? "Syncing..." : "Sync Knowledge to Memory"}
        </button>
        {syncMsg ? <p style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>{syncMsg}</p> : null}
      </div>
      <div style={{ padding: 14, borderRadius: 8, background: "var(--card-bg, #fff)", border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
          The memory system tracks your mastery of knowledge concepts. 
          Sync to initialize from the knowledge tree ({stats?.total_edges || 0} connections).
        </p>
      </div>
    </div>
  );
}
