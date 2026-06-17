"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NavSidebar from "@/components/NavSidebar";
import UserTopbar from "@/components/UserTopbar";

import { API_BASE_URL, getSessionId } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceReady, setVoiceReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);



  // 客户端初始化：读取 localStorage、创建音频、解锁自动播放
  useEffect(() => {
    // 读取语音开关状态
    const saved = localStorage.getItem("voice_on");
    if (saved === "false") setVoiceOn(false);
    setVoiceReady(true);

    // 创建音频元素
    const audio = new Audio();
    audio.volume = 1.0;
    audio.preload = "auto";
    audioRef.current = audio;

    // 首次用户交互时解锁 Audio（Chrome 自动播放策略）
    const unlock = () => {
      audio.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6urq6urq6urq6urq6urq6urq6urq6urq6v////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFN//MUZAMAAAGkAAAAAAAAA0gAAAAART///MUZAYAAAGkAAAAAAAAA0gAAAAAOTku//MUZAYAAAGkAAAAAAAAA0gAAAAANVVV";
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);

    return () => {
      audio.pause();
      audioRef.current = null;
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem("voice_on", String(next));
    if (!next) {
      audioRef.current?.pause();
      setSpeaking(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 使用后端 edge-tts 甜美女声 (晓伊 Xiaoyi)
  const speakText = async (text: string) => {
    if (!voiceOn || !text) return;
    const cleanText = text.slice(0, 500).trim();
    if (!cleanText) return;

    try {
      setSpeaking(true);

      // 使用与 API 一致的路径（本地直连，外部走 Next.js 代理）
      const ttsBase = API_BASE_URL;
      const ttsUrl = `${ttsBase}/tts/speak?text=${encodeURIComponent(cleanText)}&voice=zh-CN-XiaoyiNeural`;
      const resp = await fetch(ttsUrl);
      if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);

      const blob = await resp.blob();
      if (blob.size === 0) throw new Error('TTS returned empty audio');

      // 创建 Blob URL 播放
      const blobUrl = URL.createObjectURL(blob);

      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.volume = 1.0;
      }
      const audio = audioRef.current;
      audio.pause();
      audio.src = blobUrl;
      audio.load();

      await new Promise<void>((resolve, reject) => {
        const onEnd = () => {
          URL.revokeObjectURL(blobUrl);
          setSpeaking(false);
          resolve();
        };
        const onErr = (e: ErrorEvent | Event) => {
          URL.revokeObjectURL(blobUrl);
          setSpeaking(false);
          reject(e);
        };
        audio.addEventListener('ended', onEnd, { once: true });
        audio.addEventListener('error', onErr, { once: true });
        audio.play().catch(reject);
      });
    } catch (e) {
      console.warn('[TTS] edge-tts 失败，回退浏览器 TTS', e);
      setSpeaking(false);
      fallbackSpeak(cleanText);
    }
  };

  // 浏览器 TTS 回退方案
  const fallbackSpeak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 500));
    u.lang = "zh-CN";
    u.rate = 1.0;
    u.pitch = 1.4;
    // 尝试找甜美女声
    const voices = window.speechSynthesis.getVoices();
    const sweet = voices.find(v => v.name.includes('Yaoyao') && v.lang.startsWith('zh'))
      || voices.find(v => v.name.includes('Huihui') && v.lang.startsWith('zh'))
      || voices.find(v => v.lang.startsWith('zh-CN') && v.name.toLowerCase().includes('female'))
      || voices.find(v => v.lang.startsWith('zh'));
    if (sweet) u.voice = sweet;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const send = useCallback(async (text?: string) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    const uid = Date.now().toString();
    const aid = (Date.now() + 1).toString();
    setMessages(p => [...p, { id: uid, role: "user", content: q }, { id: aid, role: "assistant", content: "" }]);
    setLoading(true);

    try {
      const sid = getSessionId();
      const resp = await fetch(`${API_BASE_URL}/chat/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, session_id: sid }),
      });
      if (!resp.ok || !resp.body) throw new Error("fail");
      const reader = resp.body.getReader();
      const dec = new TextDecoder("utf-8");
      let buf = "";
      const marker = "[[SOURCES_JSON]]";
      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          const chunk = dec.decode(value, { stream: !done });
          const mi = chunk.indexOf(marker);
          if (mi !== -1) { buf += chunk.slice(0, mi); break; }
          buf += chunk;
          setMessages(p => p.map(m => m.id === aid ? { ...m, content: buf } : m));
        }
        if (done) break;
      }
      speakText(buf);
    } catch {
      setMessages(p => p.map(m => m.id === aid ? { ...m, content: "抱歉，小映暂时无法回答~ 💚" } : m));
    }
    setLoading(false);
  }, [input, loading]);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <div className="landing-logo" style={{ width: 32, height: 32 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3L2 9l10 6 10-6-10-6z" /><path d="M2 17l10 6 10-6" /><path d="M2 13l10 6 10-6" />
            </svg>
          </div>
          <div>
            <span className="brand-title">知映 ZhiYing</span>
            <span className="brand-subtitle">AI 对话</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button onClick={toggleVoice} className="btn-icon" title={voiceOn ? "关闭语音" : "开启语音"} style={{ marginRight: 4, opacity: voiceOn ? 1 : 0.5 }}>
            {voiceOn ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>
          <UserTopbar />
        </div>
      </header>

      <main className="app-main">
        <div className="app-with-nav">
          <NavSidebar />
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* 左侧：Live2D 看板娘展示区 */}
            <div style={{
              width: "40%", minWidth: 280, maxWidth: 420,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--bg-sunken)", borderRight: "1px solid var(--border)",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                textAlign: "center",
                background: "radial-gradient(ellipse at center, rgba(52,211,153,0.08) 0%, transparent 70%)",
                padding: 40, borderRadius: 24,
              }}>
                <div style={{ width: 200, height: 200, margin: "0 auto", position: "relative" }}>
                  <svg viewBox="0 0 120 120" fill="none" style={{ width: "100%", height: "100%" }}>
                    {/* 牡丹花图标 — 中国风 */}
                    <circle cx="60" cy="60" r="50" fill="#2d1b3d" stroke="#C12C3C" strokeWidth="2"/>
                    {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                      <g key={i} transform={`rotate(${angle} 60 60)`}>
                        <ellipse cx="60" cy="25" rx="8" ry="18" fill="#E84855" opacity="0.7" transform="rotate(-20 60 25)" />
                        <ellipse cx="60" cy="25" rx="8" ry="18" fill="#DC143C" opacity="0.5" transform="rotate(15 60 25)" />
                      </g>
                    ))}
                    <circle cx="60" cy="60" r="12" fill="#FFE4B5" opacity="0.8" />
                    <circle cx="60" cy="60" r="6" fill="#FFD700" opacity="0.6" />
                    <text x="60" y="105" textAnchor="middle" fill="#DB7093" fontSize="11" fontWeight="bold">小映</text>
                  </svg>
                </div>
                <p style={{ marginTop: 16, color: "var(--text-secondary)", fontSize: 13 }}>
                  {speaking ? "小映正在说话..." : loading ? "小映思考中..." : "我是你的知识助手，有问题随时问我"}
                </p>
              </div>
            </div>

            {/* 右侧：对话区 */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{
                flex: 1, overflowY: "auto", padding: "16px 20px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🌸</div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>こんにちは！我是小映</p>
                    <p style={{ fontSize: 13, marginBottom: 16 }}>你的私人 AI 知识助手，随时问我收藏视频的任何问题~</p>
                    <div style={{ display: "grid", gap: 6, maxWidth: 320, margin: "0 auto" }}>
                      {[
                        { emoji: "📝", text: "帮我总结收藏夹里的重点知识", q: "帮我总结一下收藏夹里的重点知识" },
                        { emoji: "📖", text: "最近有什么值得复习的内容？", q: "最近有什么值得复习的内容？" },
                        { emoji: "🗺️", text: "给我推荐一个学习路径", q: "给我推荐一个学习路径" },
                        { emoji: "👋", text: "你好小映，介绍一下你自己吧", q: "你好小映，介绍一下你自己吧" },
                      ].map((s, i) => (
                        <button key={i} onClick={() => send(s.q)} style={{
                          textAlign: "left", padding: "8px 14px", borderRadius: 10,
                          background: "var(--bg-elevated)", border: "1px solid var(--border)",
                          color: "var(--ink-soft)", fontSize: 13, cursor: "pointer",
                          transition: "all 0.15s",
                        }}>{s.emoji} {s.text}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map(m => (
                  <div key={m.id} style={{
                    padding: "8px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.6,
                    maxWidth: "80%", wordBreak: "break-word",
                    ...(m.role === "user" ? {
                      background: "var(--primary)", color: "#fff",
                      alignSelf: "flex-end", borderBottomRightRadius: 4,
                    } : {
                      background: "var(--bg-sunken)", color: "var(--ink)",
                      alignSelf: "flex-start", borderBottomLeftRadius: 4,
                      border: "1px solid var(--border-light)",
                    }),
                  }}>
                    {m.content || (m.role === "assistant" && loading ? "..." : "")}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div style={{
                padding: "10px 16px", borderTop: "1px solid var(--border)",
                display: "flex", gap: 8,
              }}>
                <input
                  style={{
                    flex: 1, padding: "8px 14px", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--bg-elevated)",
                    color: "var(--ink)", fontSize: 14, outline: "none",
                  }}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="输入问题..."
                  id="ai-chat-input"
                  name="ai-chat-input"
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none",
                    background: "var(--primary)", color: "#fff", fontWeight: 600,
                    cursor: "pointer", opacity: !input.trim() || loading ? 0.5 : 1,
                  }}
                >发送</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
