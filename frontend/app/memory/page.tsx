"use client";

import { useEffect, useState } from "react";
import NavSidebar from "@/components/NavSidebar";
import UserTopbar from "@/components/UserTopbar";
import MemoryDashboard from "@/components/MemoryDashboard";
import { useAuthSession } from "@/lib/session";

export default function MemoryPage() {
  const { sessionId } = useAuthSession();

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <div className="landing-logo" style={{ width: 32, height: 32 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3L2 9l10 6 10-6-10-6z" />
              <path d="M2 17l10 6 10-6" />
              <path d="M2 13l10 6 10-6" />
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, marginLeft: 8 }}>BiliMind</span>
        </div>
        <UserTopbar />
      </header>
      <main className="app-main">
        <div className="app-with-nav">
          <NavSidebar />
          <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>记忆系统</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: 14 }}>
              追踪你的知识点掌握情况，智能安排复习计划
            </p>
            {sessionId ? (
              <MemoryDashboard sessionId={sessionId} />
            ) : (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text-tertiary)" }}>
                <p>请先登录后查看记忆数据</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
