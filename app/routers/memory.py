"""Memory API with study log tracking - owner-aware filtering"""
from fastapi import APIRouter, Query, Depends
import sqlite3, datetime
from typing import Optional
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import KnowledgeNode
from app.utils import resolve_owner_mid

router = APIRouter(prefix="/api/memory", tags=["memory"])
DB = "data/bilibili_rag.db"

def _conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

async def _get_owner_mid(db: AsyncSession, session_id: Optional[str]) -> Optional[int]:
    return await resolve_owner_mid(db, session_id)

@router.get("/stats")
async def get_stats(session_id: str = Query(""), db: AsyncSession = Depends(get_db)):
    owner_mid = await _get_owner_mid(db, session_id) if session_id else None
    c = _conn().cursor()

    # knowledge_nodes supports owner_mid filtering
    if owner_mid is not None:
        c.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE node_type IN ('concept','topic') AND owner_mid=?", (owner_mid,))
        total = c.fetchone()[0]
    else:
        c.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE node_type IN ('concept','topic')")
        total = c.fetchone()[0]

    # study_log table: use simple counts (no owner_mid column yet)
    c.execute("SELECT COUNT(*) FROM study_log")
    logs = c.fetchone()[0]
    c.execute("SELECT COUNT(DISTINCT bvid) FROM study_log")
    vids = c.fetchone()[0]
    c.execute("SELECT COALESCE(SUM(duration_seconds),0) FROM study_log")
    secs = c.fetchone()[0]
    c.execute("SELECT COUNT(DISTINCT DATE(created_at)) FROM study_log")
    days = c.fetchone()[0]

    c.close()
    return {"total_concepts":total,"study_logs":logs,"tracked_videos":vids,"total_seconds":secs,"study_days":days}

@router.get("/history")
async def get_history(limit: int = Query(50), session_id: str = Query(""), db: AsyncSession = Depends(get_db)):
    c = _conn().cursor()
    c.execute("SELECT bvid,video_title,concept_name,duration_seconds,created_at FROM study_log ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    items = [{"bvid":r["bvid"],"video_title":r["video_title"],"concept_name":r["concept_name"],"duration_seconds":r["duration_seconds"],"created_at":r["created_at"]} for r in rows]
    c.close()
    return {"items":items}

@router.post("/sync-from-knowledge")
async def sync(session_id: str = Query(""), db: AsyncSession = Depends(get_db)):
    owner_mid = await _get_owner_mid(db, session_id) if session_id else None
    c = _conn().cursor()
    now = datetime.datetime.now().isoformat()

    if owner_mid is not None:
        rows = c.execute("SELECT id FROM knowledge_nodes WHERE node_type IN ('concept','topic') AND owner_mid=?", (owner_mid,)).fetchall()
        sid_val = session_id or "demo_session"
    else:
        rows = c.execute("SELECT id FROM knowledge_nodes WHERE node_type IN ('concept','topic')").fetchall()
        sid_val = "00000000-0000-0000-0000-000000000000"

    count = 0
    for (nid,) in rows:
        c.execute("INSERT OR IGNORE INTO memory_nodes(knowledge_node_id,session_id,mastery_level,created_at,updated_at,owner_mid) VALUES(?,?,0.3,?,?,?)",
                  (nid, sid_val, now, now, owner_mid))
        if c.rowcount > 0: count += 1

    c.connection.commit()
    c.close()
    return {"synced":count,"status":"ok"}
