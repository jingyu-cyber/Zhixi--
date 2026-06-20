"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { treeApi, TreeNode, TreeResponse, treeMemoryApi, TreeMemorySummary, memoryApi, MemoryStats, MemoryDecayCheck } from "@/lib/api";
import { isActiveSession } from "@/lib/session";

interface TreeNodeItemProps {
  node: TreeNode;
  searchTerm: string;
  difficultyFilter: number;
  memoryLayerFilter: string;
  onNodeSelect?: (nodeId: number) => void;
  selectedNodeId?: number | null;
  depth?: number;
}

function TreeNodeItem({ node, searchTerm, difficultyFilter, memoryLayerFilter, onNodeSelect, selectedNodeId, depth = 0 }: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(node.node_type === "topic" || depth === 0);
  const hasChildren = node.children && node.children.length > 0;

  const matchesSearch = !searchTerm || node.name.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesDifficulty = difficultyFilter === 0 || node.difficulty === difficultyFilter;

  const childMatchesFilter = (n: TreeNode): boolean => {
    const selfMatch = (!searchTerm || n.name.toLowerCase().includes(searchTerm.toLowerCase()))
      && (difficultyFilter === 0 || n.difficulty === difficultyFilter);
    if (selfMatch) return true;
    return (n.children || []).some(childMatchesFilter);
  };

  const visible = (matchesSearch && matchesDifficulty) || childMatchesFilter(node);
  if (!visible) return null;

  const grade = (node as unknown as Record<string, unknown>).grade as string | undefined;
  const isWeak = grade === "weak";
  const isCore = grade === "core";
  const isSelected = selectedNodeId === node.id;

  // 记忆系统信息
  const memLayer = node.memory_layer || "short_term";
  const memStrength = node.memory_strength ?? 0.5;
  const memRecall = node.recall_count ?? 0;

  const strengthColor = memStrength >= 0.7 ? "var(--accent-green, #22c55e)"
    : memStrength >= 0.4 ? "var(--accent-amber, #f59e0b)"
    : "var(--accent-red, #ef4444)";

  const layerLabel = memLayer === "long_term" ? "L" : memLayer === "short_term" ? "S" : "W";
  const layerTitle = memLayer === "long_term" ? "长期记忆"
    : memLayer === "short_term" ? "短期记忆" : "工作记忆";

  return (
    <div className="tree-node">
      <div className={`tree-node-row${isSelected ? " tree-node-selected" : ""}`}>
        <span
          className="tree-toggle"
          onClick={() => hasChildren && setExpanded(!expanded)}
        >
          {hasChildren ? (expanded ? "▼" : "▶") : "  "}
        </span>

        {/* 质量等级指示点 */}
        <span className={`grade-indicator ${isCore ? "grade-core" : isWeak ? "grade-weak" : "grade-normal"}`} />

        {/* 记忆层级小标签 */}
        <span
          className="memory-layer-dot"
          title={`${layerTitle} · 强度 ${Math.round(memStrength * 100)}% · 检索 ${memRecall} 次`}
          style={{
            display: "inline-block", width: 14, height: 14, lineHeight: "14px",
            fontSize: 9, fontWeight: 700, textAlign: "center",
            borderRadius: 3,
            background: memLayer === "long_term" ? "#6366f1" : memLayer === "short_term" ? "#94a3b8" : "#22d3ee",
            color: "#fff", marginRight: 4, flexShrink: 0, cursor: "help",
          }}
        >{layerLabel}</span>

        <span className={`node-badge ${node.node_type}`}>{node.node_type}</span>
        <span
          className="tree-node-name clickable"
          onClick={() => onNodeSelect?.(node.id)}
          style={isWeak ? { opacity: 0.65 } : undefined}
        >
          {node.name}
        </span>
        {node.difficulty > 0 && <span className="node-stars">{"●".repeat(node.difficulty)}</span>}

        {/* 记忆强度微型进度条 */}
        <span title={`记忆强度 ${Math.round(memStrength * 100)}%`} style={{
          display: "inline-block", width: 32, height: 4, borderRadius: 2,
          background: "var(--border-color, #e2e8f0)", marginLeft: 6, flexShrink: 0,
        }}>
          <span style={{
            display: "block", width: `${Math.round(memStrength * 100)}%`, height: "100%",
            borderRadius: 2, background: strengthColor, transition: "width 0.3s ease",
          }} />
        </span>

        {node.video_count > 0 && <span className="node-meta">{node.video_count} 视频</span>}
        {node.is_reference && <span className="node-meta" style={{ fontSize: 10, opacity: 0.8 }}>ref</span>}
      </div>
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              searchTerm={searchTerm}
              difficultyFilter={difficultyFilter}
              memoryLayerFilter={memoryLayerFilter}
              onNodeSelect={onNodeSelect}
              selectedNodeId={selectedNodeId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface KnowledgeTreeProps {
  sessionId?: string | null;
  onNodeSelect?: (nodeId: number) => void;
  selectedNodeId?: number | null;
}

export default function KnowledgeTree({ sessionId, onNodeSelect, selectedNodeId }: KnowledgeTreeProps) {
  const [data, setData] = useState<TreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState(0);
  const [stageFilter, setStageFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState<number | undefined>(undefined);
  const [memoryLayerFilter, setMemoryLayerFilter] = useState("");
  const [memorySummary, setMemorySummary] = useState<TreeMemorySummary | null>(null);

  // 记忆系统状态
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [memoryDecay, setMemoryDecay] = useState<MemoryDecayCheck | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const memoryCheckedRef = useRef(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    setData(null);
    setSearchTerm("");
    setDifficultyFilter(0);
    setStageFilter("");
    setTopicFilter(undefined);
    setMemoryLayerFilter("");
    setMemorySummary(null);
    setMemoryStats(null);
    setMemoryDecay(null);
    setSyncMsg("");
    setShowMemoryPanel(false);
    memoryCheckedRef.current = false;
    setLoading(!!sessionId);
  }, [sessionId]);

  // 同步到记忆系统
  const handleSync = useCallback(() => {
    setSyncing(true);
    setSyncMsg("");
    memoryApi.syncFromKnowledge()
      .then((r) => {
        setSyncMsg(`同步完成: 新增 ${r.created} 个，跳过 ${r.skipped} 个`);
        // 刷新记忆状态
        loadMemoryState();
      })
      .catch((e) => setSyncMsg(`同步失败: ${e.message}`))
      .finally(() => setSyncing(false));
  }, []);

  // 加载记忆状态
  const loadMemoryState = useCallback(() => {
    Promise.all([
      memoryApi.getStats().catch(() => null),
      memoryApi.checkDecay().catch(() => null),
    ]).then(([s, d]) => {
      setMemoryStats(s);
      setMemoryDecay(d);
    });
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setData(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const activeSessionId = sessionId;
    setLoading(true);

    // 根据是否选择了记忆层级，调用不同的 API
    const fetchTree = memoryLayerFilter
      ? treeMemoryApi.getTreeByMemoryLayer(
          memoryLayerFilter as "working" | "short_term" | "long_term",
          { sessionId }
        )
      : treeApi.getTree({ sessionId, stage: stageFilter || undefined, topicId: topicFilter });

    fetchTree
      .then((tree) => {
        if (requestIdRef.current === requestId && isActiveSession(activeSessionId)) {
          setData(tree);
        }
      })
      .catch((e) => {
        if (requestIdRef.current === requestId && isActiveSession(activeSessionId)) {
          console.error("Failed to load tree:", e);
          setData(null);
        }
      })
      .finally(() => {
        if (requestIdRef.current === requestId && isActiveSession(activeSessionId)) {
          setLoading(false);
        }
      });

    // 同时加载记忆摘要
    treeMemoryApi.getMemorySummary({ sessionId })
      .then((summary) => {
        if (isActiveSession(activeSessionId)) setMemorySummary(summary);
      })
      .catch(() => {});

    // 加载全局记忆状态（仅首次）
    if (!memoryCheckedRef.current) {
      memoryCheckedRef.current = true;
      loadMemoryState();
    }
  }, [sessionId, stageFilter, topicFilter, memoryLayerFilter, loadMemoryState]);

  // 自动同步：知识树有数据但记忆为空时自动初始化
  useEffect(() => {
    if (data && data.tree.length > 0 && memoryStats && memoryStats.total_nodes === 0 && !syncing) {
      handleSync();
    }
  }, [data, memoryStats, syncing, handleSync]);

  if (loading) return <div className="loading-state">加载知识树中...</div>;
  if (!data || data.tree.length === 0) {
    return (
      <div className="tree-empty">
        <p>当前账号暂无知识树</p>
        <p>请先选择收藏夹并开始构建，或等待当前账号的构建任务完成。</p>
        <p><Link href="/">回到首页</Link> 或前往工作区继续处理。</p>
      </div>
    );
  }

  const topics = data.tree.filter(n => n.node_type === "topic" && n.id > 0);

  // 记忆面板数据
  const totalMemory = memoryStats?.total_nodes ?? 0;
  const longPct = totalMemory > 0 ? Math.round((memoryStats?.long_term_count ?? 0) / totalMemory * 100) : 0;
  const shortPct = totalMemory > 0 ? Math.round((memoryStats?.short_term_count ?? 0) / totalMemory * 100) : 0;
  const workingPct = totalMemory > 0 ? 100 - longPct - shortPct : 0;
  const decayPct = memoryDecay && memoryDecay.total > 0
    ? Math.round(memoryDecay.stable_count / memoryDecay.total * 100)
    : 100;

  const layerBars = [
    { label: "长期", count: memoryStats?.long_term_count ?? 0, pct: longPct, color: "#6366f1", icon: "🧠" },
    { label: "短期", count: memoryStats?.short_term_count ?? 0, pct: shortPct, color: "#94a3b8", icon: "📋" },
    { label: "工作", count: memoryStats?.working_count ?? 0, pct: workingPct, color: "#22d3ee", icon: "⚡" },
  ];

  return (
    <>
      <div className="tree-toolbar">
        <input
          id="tree-search-input"
          name="search"
          className="tree-search"
          type="text"
          placeholder="搜索知识点..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          id="tree-stage-filter"
          name="stage"
          aria-label="筛选阶段"
          className="tree-filter"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">全部阶段</option>
          <option value="beginner">入门</option>
          <option value="intermediate">进阶</option>
          <option value="advanced">实战</option>
        </select>
        <select
          id="tree-memory-layer-filter"
          name="memory_layer"
          aria-label="记忆层级"
          className="tree-filter"
          value={memoryLayerFilter}
          onChange={(e) => setMemoryLayerFilter(e.target.value)}
          style={{ borderColor: "#6366f1" }}
        >
          <option value="">全部记忆</option>
          <option value="working">⚡ 工作记忆</option>
          <option value="short_term">📋 短期记忆</option>
          <option value="long_term">🧠 长期记忆</option>
        </select>
        {topics.length > 1 && (
          <select
            id="tree-topic-filter"
            name="topic"
            aria-label="筛选主题"
            className="tree-filter"
            value={topicFilter ?? ""}
            onChange={(e) => setTopicFilter(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">全部主题</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <select
          id="tree-difficulty-filter"
          name="difficulty"
          aria-label="筛选难度"
          className="tree-filter"
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(Number(e.target.value))}
        >
          <option value={0}>全部难度</option>
          <option value={1}>● 入门</option>
          <option value={2}>●● 基础</option>
          <option value={3}>●●● 中级</option>
          <option value={4}>●●●● 高级</option>
          <option value={5}>●●●●● 专家</option>
        </select>
      </div>

      {/* 记忆状态摘要条 + 同步按钮 */}
      {memorySummary && (
        <div className="memory-summary-bar" style={{
          display: "flex", gap: 12, padding: "6px 10px", fontSize: 12,
          background: "var(--surface-secondary, #f1f5f9)", borderRadius: 6,
          marginBottom: 8, flexWrap: "wrap", alignItems: "center",
        }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>记忆状态:</span>
          <span title="长期记忆" style={{ color: "#6366f1" }}>
            🧠 {memorySummary.memory_summary.long_term} 长期
          </span>
          <span title="短期记忆" style={{ color: "#94a3b8" }}>
            📋 {memorySummary.memory_summary.short_term} 短期
          </span>
          <span title="工作记忆" style={{ color: "#22d3ee" }}>
            ⚡ {memorySummary.memory_summary.working} 工作
          </span>
          <span title="平均强度" style={{ marginLeft: 8, color: "var(--text-tertiary)" }}>
            强度 {Math.round(memorySummary.memory_summary.avg_strength * 100)}%
          </span>
          {memorySummary.memory_summary.needs_review > 0 && (
            <span title="需复习" style={{ color: "#f59e0b" }}>
              ⚠ {memorySummary.memory_summary.needs_review} 需复习
            </span>
          )}

          {/* 同步 & 面板按钮 */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              title="将知识树数据同步到记忆系统"
              style={{
                fontSize: 11, padding: "2px 10px", borderRadius: 4,
                background: syncing ? "var(--border-color)" : "#6366f1",
                color: "#fff", border: "none", cursor: syncing ? "wait" : "pointer",
              }}
            >
              {syncing ? "同步中..." : "🔄 同步记忆"}
            </button>
            {totalMemory > 0 && (
              <button
                onClick={() => setShowMemoryPanel(!showMemoryPanel)}
                title="展开记忆健康面板"
                style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 4,
                  background: showMemoryPanel ? "#6366f1" : "var(--border-color, #e2e8f0)",
                  color: showMemoryPanel ? "#fff" : "var(--text-secondary)", border: "none",
                  cursor: "pointer",
                }}
              >
                {showMemoryPanel ? "▲ 收起" : "📊 记忆详情"}
              </button>
            )}
          </div>
        </div>
      )}
      {syncMsg && (
        <p style={{ fontSize: 11, color: "var(--accent-green)", margin: "0 0 8px 0", padding: "0 10px" }}>
          {syncMsg}
        </p>
      )}

      {/* 记忆健康面板（可展开） */}
      {showMemoryPanel && memoryStats && totalMemory > 0 && (
        <div style={{
          padding: "10px 14px", fontSize: 12, marginBottom: 8,
          background: "var(--surface, #fff)", borderRadius: 8,
          border: "1px solid var(--border-color, #e2e8f0)",
        }}>
          {/* 层级分布 */}
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            {layerBars.map((l) => (
              <div key={l.label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{l.icon} {l.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: l.color }}>{l.count}</div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{l.pct}%</div>
              </div>
            ))}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>📊 健康度</div>
              <div style={{
                fontSize: 18, fontWeight: 700,
                color: decayPct >= 80 ? "#22c55e" : decayPct >= 50 ? "#f59e0b" : "#ef4444",
              }}>
                {decayPct}%
              </div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>稳定</div>
            </div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>⚠ 待复习</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>
                {memoryDecay?.needs_review_count ?? 0}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>项</div>
            </div>
          </div>

          {/* 需复习列表 */}
          {memoryDecay && memoryDecay.needs_review.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b" }}>
                ⚠ 需要复习 ({memoryDecay.needs_review_count})
              </span>
              <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 11, marginTop: 4 }}>
                {memoryDecay.needs_review.slice(0, 12).map((item) => (
                  <div key={item.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "2px 6px", marginBottom: 2, borderRadius: 3,
                    background: "var(--surface-hover, #f8fafc)",
                  }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            </div>
          )}

          {/* 已遗忘 */}
          {memoryDecay && memoryDecay.forgotten.length > 0 && (
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444" }}>
                💀 已遗忘 ({memoryDecay.forgotten_count})
              </span>
              <div style={{ maxHeight: 80, overflowY: "auto", fontSize: 10, opacity: 0.65, marginTop: 4 }}>
                {memoryDecay.forgotten.slice(0, 8).map((item) => (
                  <div key={item.id} style={{
                    padding: "1px 6px", marginBottom: 1,
                    textDecoration: "line-through", color: "var(--text-tertiary)",
                  }}>
                    {item.name} ({Math.round(item.strength * 100)}%)
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="tree-scroll">
        {data.tree.map((node) => (
          <TreeNodeItem
            key={node.id}
            node={node}
            searchTerm={searchTerm}
            difficultyFilter={difficultyFilter}
            memoryLayerFilter={memoryLayerFilter}
            onNodeSelect={onNodeSelect}
            selectedNodeId={selectedNodeId}
          />
        ))}
      </div>

      <div className="tree-stats">
        <span>{data.stats.total_topics} 主题</span>
        <span>{data.stats.total_nodes} 知识点</span>
        <span>{data.stats.total_edges} 关系</span>
        {data.stats.low_confidence_count > 0 && (
          <span>{data.stats.low_confidence_count} 待审核</span>
        )}
        {memorySummary && (
          <span style={{ color: "#6366f1" }}>
            {memorySummary.memory_summary.strong} 强记忆
          </span>
        )}
        {totalMemory > 0 && (
          <span style={{ color: "#6366f1", cursor: "pointer" }}
            onClick={() => setShowMemoryPanel(!showMemoryPanel)}>
            🧠 {totalMemory} 记忆节点
          </span>
        )}
      </div>
    </>
  );
}
