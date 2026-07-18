"""Memory API with study log tracking - owner-aware + favorites-only filtering"""
from fastapi import APIRouter, Query, Depends
import datetime
from typing import Optional
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import KnowledgeNode, UserCollection, MemoryNode, MemoryEdge
from app.utils import resolve_owner_mid, get_favorite_bvids

router = APIRouter(prefix="/api/memory", tags=["memory"])


async def _get_owner_mid(db: AsyncSession, session_id: Optional[str]) -> Optional[int]:
    return await resolve_owner_mid(db, session_id)


@router.get("/stats")
async def get_stats(session_id: str = Query(""), db: AsyncSession = Depends(get_db)):
    """获取记忆统计（只统计收藏视频关联的知识）"""
    owner_mid = await _get_owner_mid(db, session_id) if session_id else None

    # 获取收藏视频 bvids
    favorite_bvids = await get_favorite_bvids(db, owner_mid)

    if owner_mid is not None:
        # 统计 MemoryNode（只属于收藏视频）
        mem_count = await db.scalar(
            select(func.count()).select_from(MemoryNode).where(
                MemoryNode.owner_mid == owner_mid
            )
        ) or 0

        # 统计 KnowledgeNode（只属于收藏视频关联的）
        if favorite_bvids:
            from app.models import NodeSegmentLink
            kn_count = await db.scalar(
                select(func.count(func.distinct(NodeSegmentLink.node_id))).where(
                    NodeSegmentLink.video_bvid.in_(favorite_bvids),
                    NodeSegmentLink.owner_mid == owner_mid,
                )
            ) or 0
        else:
            kn_count = 0

        return {
            "total_concepts": kn_count,
            "memory_nodes": mem_count,
            "favorite_videos": len(favorite_bvids),
            "study_logs": 0,
            "tracked_videos": len(favorite_bvids),
            "total_seconds": 0,
            "study_days": 0,
        }
    else:
        mem_count = await db.scalar(
            select(func.count()).select_from(MemoryNode)
        ) or 0
        return {
            "total_concepts": 0,
            "memory_nodes": mem_count,
            "favorite_videos": 0,
            "study_logs": 0,
            "tracked_videos": 0,
            "total_seconds": 0,
            "study_days": 0,
        }


@router.get("/history")
async def get_history(
    limit: int = Query(50),
    session_id: str = Query(""),
    db: AsyncSession = Depends(get_db),
):
    """获取记忆历史节点列表（只返回收藏视频关联的）"""
    owner_mid = await _get_owner_mid(db, session_id) if session_id else None

    if owner_mid is None:
        return {"items": []}

    mem_query = select(MemoryNode).where(
        MemoryNode.owner_mid == owner_mid,
    ).order_by(MemoryNode.updated_at.desc()).limit(limit)

    result = await db.execute(mem_query)
    nodes = result.scalars().all()

    items = []
    for mem in nodes:
        items.append({
            "bvid": "",
            "video_title": "",
            "concept_name": mem.name,
            "memory_type": mem.memory_type,
            "memory_layer": mem.memory_layer,
            "recall_count": mem.recall_count,
            "confidence": mem.confidence,
            "created_at": str(mem.created_at) if mem.created_at else "",
            "updated_at": str(mem.updated_at) if mem.updated_at else "",
        })

    return {"items": items}


@router.post("/sync-from-knowledge")
async def sync(session_id: str = Query(""), db: AsyncSession = Depends(get_db)):
    """从知识图谱同步到记忆系统（只同步收藏视频关联的节点）"""
    owner_mid = await _get_owner_mid(db, session_id) if session_id else None
    if owner_mid is None:
        return {"synced": 0, "status": "no_session"}

    favorite_bvids = await get_favorite_bvids(db, owner_mid)
    if not favorite_bvids:
        return {"synced": 0, "status": "no_favorites"}

    from app.models import NodeSegmentLink
    now = datetime.datetime.utcnow().isoformat()

    # 获取收藏视频关联的知识节点
    link_result = await db.execute(
        select(NodeSegmentLink.node_id).where(
            NodeSegmentLink.video_bvid.in_(favorite_bvids),
            NodeSegmentLink.owner_mid == owner_mid,
        ).distinct()
    )
    node_ids = [row[0] for row in link_result.fetchall()]
    if not node_ids:
        return {"synced": 0, "status": "no_nodes"}

    # 获取对应的 KnowledgeNode
    kn_result = await db.execute(
        select(KnowledgeNode).where(
            KnowledgeNode.id.in_(node_ids),
            KnowledgeNode.owner_mid == owner_mid,
        )
    )
    count = 0
    for kn in kn_result.scalars().all():
        existing = await db.execute(
            select(MemoryNode).where(
                MemoryNode.knowledge_node_id == kn.id,
                MemoryNode.owner_mid == owner_mid,
            )
        )
        if existing.scalars().first():
            continue

        mem = MemoryNode(
            memory_type="semantic",
            memory_layer="short_term",
            name=kn.name,
            normalized_name=kn.normalized_name or kn.name.lower().strip(),
            definition=kn.definition or "",
            content=kn.definition or "",
            base_strength=kn.confidence or 0.5,
            stability=1.0,
            recall_count=0,
            confidence=kn.confidence or 0.5,
            source_count=kn.source_count or 1,
            difficulty=kn.difficulty or 1,
            knowledge_node_id=kn.id,
            evidence_json=[],
            session_id=session_id,
            owner_mid=owner_mid,
        )
        db.add(mem)
        count += 1

    await db.commit()
    return {"synced": count, "status": "ok"}
