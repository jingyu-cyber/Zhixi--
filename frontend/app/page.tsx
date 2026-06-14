"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LoginModal from "@/components/LoginModal";
import { useTheme } from "@/components/ThemeProvider";
import { UserInfo, authApi } from "@/lib/api";
import { readAuthSession, setAuthSession } from "@/lib/session";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showLogin, setShowLogin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState("");

  useEffect(() => {
    // Check if redirected due to session expiry
    if (typeof window !== "undefined" && sessionStorage.getItem("bilimind_session_expired") === "1") {
      sessionStorage.removeItem("bilimind_session_expired");
      setSessionExpiredMsg("会话已过期，请重新登录");
    }
    const { sessionId, userName } = readAuthSession();
    if (sessionId && userName) {
      router.replace("/workspace");
    } else {
      setChecking(false);
    }
  }, [router]);

  const onLogin = (sid: string, info: UserInfo) => {
    setShowLogin(false);
    setAuthSession(sid, info.uname);
    router.push("/workspace");
  };

  const onDemoLogin = async () => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const res = await authApi.loginAsDemo();
      setAuthSession(res.session_id, res.user_info.uname);
      router.push("/workspace");
    } catch (e: any) {
      setDemoLoading(false);
      setDemoError(e?.message || "演示账号登录失败，请稍后重试");
    }
  };

  // 检查登录状态时显示空白（避免首页闪烁）
  if (checking) return null;

  return (
    <div className="zhiying-landing">
      {/* Session expired toast */}
      {sessionExpiredMsg && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            background: "#ef4444",
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            animation: "fadeIn 0.3s ease",
          }}
          onClick={() => setSessionExpiredMsg("")}
        >
          ⚠ {sessionExpiredMsg}
        </div>
      )}
      {/* Topbar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid #f3f4f6",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#059669",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M12 3L2 9l10 6 10-6-10-6z" />
              <path d="M2 17l10 6 10-6" />
              <path d="M2 13l10 6 10-6" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#111827",
              letterSpacing: 0.5,
            }}
          >
            知映 ZhiYing
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={toggleTheme}
            className="btn-icon"
            title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setShowLogin(true)}
            className="btn btn-primary"
          >
            扫码登录
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="zhiying-hero">
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: 20,
            background: "rgba(5, 150, 105, 0.08)",
            color: "#059669",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 1,
            marginBottom: 20,
          }}
        >
          视频知识编译系统
        </div>
        <h1>
          把视频变成<br />
          <span className="highlight">可检索的知识库</span>
        </h1>
        <p>
          知映从你的 B 站收藏视频中自动抽取概念和论断，构建结构化知识图谱，
          让每一条观点都能追溯到视频中的具体时刻。
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className="zhiying-cta"
            onClick={() => setShowLogin(true)}
          >
            开始使用
          </button>
          <button
            onClick={onDemoLogin}
            disabled={demoLoading}
            style={{
              display: "inline-flex",
              padding: "12px 32px",
              border: "1px solid #059669",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 500,
              backgroundColor: "transparent",
              color: "#059669",
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {demoLoading ? "加载中..." : "演示账号"}
          </button>
          {demoError && (
            <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{demoError}</p>
          )}
          <Link
            href="/workspace"
            style={{
              display: "inline-flex",
              padding: "12px 32px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 500,
              color: "#374151",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            查看工作台
          </Link>
        </div>
      </div>

      {/* Feature cards */}
      <div className="zhiying-features">
        <div className="zhiying-feature-card">
          <div className="zhiying-feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
              <path d="M8 11h6M11 8v6" />
            </svg>
          </div>
          <h3>语义检索</h3>
          <p>
            跨视频语义搜索，快速定位知识点、证据片段和相关视频内容
          </p>
        </div>
        <div className="zhiying-feature-card">
          <div className="zhiying-feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.8"
            >
              <path d="M12 3L2 9l10 6 10-6-10-6z" />
              <path d="M2 17l10 6 10-6" />
              <path d="M2 13l10 6 10-6" />
            </svg>
          </div>
          <h3>知识编译</h3>
          <p>
            AI 自动从视频字幕中抽取概念、论断和证据，构建三级知识结构
          </p>
        </div>
        <div className="zhiying-feature-card">
          <div className="zhiying-feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.8"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              <path d="M8 9h8M8 13h4" />
            </svg>
          </div>
          <h3>证据问答</h3>
          <p>
            提出问题，AI 回答并标注每条论据的视频来源和时间戳，可一键跳转
          </p>
        </div>
        <div className="zhiying-feature-card">
          <div className="zhiying-feature-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
              <path d="M8 11h6M11 8v6" />
            </svg>
          </div>
          <h3>精准补洞</h3>
          <p>
            自动检测知识缺口，推荐最相关的视频片段填补空白
          </p>
        </div>
      </div>

      {/* Steps */}
      <h2 className="zhiying-section-title">四步完成知识编译</h2>
      <div className="zhiying-steps">
        {[
          { num: "1", title: "导入视频", desc: "从 B 站收藏夹导入视频" },
          { num: "2", title: "AI 编译", desc: "自动抽取概念和论断" },
          { num: "3", title: "证据问答", desc: "带引用的智能问答" },
          { num: "4", title: "精准补洞", desc: "发现并填补知识缺口" },
        ].map((step) => (
          <div key={step.num} className="zhiying-step">
            <div className="zhiying-step-num">{step.num}</div>
            <h4>{step.title}</h4>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "24px",
          fontSize: 12,
          color: "#9ca3af",
          borderTop: "1px solid #f3f4f6",
        }}
      >
        知映 ZhiYing &copy; 2026
      </footer>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={onLogin}
      />
    </div>
  );
}
