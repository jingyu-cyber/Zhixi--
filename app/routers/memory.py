"""
BiliMind 记忆系统 — API 路由

提供记忆的搜索、检索、统计和合并管理接口
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.memory.store import MemoryStore
from app.services.memory.retrieval import MemoryRetriever
from app.services.memory.consolidation import MemoryConsolidator
from app.services.memory.models import (
    MemorySearchRequest,
    MemorySearchResponse,
    MemoryConsolidateRequest,
    MemoryConsolidationResult,
    MemoryStatsResponse,
)

router = APIRouter(prefix="/api/memory", tags=["memory"])


# 全局单例 (应用启动时初始化)
_memory_store: Optional[MemoryStore] = None
_memory_retriever: Optional[MemoryRetriever] = None
_memory_consolidator: Optional[MemoryConsolidator] = None


def get_memory_store() -> MemoryStore:
    global _memory_store
    if _memory_store is None:
        _memory_store = MemoryStore(graph_path="./data/memory_graph.json")
        # 尝试从缓存加载
        if not _memory_store.load_json():
            logger.info("Memory graph cache not found, will load from DB on first use")
    return _memory_store


def get_memory_retriever() -> MemoryRetriever:
    global _memory_retriever
    if _memory_retriever is None:
        _memory_retriever = MemoryRetriever(get_memory_store())
    return _memory_retriever


def get_memory_consolidator() -> MemoryConsolidator:
    global _memory_consolidator
    if _memory_consolidator is None:
        _memory_consolidator = MemoryConsolidator(get_memory_store())
    return _memory_consolidator


# ==================== API 端点 ====================

@router.get("/stats", response_model=MemoryStatsResponse)
async def get_memory_stats(
    owner_mid: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """获取记忆系统统计信息"""
    store = get_memory_store()
    if store.graph.number_of_nodes() == 0:
        await store.load_from_db(db, owner_mid)
    return await store.get_memory_stats(db, owner_mid)


@router.post("/search", response_model=MemorySearchResponse)
async def search_memory(
    req: MemorySearchRequest,
    owner_mid: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """上下文感知记忆搜索"""
    store = get_memory_store()
    if store.graph.number_of_nodes() == 0:
        await store.load_from_db(db, owner_mid)

    retriever = get_memory_retriever()
    return await retriever.search(
        query=req.query,
        top_k=req.top_k,
        context_node_ids=req.context_node_ids,
        min_strength=req.min_strength,
        include_evidences=req.include_evidences,
    )


@router.post("/recall/{node_id}")
async def record_recall(
    node_id: int,
    db: AsyncSession = Depends(get_db),
):
    """记录一次成功的记忆检索（强化记忆）"""
    from sqlalchemy import select
    from app.models import MemoryNode as MemoryNodeDB

    store = get_memory_store()
    if store.graph.number_of_nodes() == 0:
        await store.load_from_db(db)

    # node_id 来自前端知识树的 KnowledgeNode ID
    # 需要在 MemoryNode 中查找 knowledge_node_id 匹配的记录
    memory_node_id = None
    for mn_id, attrs in store.graph.nodes(data=True):
        if attrs.get("knowledge_node_id") == node_id:
            memory_node_id = mn_id
            break

    if memory_node_id is None:
        # Fallback: 尝试直接按 node_id 匹配
        if store.has_node(node_id):
            memory_node_id = node_id
        else:
            return {
                "node_id": node_id,
                "new_strength": 0.0,
                "message": "Memory node not found (sync first)",
            }

    new_strength = await store.record_recall(db, memory_node_id)
    return {
        "node_id": node_id,
        "memory_node_id": memory_node_id,
        "new_strength": round(new_strength, 3),
        "message": "Memory reinforced successfully",
    }


@router.post("/consolidate", response_model=list[MemoryConsolidationResult])
async def consolidate_memories(
    req: MemoryConsolidateRequest,
    db: AsyncSession = Depends(get_db),
):
    """合并去重新记忆，检测冲突"""
    consolidator = get_memory_consolidator()
    results = await consolidator.consolidate_batch(
        db, req.new_node_ids, req.owner_mid
    )
    return results


@router.post("/sync-from-knowledge")
async def sync_from_knowledge_nodes(
    owner_mid: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    从已有的 KnowledgeNode 同步到 MemoryNode (一次性迁移)
    将 existing 知识节点升级为记忆节点
    """
    from sqlalchemy import select
    from app.models import (
        KnowledgeNode, KnowledgeEdge, MemoryNode as MemoryNodeDB,
        MemoryEdge as MemoryEdgeDB, Segment,
    )

    nodes_result = await db.execute(select(KnowledgeNode))
    knowledge_nodes = nodes_result.scalars().all()

    created = 0
    skipped = 0

    for kn in knowledge_nodes:
        # 检查是否已存在同名记忆节点
        existing = await db.execute(
            select(MemoryNodeDB).where(
                MemoryNodeDB.normalized_name == (kn.normalized_name or kn.name.lower().strip()),
                MemoryNodeDB.owner_mid == (owner_mid or kn.owner_mid),
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        # 查找关联的 Segment 作为证据
        from app.models import NodeSegmentLink
        links_result = await db.execute(
            select(NodeSegmentLink).where(NodeSegmentLink.node_id == kn.id)
        )
        links = links_result.scalars().all()

        evidences = []
        for link in links[:10]:
            seg_result = await db.execute(
                select(Segment).where(Segment.id == link.segment_id)
            )
            seg = seg_result.scalar_one_or_none()
            if seg:
                evidences.append({
                    "source_type": "bilibili",
                    "source_id": seg.video_bvid,
                    "segment_id": seg.id,
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "text_snippet": (seg.raw_text or "")[:500],
                    "confidence": link.confidence or 0.5,
                })

        # 判断记忆类型
        memory_type = "semantic" if kn.node_type in ("concept", "topic") else (
            "procedural" if kn.node_type == "method" else "episodic"
        )

        mn = MemoryNodeDB(
            memory_type=memory_type,
            memory_layer="short_term",
            name=kn.name,
            normalized_name=kn.normalized_name or kn.name.lower().strip(),
            definition=kn.definition,
            content=kn.definition,
            base_strength=kn.confidence or 0.5,
            stability=1.0,
            recall_count=0,
            confidence=kn.confidence or 0.5,
            source_count=kn.source_count or 1,
            difficulty=kn.difficulty or 1,
            review_status=kn.review_status or "auto",
            knowledge_node_id=kn.id,
            evidence_json=evidences,
            session_id=kn.session_id,
            owner_mid=kn.owner_mid,
        )
        db.add(mn)
        created += 1

    # 同步关系
    edges_result = await db.execute(select(KnowledgeEdge))
    for edge in edges_result.scalars().all():
        # 查找对应的 MemoryNode
        src_node = await db.execute(
            select(KnowledgeNode).where(KnowledgeNode.id == edge.source_node_id)
        )
        tgt_node = await db.execute(
            select(KnowledgeNode).where(KnowledgeNode.id == edge.target_node_id)
        )
        src = src_node.scalar_one_or_none()
        tgt = tgt_node.scalar_one_or_none()
        if not src or not tgt:
            continue

        src_mem = await db.execute(
            select(MemoryNodeDB).where(
                MemoryNodeDB.normalized_name == (src.normalized_name or src.name.lower().strip()),
            )
        )
        tgt_mem = await db.execute(
            select(MemoryNodeDB).where(
                MemoryNodeDB.normalized_name == (tgt.normalized_name or tgt.name.lower().strip()),
            )
        )
        src_m = src_mem.scalar_one_or_none()
        tgt_m = tgt_mem.scalar_one_or_none()
        if not src_m or not tgt_m:
            continue

        existing_edge = await db.execute(
            select(MemoryEdgeDB).where(
                MemoryEdgeDB.source_id == src_m.id,
                MemoryEdgeDB.target_id == tgt_m.id,
                MemoryEdgeDB.relation_type == edge.relation_type,
            )
        )
        if not existing_edge.scalar_one_or_none():
            me = MemoryEdgeDB(
                source_id=src_m.id,
                target_id=tgt_m.id,
                relation_type=edge.relation_type,
                weight=edge.weight or 1.0,
                confidence=edge.confidence or 0.5,
                evidence_video_bvid=edge.evidence_video_bvid,
                session_id=edge.session_id,
                owner_mid=edge.owner_mid,
            )
            db.add(me)

    await db.commit()

    # 重新加载内存图
    store = get_memory_store()
    await store.load_from_db(db, owner_mid)
    store.save_json()

    return {
        "message": f"Synced {created} knowledge nodes to memory nodes, skipped {skipped}",
        "created": created,
        "skipped": skipped,
    }


@router.post("/decay-check")
async def check_memory_decay(
    owner_mid: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """检查所有记忆的衰减状态，标记需复习的节点"""
    store = get_memory_store()
    if store.graph.number_of_nodes() == 0:
        await store.load_from_db(db, owner_mid)

    now = datetime.now(timezone.utc)
    forgotten = []
    needs_review = []
    stable = []

    for nid, attrs in store.graph.nodes(data=True):
        strength = store.get_node(nid).get("current_strength", attrs.get("base_strength", 0.5))
        name = attrs.get("name", "")

        if strength < 0.15:
            forgotten.append({"id": nid, "name": name, "strength": round(strength, 3)})
        elif strength < 0.35:
            needs_review.append({"id": nid, "name": name, "strength": round(strength, 3)})
        else:
            stable.append({"id": nid, "name": name, "strength": round(strength, 3)})

    return {
        "total": len(forgotten) + len(needs_review) + len(stable),
        "forgotten_count": len(forgotten),
        "needs_review_count": len(needs_review),
        "stable_count": len(stable),
        "forgotten": forgotten[:10],
        "needs_review": needs_review[:20],
    }
