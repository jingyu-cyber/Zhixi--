"""
BiliMind 知识树学习导航系统

学习路径路由 — 独立的学习路径 API

支持:
- 按目标主题名搜索 → 自动生成学习路径
- 按目标节点 ID → 精确生成学习路径
- 三种模式: beginner / standard / quick
"""
from typing import Optional
import json
import re
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI

from app.database import get_db
from app.models import KnowledgeNode, NodeSegmentLink, Segment, VideoCache, _fmt_time
from app.config import settings
from app.services.graph_store import GraphStore
from app.services.path_recommender import PathRecommender
from app.utils import resolve_owner_mid as _resolve_owner_mid

router = APIRouter(prefix="/learning-path", tags=["学习路径"])

# 学习路径 AI 生成请求模型
class AiPathRequest(BaseModel):
    topic: str
    session_id: Optional[str] = None
    mode: str = "standard"  # beginner / standard / quick


def _is_shared_session(session_id: Optional[str]) -> bool:
    """演示用户或未登录用户共享全部数据"""
    if not session_id:
        return True
    if session_id.startswith("demo_"):
        return True
    return False


async def _load_graph_store(db: AsyncSession, session_id: Optional[str]) -> GraphStore:
    """按 owner_mid 加载隔离后的图谱快照，避免跨用户缓存。"""
    from app.utils import resolve_owner_mid as _resolve_owner_mid
    owner_mid = await _resolve_owner_mid(db, session_id)
    graph = GraphStore(graph_path=settings.graph_persist_path)
    await graph.load_from_db(db, session_id=session_id, owner_mid=owner_mid)
    return graph


@router.get("/search")
async def search_target_topics(
    q: str = Query(..., min_length=1, description="搜索目标知识点"),
    limit: int = Query(10, le=30),
    session_id: Optional[str] = Query(None, description="会话ID，用于数据隔离"),
    db: AsyncSession = Depends(get_db),
):
    """搜索可作为学习目标的知识节点"""
    pattern = f"%{q}%"
    stmt = (
        select(KnowledgeNode)
        .where(
            KnowledgeNode.review_status != "rejected",
            KnowledgeNode.name.ilike(pattern),
        )
        .order_by(KnowledgeNode.source_count.desc())
        .limit(limit)
    )
    if not _is_shared_session(session_id):
        owner_mid = await _resolve_owner_mid(db, session_id)
        if owner_mid is not None:
            stmt = stmt.where(KnowledgeNode.owner_mid == owner_mid)
    result = await db.execute(stmt)
    nodes = result.scalars().all()
    return [
        {
            "id": n.id,
            "name": n.name,
            "node_type": n.node_type,
            "difficulty": n.difficulty,
            "definition": n.definition,
            "confidence": n.confidence,
            "source_count": n.source_count,
        }
        for n in nodes
    ]


@router.get("/generate")
async def generate_learning_path(
    target: str = Query(None, description="目标知识点名称（和 node_id 二选一）"),
    node_id: int = Query(None, description="目标节点 ID（和 target 二选一）"),
    mode: str = Query("standard", description="beginner / standard / quick"),
    known: Optional[str] = Query(None, description="已掌握节点 ID 列表，逗号分隔"),
    session_id: Optional[str] = Query(None, description="会话ID，用于数据隔离"),
    db: AsyncSession = Depends(get_db),
):
    """
    生成学习路径

    支持两种输入:
    - node_id: 精确指定目标节点
    - target: 按名称搜索目标节点（取最佳匹配）

    返回包含:
    - 路径步骤（带推荐理由）
    - 每步对应的视频和时间片段
    - 为什么这样推荐
    """
    if not target and node_id is None:
        raise HTTPException(status_code=400, detail="请提供 target 或 node_id")

    if mode not in ("beginner", "standard", "quick"):
        mode = "standard"

    gs = await _load_graph_store(db, session_id=session_id)

    # 确定目标节点
    target_id = node_id
    if target_id is None:
        # 按名称搜索
        results = gs.search_nodes_by_name(target, limit=5)
        if not results:
            # fallback 到 DB
            pattern = f"%{target}%"
            db_result = await db.execute(
                select(KnowledgeNode)
                .where(KnowledgeNode.name.ilike(pattern))
                .order_by(KnowledgeNode.source_count.desc())
                .limit(1)
            )
            if session_id:
                db_result = await db.execute(
                    select(KnowledgeNode)
                    .where(
                        KnowledgeNode.session_id == session_id,
                        KnowledgeNode.name.ilike(pattern),
                    )
                    .order_by(KnowledgeNode.source_count.desc())
                    .limit(1)
                )
            node = db_result.scalar_one_or_none()
            if node:
                target_id = node.id
            else:
                raise HTTPException(status_code=404, detail=f"未找到知识点: {target}")
        else:
            target_id = results[0]["id"]

    if not gs.has_node(target_id):
        raise HTTPException(status_code=404, detail="节点不存在于知识图谱中")

    # 解析已知节点
    known_ids = []
    if known:
        try:
            known_ids = [int(x.strip()) for x in known.split(",") if x.strip()]
        except ValueError:
            pass

    # 生成路径
    recommender = PathRecommender(gs)
    result = recommender.recommend_path(target_id, mode=mode, known_node_ids=known_ids)

    # 为每个步骤填充视频和片段信息
    for step in result.get("steps", []):
        nid = step["node_id"]
        await _fill_step_videos(step, nid, db, session_id=session_id)
    _refresh_path_summary(result)

    return result


@router.get("/topics")
async def get_popular_topics(
    limit: int = Query(20, le=50),
    session_id: Optional[str] = Query(None, description="会话ID，用于数据隔离"),
    db: AsyncSession = Depends(get_db),
):
    """获取热门学习目标（按 source_count 排序）"""
    stmt = (
        select(KnowledgeNode)
        .where(
            KnowledgeNode.review_status != "rejected",
            KnowledgeNode.source_count >= 2,
        )
        .order_by(KnowledgeNode.source_count.desc())
        .limit(limit)
    )
    if session_id:
        stmt = stmt.where(KnowledgeNode.session_id == session_id)
    result = await db.execute(stmt)
    nodes = result.scalars().all()
    items = []
    for n in nodes:
        vid_stmt = select(func.count(func.distinct(NodeSegmentLink.video_bvid))).where(
            NodeSegmentLink.node_id == n.id
        )
        if session_id:
            vid_stmt = vid_stmt.where(NodeSegmentLink.session_id == session_id)
        vid_count = await db.scalar(vid_stmt)
        items.append({
            "id": n.id,
            "name": n.name,
            "node_type": n.node_type,
            "difficulty": n.difficulty,
            "definition": n.definition,
            "source_count": n.source_count,
            "video_count": vid_count or 0,
        })
    return items


# ==================== 辅助函数 ====================

async def _fill_step_videos(
    step: dict,
    node_id: int,
    db: AsyncSession,
    session_id: Optional[str] = None,
) -> None:
    """为路径步骤填充视频和片段信息"""
    # 统计视频数
    vid_stmt = select(func.count(func.distinct(NodeSegmentLink.video_bvid))).where(
        NodeSegmentLink.node_id == node_id
    )
    if session_id:
        vid_stmt = vid_stmt.where(NodeSegmentLink.session_id == session_id)
    vid_count = await db.scalar(vid_stmt)
    step["has_videos"] = (vid_count or 0) > 0
    step["video_count"] = vid_count or 0
    total_segment_count = 0

    # 获取代表性视频（最多 2 个）
    links_stmt = (
        select(NodeSegmentLink.video_bvid)
        .where(NodeSegmentLink.node_id == node_id)
        .distinct()
        .limit(2)
    )
    if session_id:
        links_stmt = links_stmt.where(NodeSegmentLink.session_id == session_id)
    links = await db.execute(links_stmt)
    bvids = [row[0] for row in links.fetchall()]
    step["videos"] = []

    for bvid in bvids:
        vc = await db.execute(select(VideoCache).where(VideoCache.bvid == bvid))
        video = vc.scalar_one_or_none()
        if not video:
            continue

        # 获取该节点在该视频中的片段
        seg_links_stmt = select(NodeSegmentLink.segment_id).where(
            NodeSegmentLink.node_id == node_id,
            NodeSegmentLink.video_bvid == bvid,
        )
        if session_id:
            seg_links_stmt = seg_links_stmt.where(NodeSegmentLink.session_id == session_id)
        seg_links = await db.execute(seg_links_stmt)
        seg_ids = [r[0] for r in seg_links.fetchall()]
        segs = []
        if seg_ids:
            seg_stmt = select(Segment).where(Segment.id.in_(seg_ids)).order_by(Segment.start_time)
            if session_id:
                seg_stmt = seg_stmt.where(Segment.session_id == session_id)
            seg_result = await db.execute(seg_stmt)
            for seg in seg_result.scalars().all():
                segs.append({
                    "id": seg.id,
                    "text": (seg.cleaned_text or seg.raw_text or "")[:200],
                    "time_label": f"{_fmt_time(seg.start_time)}-{_fmt_time(seg.end_time)}"
                                 if seg.start_time is not None else "",
                    "url": f"https://www.bilibili.com/video/{bvid}?t={int(seg.start_time)}"
                           if seg.start_time is not None else None,
                })
            total_segment_count += len(segs)

        step["videos"].append({
            "bvid": video.bvid,
            "title": video.title,
            "duration": video.duration,
            "url": f"https://www.bilibili.com/video/{video.bvid}",
            "segments": segs,
        })

    step["segment_count"] = total_segment_count
    evidence_score = min(1.0, (min(3, step["video_count"]) / 3.0) * 0.65 + (min(4, total_segment_count) / 4.0) * 0.35)
    priority_score = float(step.get("priority_score", 0.0) or 0.0)
    step["evidence_score"] = round(evidence_score, 3)
    step["composite_score"] = round(priority_score * 0.7 + evidence_score * 0.3, 3)
    if evidence_score >= 0.75:
        step["support_label"] = "strong"
    elif evidence_score >= 0.45:
        step["support_label"] = "medium"
    else:
        step["support_label"] = "weak"


def _refresh_path_summary(result: dict) -> None:
    steps = result.get("steps", [])
    result["estimated_videos"] = sum(1 for step in steps if step.get("has_videos"))
    summary = result.get("summary") or {}
    if not steps:
        summary.update({
            "avg_evidence_score": 0.0,
            "avg_composite_score": 0.0,
            "strong_support_steps": 0,
        })
        result["summary"] = summary
        return

    avg_evidence = sum(float(step.get("evidence_score", 0.0) or 0.0) for step in steps) / len(steps)
    avg_composite = sum(float(step.get("composite_score", 0.0) or 0.0) for step in steps) / len(steps)
    summary.update({
        "avg_evidence_score": round(avg_evidence, 3),
        "avg_composite_score": round(avg_composite, 3),
        "strong_support_steps": sum(1 for step in steps if step.get("support_label") == "strong"),
    })
    result["summary"] = summary


@router.post("/ai-generate")
async def ai_generate_learning_path(
    request: AiPathRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    AI 驱动的学习路径生成

    分析已编译的视频内容，由 AI 从视频知识中提取知识点，
    按从基础到高级、从易到难的顺序编排成线性学习路径。

    不依赖预编译的知识图谱节点，直接分析视频片段内容。
    """
    topic = request.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="请输入学习目标主题")

    mode_labels = {
        "beginner": "入门路径 - 从最基础开始，覆盖所有必要前置知识",
        "standard": "标准路径 - 覆盖核心知识点和重要前置",
        "quick": "快速复习 - 精简链路，跳过已掌握内容",
    }
    mode_label = mode_labels.get(request.mode, mode_labels["standard"])

    # Step 1: 搜索相关的视频片段
    segments_data = await _fetch_relevant_segments(db, topic, request.session_id)

    if not segments_data:
        return await _generate_conceptual_path(topic, request.mode)

    # Step 2: 用 LLM 从片段内容中编排学习路径
    return await _generate_ai_path(topic, request.mode, mode_label, segments_data, db, request.session_id)


async def _fetch_relevant_segments(db: AsyncSession, topic: str, session_id: Optional[str] = None) -> list[dict]:
    """搜索与主题相关的视频片段"""
    pattern = f"%{topic}%"
    stmt = select(KnowledgeNode).where(KnowledgeNode.name.ilike(pattern))
    if session_id:
        stmt = stmt.where(KnowledgeNode.session_id == session_id)
    result = await db.execute(stmt.limit(30))
    nodes = result.scalars().all()

    segments_data = []
    seen_bvids = set()

    for node in nodes[:20]:
        links_stmt = select(NodeSegmentLink).where(NodeSegmentLink.node_id == node.id)
        if session_id:
            links_stmt = links_stmt.where(NodeSegmentLink.session_id == session_id)
        links = await db.execute(links_stmt.limit(3))
        for link in links.scalars().all():
            seg = await db.get(Segment, link.segment_id)
            video = await db.get(VideoCache, link.video_bvid)
            if seg and video and link.video_bvid not in seen_bvids:
                seen_bvids.add(link.video_bvid)
                segments_data.append({
                    "video_title": video.title,
                    "video_bvid": link.video_bvid,
                    "text": (seg.cleaned_text or seg.raw_text or "")[:500],
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "node_name": node.name,
                    "node_difficulty": node.difficulty or 1,
                })

    if len(segments_data) < 5:
        seg_stmt = (
            select(Segment, VideoCache.title, VideoCache.bvid)
            .join(VideoCache, Segment.video_bvid == VideoCache.bvid)
            .where(
                (Segment.cleaned_text.ilike(pattern)) | (Segment.raw_text.ilike(pattern))
            )
            .limit(20)
        )
        if session_id:
            seg_stmt = seg_stmt.where(Segment.session_id == session_id)
        seg_result = await db.execute(seg_stmt)
        for row in seg_result.fetchall():
            seg, title, bvid = row
            if bvid not in seen_bvids:
                seen_bvids.add(bvid)
                segments_data.append({
                    "video_title": title,
                    "video_bvid": bvid,
                    "text": (seg.cleaned_text or seg.raw_text or "")[:500],
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "node_name": "",
                    "node_difficulty": 1,
                })

    return segments_data[:15]


async def _generate_ai_path(
    topic: str, mode: str, mode_label: str,
    segments_data: list[dict], db: AsyncSession,
    session_id: Optional[str] = None,
) -> dict:
    """用 LLM 从视频片段内容编排学习路径"""
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )

    content_summary = "\n\n".join([
        f"[视频{i+1}]《{s['video_title']}》\n内容片段: {s['text'][:300]}"
        for i, s in enumerate(segments_data[:10])
    ])

    prompt = f"""你是一个教育课程设计师。用户想学习「{topic}」，请根据以下视频内容片段设计一条学习路径。

要求：
1. 从视频内容中提取关键知识点
2. 按从基础到高级、从易到难的顺序排列
3. 每个步骤包含：知识点名称、简要说明、推荐理由
4. 步骤之间要有逻辑递进关系

模式: {mode_label}

视频内容片段:
{content_summary[:4000]}

请以 JSON 格式返回（不要markdown代码块）：
{{
  "target": {{ "name": "{topic}", "description": "学习目标概要" }},
  "mode": "{mode}",
  "steps": [
    {{
      "step": 1,
      "title": "知识点名称",
      "description": "简要说明这个知识点需要掌握什么",
      "reason": "为什么这一步要放在这里",
      "difficulty": 1,
      "related_video_index": 0
    }}
  ],
  "summary": "整条路径的概述"
}}

difficulty 范围 1-5。related_video_index 为最相关视频片段索引（-1=无关联）。"""

    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2, max_tokens=2000, timeout=60,
        )
        raw = response.choices[0].message.content.strip()
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if json_match:
            raw = json_match.group(0)
        data = json.loads(raw)
    except Exception:
        return await _generate_conceptual_path(topic, mode)

    for step in data.get("steps", []):
        idx = step.pop("related_video_index", -1)
        if 0 <= idx < len(segments_data):
            seg = segments_data[idx]
            step["video"] = {
                "bvid": seg["video_bvid"],
                "title": seg["video_title"],
                "start_time": seg["start_time"],
                "url": f"https://www.bilibili.com/video/{seg['video_bvid']}?t={int(seg['start_time'])}"
                       if seg["start_time"] else None,
            }
        else:
            step["video"] = None

    data["total_steps"] = len(data.get("steps", []))
    data["estimated_videos"] = sum(1 for s in data.get("steps", []) if s.get("video"))
    return data


async def _generate_conceptual_path(topic: str, mode: str) -> dict:
    """无编译数据时，AI 生成概念性学习路径"""
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )

    mode_labels = {
        "beginner": "入门路径，覆盖所有基础前置知识，步骤细致全面（8-10步）",
        "standard": "标准路径，覆盖核心知识，平衡深度与效率（5-7步）",
        "quick": "快速复习，精简关键点，快速到达目标（3-5步）",
    }

    prompt = f"""你是一个教育课程设计师。用户想学习「{topic}」。

请设计一条线性学习路径（{mode_labels.get(mode, mode_labels['standard'])}）。

要求：
1. 从最基础的概念开始，逐步深入到高级主题
2. 每个步骤包含知识点名称和简要学习目标
3. 步骤之间逻辑递进
4. difficulty 从 1（入门）到 5（高级）递增

以 JSON 格式返回（不要markdown代码块）：
{{
  "target": {{ "name": "{topic}", "description": "学习目标概要" }},
  "mode": "{mode}",
  "steps": [
    {{
      "step": 1,
      "title": "知识点名称",
      "description": "需要学习什么、掌握到什么程度",
      "reason": "为什么这一步是必要的基础",
      "difficulty": 1
    }}
  ],
  "summary": "整条路径的逻辑说明"
}}"""

    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3, max_tokens=2000, timeout=60,
        )
        raw = response.choices[0].message.content.strip()
        json_match = re.search(r"\{[\s\S]*\}", raw)
        if json_match:
            raw = json_match.group(0)
        data = json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 生成学习路径失败: {str(e)}")

    data["total_steps"] = len(data.get("steps", []))
    data["estimated_videos"] = 0
    data["source"] = "ai_conceptual"
    return data
