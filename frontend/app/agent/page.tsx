"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import NavSidebar from "@/components/NavSidebar";
import UserTopbar from "@/components/UserTopbar";
import { agentApi, AgentAnswer } from "@/lib/api";
import { useAuthSession } from "@/lib/session";

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "🔍 搜索知识库",
  get_concept: "📄 读取概念详情",
  get_evidence: "🔗 检索时间戳证据",
  list_prerequisites: "🧩 查询前置知识",
  generate_learning_path: "🧭 生成学习路径",
  vector_search: "🧠 语义向量检索",
};

const SAMPLES = [
  "Transformer 和注意力机制是什么关系？需要哪些前置知识？",
  "帮我规划一条学习「梯度下降」的路径",
  "我的知识库里关于正则化讲了哪些要点？",
];

export default function AgentPage() {
  const { sessionId } = useAuthSession();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query || loading) return;
    if (!sessionId) {
      setError("请先登录后再使用智能体（需要访问你的知识库）");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await agentApi.ask(query, sessionId);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "智能体执行失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand"><span className="brand-title">知溯</span></div>
        <div className="topbar-actions"><UserTopbar /></div>
      </header>
      <main className="app-main">
        <div className="app-with-nav">
          <NavSidebar />
          <div className="app-content" style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
            <h1 style={{ fontSize: 22, marginBottom: 4 }}>🤖 知识库智能体</h1>
            <p style={{ color: "var(--text-secondary)", marginTop: 0, fontSize: 14 }}>
              提出问题，智能体会自主调用工具检索你的知识库（搜索概念 · 读取详情 · 取证据 · 查前置 · 规划路径 · 语义检索），再给出带来源的回答。
            </p>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ask(question); }}
                placeholder="问问你的知识库…"
                aria-label="向智能体提问"
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--ink)", fontSize: 14 }}
              />
              <button className="btn btn-primary" disabled={loading} onClick={() => ask(question)}>
                {loading ? "思考中…" : "提问"}
              </button>
            </div>

            {!result && !loading && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SAMPLES.map((s) => (
                  <button key={s} onClick={() => { setQuestion(s); ask(s); }}
                    style={{ fontSize: 13, padding: "6px 12px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--ink-soft)", cursor: "pointer" }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="loading-state" style={{ marginTop: 24 }}>智能体正在检索知识库…</div>
            )}
            {error && (
              <div style={{ marginTop: 16, color: "var(--danger)", fontSize: 14 }}>⚠️ {error}</div>
            )}

            {result && (
              <div style={{ marginTop: 22 }}>
                {/* 工具调用轨迹 */}
                {result.steps.length > 0 && (
                  <details open style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", background: "var(--bg-sunken)" }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                      🛠 智能体执行轨迹（{result.steps.length} 步）
                    </summary>
                    <ol style={{ marginTop: 10, paddingLeft: 18, fontSize: 13, color: "var(--ink-soft)" }}>
                      {result.steps.map((s, i) => (
                        <li key={i} style={{ marginBottom: 8 }}>
                          <strong>{TOOL_LABELS[s.tool] || s.tool}</strong>
                          <code style={{ marginLeft: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
                            {JSON.stringify(s.args)}
                          </code>
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                            {s.result_preview}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}

                {/* 回答 */}
                <div className="markdown" style={{ lineHeight: 1.7 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown>
                </div>

                {/* 来源 */}
                {result.citations.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <h3 style={{ fontSize: 14, marginBottom: 8 }}>📎 来源</h3>
                    {result.citations.map((c) => {
                      const validBvid = /^BV[a-zA-Z0-9]{10}$/.test(c.bvid || "");
                      const t = Number(c.start_time);
                      const tParam = validBvid && Number.isFinite(t) && t >= 0 ? `?t=${Math.floor(t)}` : "";
                      return (
                      <div key={c.ref} style={{ fontSize: 13, marginBottom: 6, color: "var(--ink-soft)" }}>
                        <span style={{ color: "var(--primary)", fontWeight: 600 }}>[{c.ref}]</span>{" "}
                        {validBvid ? (
                          <a href={`https://www.bilibili.com/video/${c.bvid}${tParam}`}
                            target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                            {c.video_title || c.bvid}
                          </a>
                        ) : (c.video_title || c.concept || c.bvid)}
                        {c.time && <span style={{ color: "var(--text-tertiary)" }}> · {c.time}</span>}
                        {c.concept && <span style={{ color: "var(--text-tertiary)" }}> · {c.concept}</span>}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
