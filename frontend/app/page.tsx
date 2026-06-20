"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LoginModal from "@/components/LoginModal";
import { useTheme } from "@/components/ThemeProvider";
import { UserInfo, authApi } from "@/lib/api";
import { readAuthSession, setAuthSession } from "@/lib/session";

/* ==================== 动态粒子背景 ==================== */
/* ==================== Feature Icon ==================== */
function FeatureIcon({ name, color }: { name: string; color: string }) {
  const size = 22;
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8 };
  switch (name) {
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>;
    case "compile": return <svg {...props}><path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/></svg>;
    case "chat": return <svg {...props}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 9h8M8 13h4"/></svg>;
    case "target": return <svg {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="9"/></svg>;
  }
}

function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 1,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.4 + 0.1,
    }));

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(5, 150, 105, ${p.opacity})`;
        ctx.fill();

        // 连线
        particles.forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(5, 150, 105, ${0.03 * (1 - dist / 150)})`;
            ctx.stroke();
          }
        });
      });
      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

export default function Home() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showLogin, setShowLogin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState("");

  useEffect(() => {
    const init = async () => {
      // Check if redirected due to session expiry
      if (typeof window !== "undefined" && sessionStorage.getItem("bilimind_session_expired") === "1") {
        sessionStorage.removeItem("bilimind_session_expired");
        setSessionExpiredMsg("会话已过期，请重新登录");
      }
      const { sessionId, userName } = readAuthSession();
      if (sessionId && userName) {
        // Verify session is still valid on backend
        try {
          const res = await authApi.getSession(sessionId);
          if (res.valid) {
            // Session valid - auto redirect
            const referrer = typeof document !== "undefined" ? document.referrer : "";
            const isInternalNav = referrer && new URL(referrer).host === window.location.host;
            if (isInternalNav) {
              setChecking(false);
            } else {
              router.replace("/workspace");
            }
            return;
          }
        } catch {
          // Session invalid, try demo auto-login if remember_me was set
        }
        // Session expired - try auto demo login
        const rememberMe = typeof window !== "undefined" ? localStorage.getItem("bilimind_remember") : null;
        if (rememberMe === "1") {
          try {
            const res = await authApi.loginAsDemo();
            setAuthSession(res.session_id, res.user_info.uname);
            localStorage.setItem("bilimind_remember", "1");
            router.replace("/workspace");
            return;
          } catch {
            // Demo login failed, show home page
          }
        }
      }
      setChecking(false);
    };
    init();
  }, [router]);

  const onLogin = (sid: string, info: UserInfo) => {
    setShowLogin(false);
    setAuthSession(sid, info.uname);
    // 记住登录状态
    if (typeof window !== "undefined") {
      localStorage.setItem("bilimind_remember", "1");
    }
    setAuthSession(sid, info.uname);
    router.push("/workspace");
  };

  const onDemoLogin = async () => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const res = await authApi.loginAsDemo();
      setAuthSession(res.session_id, res.user_info.uname);
      // 记住登录状态
      if (typeof window !== "undefined") {
        localStorage.setItem("bilimind_remember", "1");
      }
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
      {/* 视频背景 */}
      <div className="landing-video-bg">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src="/background.mp4"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
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
          borderBottom: "1px solid var(--border-color, #f3f4f6)",
          background: "var(--bg-elevated, rgba(255,255,255,0.8))",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #059669, #06b6d4)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(5, 150, 105, 0.35)",
              animation: "brand-shimmer 4s ease-in-out infinite",
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
              color: "var(--ink)",
              letterSpacing: 0.5,
            }}
          >
            知析 ZhiXi
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
            padding: "6px 18px",
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(5, 150, 105, 0.1), rgba(6, 182, 212, 0.08))",
            color: "#059669",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 1,
            marginBottom: 20,
            border: "1px solid rgba(5, 150, 105, 0.15)",
            boxShadow: "0 0 20px rgba(5, 150, 105, 0.06)",
          }}
        >
          ✦ 视频知识编译系统
        </div>
        <h1>
          把视频变成<br />
          <span className="highlight">可检索的知识库</span>
        </h1>
        <p>
          知析从你的 B 站收藏视频中自动抽取概念和论断，构建结构化知识图谱，
          让每一条观点都能追溯到视频中的具体时刻。
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className="zhiying-cta"
            onClick={() => router.push("/workspace")}
          >
            开始使用
          </button>
          <button
            onClick={onDemoLogin}
            disabled={demoLoading}
            className="glow-border"
            style={{
              display: "inline-flex",
              padding: "12px 32px",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 500,
              backgroundColor: "transparent",
              color: "var(--primary)",
              cursor: "pointer",
              transition: "all 0.25s",
              whiteSpace: "nowrap",
            }}
          >
            {demoLoading ? "加载中..." : "演示账号"}
          </button>
          <Link
            href="/workspace"
            style={{
              display: "inline-flex",
              padding: "12px 32px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 500,
              color: "var(--ink-soft)",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            工作台
          </Link>
          {demoError && (
            <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{demoError}</p>
          )}
        </div>
      </div>

      {/* Feature cards */}
      <div className="zhiying-features">
        {[
          { icon: "search", title: "语义检索", desc: "跨视频语义搜索，快速定位知识点、证据片段和相关视频内容", color: "#059669" },
          { icon: "compile", title: "知识编译", desc: "AI 自动从视频字幕中抽取概念、论断和证据，构建三级知识结构", color: "#3b82f6" },
          { icon: "chat", title: "证据问答", desc: "AI 回答并标注每条论据的视频来源和时间戳，可一键跳转", color: "#8b5cf6" },
          { icon: "target", title: "精准补洞", desc: "自动检测知识缺口，推荐最相关的视频片段填补空白", color: "#f59e0b" },
        ].map((card) => (
          <div key={card.title} className="zhiying-feature-card glow-border">
            <div
              className="zhiying-feature-icon"
              style={{
                background: `${card.color}15`,
                boxShadow: `0 0 20px ${card.color}20`,
              }}
            >
              <FeatureIcon name={card.icon} color={card.color} />
            </div>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Steps */}
      <h2 className="zhiying-section-title">四步完成知识编译</h2>
      <div className="zhiying-steps">
        {[
          { num: "1", title: "导入视频", desc: "从 B 站收藏夹导入视频", color: "#059669" },
          { num: "2", title: "AI 编译", desc: "自动抽取概念和论断", color: "#3b82f6" },
          { num: "3", title: "证据问答", desc: "带引用的智能问答", color: "#8b5cf6" },
          { num: "4", title: "精准补洞", desc: "发现并填补知识缺口", color: "#f59e0b" },
        ].map((step) => (
          <div key={step.num} className="zhiying-step">
            <div
              className="zhiying-step-num"
              style={{
                background: `${step.color}18`,
                color: step.color,
                boxShadow: `0 0 16px ${step.color}30`,
              }}
            >
              {step.num}
            </div>
            <h4>{step.title}</h4>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "32px 24px",
          fontSize: 13,
          color: "var(--ink-soft)",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          backdropFilter: "blur(8px)",
        }}
      >
        <p>知析 ZhiXi &copy; 2026</p>
        <p style={{ marginTop: 4, fontSize: 11 }}>个人视频知识导航系统 · 把视频变成可检索的知识库</p>
      </footer>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={onLogin}
      />
    </div>
  );
}
