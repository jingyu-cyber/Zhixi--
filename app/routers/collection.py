"""
用户收藏 API — 爱心点亮/取消 + 列表查询
收藏时自动同步概念到知识树，取消时自动清理
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete, and_, or_
from app.database import get_db_context
from app.models import UserCollection, Concept, KnowledgeNode, KnowledgeEdge
from app.utils import resolve_owner_mid

router = APIRouter(prefix="/collection", tags=["collection"])


class ToggleRequest(BaseModel):
    bvid: str
    title: str = ""
    session_id: str


async def _sync_video_to_tree(db, bvid: str, title: str, owner_mid: int, session_id: str):
    """将视频的概念同步到知识树"""
    # 1. 查找该视频的所有概念（从 concepts 表）
    result = await db.execute(
        select(Concept).where(Concept.video_bvid == bvid)
    )
    concepts = result.scalars().all()
    if not concepts:
        return None  # 视频尚未编译，无概念可同步

    # 2. 创建或获取主题节点
    result = await db.execute(
        select(KnowledgeNode).where(
            KnowledgeNode.owner_mid == owner_mid,
            KnowledgeNode.name == title,
            KnowledgeNode.node_type == "topic",
        )
    )
    topic_node = result.scalars().first()
    if not topic_node:
        topic_node = KnowledgeNode(
            node_type="topic",
            name=title,
            normalized_name=title.lower().strip() if title else bvid,
            definition=f"B站收藏视频: {title}",
            difficulty=1,
            confidence=0.5,
            source_count=len(concepts),
            review_status="auto",
            session_id=session_id,
            owner_mid=owner_mid,
        )
        db.add(topic_node)
        await db.flush()

    concept_nodes_added = 0
    edges_added = 0
    node_ids = []

    for c in concepts:
        if not c.name:
            continue

        # 3. 查找或创建知识节点
        result = await db.execute(
            select(KnowledgeNode).where(
                KnowledgeNode.owner_mid == owner_mid,
                KnowledgeNode.name == c.name,
                KnowledgeNode.node_type == "concept",
            )
        )
        kn = result.scalars().first()
        if not kn:
            kn = KnowledgeNode(
                node_type="concept",
                name=c.name,
                normalized_name=c.normalized_name or c.name.lower().strip(),
                definition=c.definition or "",
                difficulty=c.difficulty or 1,
                confidence=0.7,
                source_count=c.source_count or 1,
                review_status="auto",
                session_id=session_id,
                owner_mid=owner_mid,
            )
            db.add(kn)
            await db.flush()
            concept_nodes_added += 1
        node_ids.append(kn.id)

        # 4. 创建概念→主题的边
        result = await db.execute(
            select(KnowledgeEdge).where(
                KnowledgeEdge.source_node_id == kn.id,
                KnowledgeEdge.target_node_id == topic_node.id,
                KnowledgeEdge.relation_type == "belongs_to",
            )
        )
        if not result.scalars().first():
            edge = KnowledgeEdge(
                source_node_id=kn.id,
                target_node_id=topic_node.id,
                relation_type="belongs_to",
                weight=1.0,
                confidence=0.7,
                evidence_video_bvid=bvid,
                session_id=session_id,
                owner_mid=owner_mid,
            )
            db.add(edge)
            edges_added += 1

    # 5. 概念间共现边
    cross_added = 0
    unique_ids = list(set(node_ids))
    if 1 < len(unique_ids) <= 60:
        for i in range(len(unique_ids)):
            for j in range(i + 1, len(unique_ids)):
                n1, n2 = unique_ids[i], unique_ids[j]
                result = await db.execute(
                    select(KnowledgeEdge).where(
                        or_(
                            and_(KnowledgeEdge.source_node_id == n1, KnowledgeEdge.target_node_id == n2),
                            and_(KnowledgeEdge.source_node_id == n2, KnowledgeEdge.target_node_id == n1),
                        ),
                        KnowledgeEdge.relation_type == "co_occurrence",
                    )
                )
                if not result.scalars().first():
                    edge = KnowledgeEdge(
                        source_node_id=n1,
                        target_node_id=n2,
                        relation_type="co_occurrence",
                        weight=0.5,
                        confidence=0.3,
                        evidence_video_bvid=bvid,
                        session_id=session_id,
                        owner_mid=owner_mid,
                    )
                    db.add(edge)
                    cross_added += 1

    return {
        "concepts_synced": concept_nodes_added,
        "topic_edges": edges_added,
        "cross_edges": cross_added,
    }


async def _remove_video_from_tree(db, bvid: str, owner_mid: int):
    """从知识树移除视频"""
    result = await db.execute(
        select(KnowledgeEdge).where(
            KnowledgeEdge.owner_mid == owner_mid,
            KnowledgeEdge.evidence_video_bvid == bvid,
        )
    )
    removed_edges = 0
    for edge in result.scalars().all():
        await db.delete(edge)
        removed_edges += 1

    # 查找并删除该视频的主题节点（如果没有其他视频使用它）
    result = await db.execute(
        select(KnowledgeNode).where(
            KnowledgeNode.owner_mid == owner_mid,
            KnowledgeNode.node_type == "topic",
        )
    )
    for topic in result.scalars().all():
        # 检查这个主题是否还有 belongs_to 边
        result2 = await db.execute(
            select(KnowledgeEdge).where(
                KnowledgeEdge.target_node_id == topic.id,
                KnowledgeEdge.relation_type == "belongs_to",
            )
        )
        if not result2.scalars().first():
            await db.delete(topic)


@router.post("/toggle")
async def toggle_collection(req: ToggleRequest):
    """切换视频收藏状态，自动同步知识树"""
    async with get_db_context() as db:
        owner_mid = await resolve_owner_mid(db, req.session_id)

        existing = await db.execute(
            select(UserCollection).where(
                UserCollection.bvid == req.bvid,
                UserCollection.owner_mid == owner_mid,
            )
        )
        row = existing.scalars().first()

        if row:
            # 取消收藏 → 清理知识树
            await db.execute(delete(UserCollection).where(UserCollection.id == row.id))
            await _remove_video_from_tree(db, req.bvid, owner_mid)
            await db.commit()
            return {"hearted": False, "bvid": req.bvid, "action": "removed"}

        # 添加收藏 → 同步知识树
        entry = UserCollection(
            bvid=req.bvid, title=req.title,
            owner_mid=owner_mid, session_id=req.session_id
        )
        db.add(entry)

        sync_result = await _sync_video_to_tree(
            db, req.bvid, req.title, owner_mid, req.session_id
        )
        await db.commit()

        return {
            "hearted": True,
            "bvid": req.bvid,
            "action": "added",
            "sync": sync_result,
        }


@router.get("/list")
async def list_collection(session_id: str = Query(...)):
    """获取用户收藏列表"""
    async with get_db_context() as db:
        owner_mid = await resolve_owner_mid(db, session_id)
        result = await db.execute(
            select(UserCollection).where(UserCollection.owner_mid == owner_mid)
        )
        rows = result.scalars().all()
        return [
            {"bvid": r.bvid, "title": r.title, "created_at": str(r.created_at)}
            for r in rows
        ]
