"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import NavSidebar from "@/components/NavSidebar";
import UserTopbar from "@/components/UserTopbar";
import KnowledgeTimeline from "@/components/KnowledgeTimeline";
import ConceptClaimList from "@/components/ConceptClaimList";
import EvidenceChat from "@/components/EvidenceChat";
import VideoPlayer from "@/components/VideoPlayer";
import {
  favoritesApi,
  compileApi,
  knowledgeApi,
  FavoriteFolder,
  CompileResult,
  VideoPageInfo,
} from "@/lib/api";
import { isActiveSession, useAuthSession } from "@/lib/session";
import dynamic from "next/dynamic";

const KnowledgeMap = dynamic(() => import("@/components/KnowledgeMap"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
      加载思维导图组件...
    </div>
  ),
});

type TabKey = "video" | "timeline" | "map" | "claims";

interface VideoItem {
  bvid: string;
  title: string;
  duration?: number;
  owner?: string;
  compiled?: boolean;
  content_category?: string;
  series_name?: string;
  series_key?: string;
  series_position?: number;
  pages_count?: number;
}

export default function WorkspacePage() {
  const { sessionId, scopeKey } = useAuthSession();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedBvid, setSelectedBvid] = useState<string | null>(null);
  const [selectedCid, setSelectedCid] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("video");
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState<string | null>(null);
  const [compileProgress, setCompileProgress] = useState(0);
  const [loadingResult, setLoadingResult] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [batchBuilding, setBatchBuilding] = useState(false);
  const [batchTaskId, setBatchTaskId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState(0);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [videoLoadError, setVideoLoadError] = useState("");
  const [compileError, setCompileError] = useState("");
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [coursePages, setCoursePages] = useState<Record<string, VideoPageInfo[]>>({});
  const [loadingPages, setLoadingPages] = useState<Set<string>>(new Set());
  const listRequestIdRef = useRef(0);
  const resultRequestIdRef = useRef(0);
  const compilePollIdRef = useRef(0);
  const batchPollRef = useRef(0);

  const toggleCourseExpand = async (bvid: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(bvid)) {
      newExpanded.delete(bvid);
      setExpandedCourses(newExpanded);
      return;
    }
    newExpanded.add(bvid);
    setExpandedCourses(newExpanded);
    // 懒加载分集列表
    if (!coursePages[bvid]) {
      setLoadingPages((prev) => new Set(prev).add(bvid));
      try {
        const resp = await compileApi.getVideoPages(bvid);
        setCoursePages((prev) => ({ ...prev, [bvid]: resp.pages }));
      } catch {
        // ignore
      } finally {
        setLoadingPages((prev) => {
          const next = new Set(prev);
          next.delete(bvid);
          return next;
        });
      }
    }
  };

  useEffect(() => {
    setVideos([]);
    setSelectedBvid(null);
    setSelectedCid(null);
    setCompileResult(null);
    setCompiling(null);
    setCompileProgress(0);
    setLoadingResult(false);
    setLoadingVideos(!!sessionId);
  }, [sessionId, scopeKey]);

  // 请求浏览器通知权限
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Load videos from favorites
  useEffect(() => {
    if (!sessionId) {
      setLoadingVideos(false);
      return;
    }
    const requestId = ++listRequestIdRef.current;
    const activeSessionId = sessionId;

    favoritesApi
      .getList(sessionId)
      .then(async (folders: FavoriteFolder[]) => {
        const allVideos: VideoItem[] = [];
        // Load from all selected/default folders
        const targetFolders = folders
          .filter((f) => f.is_selected || f.is_default);

        for (const folder of targetFolders) {
          try {
            // Load all pages
            let page = 1;
            let hasMore = true;
            while (hasMore) {
              const resp = await favoritesApi.getVideos(folder.media_id, sessionId, page);
              for (const v of resp.videos) {
                if (!allVideos.find((av) => av.bvid === v.bvid)) {
                  allVideos.push({
                    bvid: v.bvid,
                    title: v.title,
                    duration: v.duration,
                    owner: v.owner,
                    content_category: (v as any).content_category,
                    series_name: (v as any).series_name,
                    series_key: (v as any).series_key,
                    series_position: (v as any).series_position,
                    pages_count: (v as any).pages_count,
                  });
                }
              }
              hasMore = resp.has_more;
              page++;
            }
          } catch {
            // Skip failed folders
          }
        }
        if (listRequestIdRef.current === requestId) {
          setVideos(allVideos);
        }
      })
      .catch((err) => {
        if (listRequestIdRef.current === requestId) {
          setVideos([]);
          setVideoLoadError(err?.message || String(err) || "视频列表加载失败");
        }
      })
      .finally(() => {
        if (listRequestIdRef.current === requestId) {
          setLoadingVideos(false);
        }
      });
  }, [sessionId, scopeKey]);

  // Fetch compile result when video selected
  const fetchResult = useCallback(async (bvid: string, pageCid?: number | null, activeSessionId?: string | null) => {
    const sid = activeSessionId || sessionId;
    if (!sid) {
      setCompileResult(null);
      setLoadingResult(false);
      return;
    }
    const requestId = ++resultRequestIdRef.current;
    setLoadingResult(true);
    try {
      const result = await compileApi.getResult(bvid, pageCid ?? undefined);
      if (resultRequestIdRef.current === requestId && isActiveSession(sid)) {
        setCompileResult(result);
      }
    } catch {
      if (resultRequestIdRef.current === requestId && isActiveSession(sid)) {
        setCompileResult(null);
      }
    }
    if (resultRequestIdRef.current === requestId && isActiveSession(sid)) {
      setLoadingResult(false);
    }
  }, [sessionId]);

  const handleSelectVideo = (bvid: string, pageCid?: number | null) => {
    setSelectedBvid(bvid);
    setSelectedCid(pageCid ?? null);
    setCompileResult(null);
    void fetchResult(bvid, pageCid, sessionId);
  };

  // Compile video (supports per-page cid)
  const handleCompile = async (bvid: string, cid?: number, pageTitle?: string) => {
    if (!sessionId) {
      setCompileError("会话已过期，请刷新页面重新登录");
      return;
    }
    setCompileError("");

    const compileKey = cid ? `${bvid}_p${cid}` : bvid;
    setCompiling(compileKey);
    setCompileProgress(0);
    try {
      const { task_id } = await compileApi.compileVideo(bvid, sessionId, cid, pageTitle);
      const pollId = ++compilePollIdRef.current;
      const activeSessionId = sessionId;

      // Poll for status
      const poll = async () => {
        try {
          const status = await compileApi.getStatus(task_id, activeSessionId);
          if (compilePollIdRef.current !== pollId || !isActiveSession(activeSessionId)) {
            return;
          }
          setCompileProgress(status.progress);

          if (status.status === "completed") {
            setCompiling(null);
            setCompileProgress(1);
            // 浏览器通知
            if ("Notification" in window && Notification.permission === "granted") {
              try { new Notification("知识编译完成", { body: `视频 ${bvid} 编译成功`, icon: "/favicon.ico" }); } catch {}
            }
            // 清理 localStorage 中的编译任务
            try { localStorage.removeItem(`bilimind_compile_${bvid}`); } catch {}
            if (selectedBvid === bvid) {
              void fetchResult(bvid, cid, activeSessionId);
            }
          } else if (status.status === "failed") {
            setCompiling(null);
            if ("Notification" in window && Notification.permission === "granted") {
              try { new Notification("编译失败", { body: `视频 ${bvid} 编译失败: ${status.message}`, icon: "/favicon.ico" }); } catch {}
            }
            try { localStorage.removeItem(`bilimind_compile_${bvid}`); } catch {}
          } else {
            setTimeout(poll, 2000);
          }
        } catch (e: any) {
          if (compilePollIdRef.current === pollId && isActiveSession(activeSessionId)) {
            setCompiling(null);
            setCompileError(e?.message || "编译失败，请重试");
          }
        }
      };
      setTimeout(poll, 2000);
    } catch (e: any) {
      setCompiling(null);
      setCompileError(e?.message || "启动编译失败，请检查网络或重新登录");
    }
  };

  // Batch compile all videos
  const handleBatchCompile = async () => {
    if (!sessionId || batchBuilding) return;
    setBatchBuilding(true);
    setBatchProgress(0);
    setBatchMessage("正在启动批量编译...");
    try {
      const { task_id } = await knowledgeApi.build(
        { folder_ids: [], exclude_bvids: [] },
        sessionId
      );
      setBatchTaskId(task_id);
      const activeSessionId = sessionId;

      const poll = () => {
        const pollId = ++batchPollRef.current;
        const doPoll = async () => {
          try {
            const status = await knowledgeApi.getBuildStatus(task_id, activeSessionId);
            if (batchPollRef.current !== pollId || !isActiveSession(activeSessionId)) return;
            setBatchProgress(status.progress || 0);
            setBatchMessage(
              status.current_step ||
              `编译中: ${status.processed_videos || 0}/${status.total_videos || "?"} 视频`
            );
            if (status.status === "completed") {
              setBatchBuilding(false);
              setBatchMessage("批量编译完成！刷新页面查看结果");
              // Reload video list
              window.location.reload();
            } else if (status.status === "failed") {
              setBatchBuilding(false);
              setBatchMessage("批量编译失败，请重试");
            } else {
              setTimeout(doPoll, 3000);
            }
          } catch {
            if (batchPollRef.current === pollId && isActiveSession(activeSessionId)) {
              setBatchBuilding(false);
              setBatchMessage("状态查询失败，请检查编译进度");
            }
          }
        };
        setTimeout(doPoll, 3000);
      };
      poll();
    } catch {
      setBatchBuilding(false);
      setBatchMessage("启动批量编译失败，请确保已同步收藏夹");
    }
  };

  const formatDuration = (d?: number) => {
    if (!d) return "";
    const m = Math.floor(d / 60);
    const s = d % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "timeline", label: "时间轴" },
    { key: "map", label: "知识图" },
    { key: "claims", label: "论断" },
  ];

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <div
            className="landing-logo"
            style={{ width: 32, height: 32 }}
          >
            <svg
              width="18"
              height="18"
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
          <div>
            <span className="brand-title">知析 ZhiXi</span>
            <span className="brand-subtitle">知识工作台</span>
          </div>
        </div>
        <div className="topbar-actions">
          {compileResult && (
            <div className="topbar-stats">
              <span className="topbar-stat">
                <strong>{compileResult.stats.concept_count}</strong> 概念
              </span>
              <span className="topbar-stat">
                <strong>{compileResult.stats.claim_count}</strong> 论断
              </span>
              <span className="topbar-stat">
                <strong>{compileResult.stats.peak_count}</strong> 密集段
              </span>
            </div>
          )}
          <UserTopbar />
        </div>
      </header>

      <main className="app-main">
        <div className="app-with-nav">
          <NavSidebar />
          <div className="workspace-layout">
            {/* Left: Video sidebar */}
            <div className="workspace-sidebar">
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 12,
                  padding: "0 4px",
                }}
              >
                视频列表
              </div>

              {/* Batch compile button */}
              {videos.length > 0 && (
                <div style={{ marginBottom: 12, padding: "0 4px" }}>
                  <button
                    className="compile-btn"
                    onClick={handleBatchCompile}
                    disabled={batchBuilding}
                    style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
                  >
                    {batchBuilding
                      ? `批量编译中... ${Math.round(batchProgress * 100)}%`
                      : "🚀 批量编译全部视频"}
                  </button>
                  {batchBuilding && (
                    <>
                      <div className="progress" style={{ marginTop: 6 }}>
                        <div
                          className="progress-bar"
                          style={{ width: `${batchProgress * 100}%` }}
                        />
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, textAlign: "center" }}>
                        {batchMessage}
                      </p>
                    </>
                  )}
                </div>
              )}

              {loadingVideos ? (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-tertiary)", fontSize: 13 }}>
                  <div className="placeholder-spinner" style={{ margin: "0 auto 8px" }} />
                  加载中...
                </div>
              ) : videos.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-tertiary)", fontSize: 13 }}>
                  {videoLoadError ? (
                    <>
                      <p style={{ color: "var(--danger)", marginBottom: 8 }}>加载失败</p>
                      <p style={{ fontSize: 12, marginBottom: 12 }}>{videoLoadError}</p>
                      <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>重新加载</button>
                    </>
                  ) : (
                    <>
                      <p>暂无视频</p>
                      <p style={{ marginTop: 4, fontSize: 12 }}>请先在收藏夹中添加视频</p>
                    </>
                  )}
                </div>
              ) : (
                videos.map((v) => {
                  const isCourse = v.content_category === "course";
                  const isExpanded = expandedCourses.has(v.bvid);
                  const isLoadingPages = loadingPages.has(v.bvid);
                  const pages = coursePages[v.bvid] || [];

                  return (
                    <div key={v.bvid}>
                      {/* 课程标题 — 可展开 */}
                      <div
                        className={`video-sidebar-item ${selectedBvid === v.bvid && !isCourse ? "selected" : ""} ${isCourse ? "course-header" : ""}`}
                        onClick={() => {
                          if (isCourse) {
                            toggleCourseExpand(v.bvid);
                          } else {
                            handleSelectVideo(v.bvid);
                          }
                        }}
                      >
                        <div className="video-sidebar-title">
                          {isCourse && (
                            <span className="course-expand-arrow">
                              {isExpanded ? "▼" : "▶"}
                            </span>
                          )}
                          <span className={`video-badge ${isCourse ? "video-badge-course" : ""}`}>
                            {isCourse ? "📚 课程" : ""}
                          </span>
                          {isCourse && (
                            <span className="course-page-count">
                              {v.pages_count ? `${v.pages_count}集` : "多集"}
                            </span>
                          )}
                          {v.title}
                        </div>
                        <div className="video-sidebar-meta">
                          {v.owner && <span>{v.owner}</span>}
                          {v.duration && (
                            <span style={{ marginLeft: 6 }}>{formatDuration(v.duration)}</span>
                          )}
                          {isCourse && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                              ▶ 点击展开单集编译
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 课程展开的分集列表 */}
                      {isCourse && isExpanded && (
                        <div className="course-pages-container">
                          {isLoadingPages ? (
                            <div className="course-pages-loading" style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-tertiary)" }}>
                              加载分集列表...
                            </div>
                          ) : pages.length > 0 ? (
                            pages.map((page) => {
                              const pageKey = `${v.bvid}_p${page.cid}`;
                              const isCompiling = compiling === pageKey;
                              return (
                                <div key={pageKey} className="course-page-item">
                                  <div
                                    className={`video-sidebar-item video-sidebar-child ${selectedBvid === v.bvid && selectedCid === page.cid ? "selected" : ""}`}
                                    onClick={() => handleSelectVideo(v.bvid, page.cid)}
                                  >
                                    <div className="video-sidebar-title">
                                      <span className="video-episode-badge">
                                        第{page.page}集
                                      </span>
                                      {page.part}
                                    </div>
                                    <div className="video-sidebar-meta">
                                      {page.duration > 0 && (
                                        <span>{formatDuration(page.duration)}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ padding: "4px 12px 4px 24px" }}>
                                    <button
                                      className="compile-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCompile(v.bvid, page.cid, page.part);
                                      }}
                                      disabled={isCompiling}
                                      style={{ fontSize: 11, padding: "3px 8px" }}
                                    >
                                      {isCompiling
                                        ? `编译中... ${Math.round(compileProgress * 100)}%`
                                        : `编译第${page.page}集`}
                                    </button>
                                    {isCompiling && (
                                      <div className="progress" style={{ marginTop: 4 }}>
                                        <div
                                          className="progress-bar"
                                          style={{ width: `${compileProgress * 100}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="course-pages-empty" style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-tertiary)" }}>
                              无法获取分集列表
                            </div>
                          )}
                        </div>
                      )}

                      {/* 普通视频的编译按钮 — 始终显示 */}
                      {!isCourse && selectedBvid === v.bvid && !loadingResult && (
                        <div style={{ padding: "4px 12px 8px" }}>
                          <button
                            className="compile-btn"
                            onClick={() => handleCompile(v.bvid)}
                            disabled={compiling === v.bvid}
                          >
                            {compiling === v.bvid
                              ? `编译中... ${Math.round(compileProgress * 100)}%`
                              : compileResult && (compileResult.stats?.concept_count ?? 0) > 0
                                ? "🔄 重新编译"
                                : "编译此视频"}
                          </button>
                          {compiling === v.bvid && (
                            <div className="progress" style={{ marginTop: 6 }}>
                              <div
                                className="progress-bar"
                                style={{ width: `${compileProgress * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Compile error banner */}
            {compileError && (
              <div style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                padding: "10px 16px",
                borderRadius: 8,
                margin: "8px 0",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span>⚠ {compileError}</span>
                <button onClick={() => setCompileError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16 }}>×</button>
              </div>
            )}

            {/* Center: Main panel with tabs */}
            <div className="workspace-main">
              <div className="workspace-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`workspace-tab ${activeTab === tab.key ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="workspace-content">
                {loadingResult ? (
                  <div className="center-placeholder">
                    <div className="placeholder-spinner" />
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                      加载编译结果...
                    </span>
                  </div>
                ) : !selectedBvid ? (
                  <div className="center-placeholder">
                    <div className="placeholder-illustration">
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-tertiary)"
                        strokeWidth="1.2"
                      >
                        <path d="M12 3L2 9l10 6 10-6-10-6z" />
                        <path d="M2 17l10 6 10-6" />
                        <path d="M2 13l10 6 10-6" />
                      </svg>
                    </div>
                    <h3 className="placeholder-title">选择一个视频</h3>
                    <p className="placeholder-desc">
                      在左侧视频列表中选择视频，编译后查看知识结构
                    </p>
                  </div>
                ) : !compileResult || ((compileResult.stats?.concept_count ?? 0) === 0 && (compileResult.timeline?.length ?? 0) === 0) ? (
                  <div className="center-placeholder">
                    <div className="placeholder-illustration">
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-tertiary)"
                        strokeWidth="1.2"
                      >
                        <rect x="3" y="3" width="18" height="14" rx="2" />
                        <polygon points="10,7 10,13 15,10" />
                        <path d="M7 21h10M12 17v4" />
                      </svg>
                    </div>
                    <h3 className="placeholder-title">视频尚未编译</h3>
                    <p className="placeholder-desc">
                      点击左侧的"编译此视频"按钮，AI 将自动提取知识结构
                    </p>
                  </div>
                ) : (
                  <>
                    {activeTab === "video" && selectedBvid && (
                      <div style={{ padding: 16 }}>
                        <VideoPlayer bvid={selectedBvid} title={videos.find(v => v.bvid === selectedBvid)?.title} />
                      </div>
                    )}
                    {activeTab === "timeline" && (
                      <KnowledgeTimeline
                        timeline={compileResult.timeline}
                        duration={compileResult.video.duration}
                        videoTitle={compileResult.video.title}
                      />
                    )}
                    {activeTab === "map" && (
                      <KnowledgeMap compileResult={compileResult} />
                    )}
                    {activeTab === "claims" && (
                      <ConceptClaimList concepts={compileResult.concepts} />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Jingyu: Evidence chat — collapsible right sidebar */}
            <div className={`workspace-chat-panel${chatCollapsed ? " collapsed" : ""}`}>
              <div className="workspace-chat-toggle" onClick={() => setChatCollapsed(!chatCollapsed)} title={chatCollapsed ? "展开证据问答" : "收起证据问答"}>
                {chatCollapsed ? "◀" : "▶"}
              </div>
              {!chatCollapsed && <EvidenceChat bvid={selectedBvid} />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
