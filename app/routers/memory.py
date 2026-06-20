"""Memory API with study log tracking"""
from fastapi import APIRouter, Query
import sqlite3, datetime

router = APIRouter(prefix="/api/memory", tags=["memory"])
DB = "data/bilibili_rag.db"
SID = "00000000-0000-0000-0000-000000000000"

def _conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

@router.get("/stats")
async def get_stats(session_id: str = Query("x")):
    c = _conn().cursor()
    c.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE node_type IN ('concept','topic')")
    total = c.fetchone()[0]
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
async def get_history(limit: int = Query(50)):
    c = _conn().cursor()
    c.execute("SELECT bvid,video_title,concept_name,duration_seconds,created_at FROM study_log ORDER BY created_at DESC LIMIT ?",(limit,))
    rows = c.fetchall()
    items = [{"bvid":r["bvid"],"video_title":r["video_title"],"concept_name":r["concept_name"],"duration_seconds":r["duration_seconds"],"created_at":r["created_at"]} for r in rows]
    c.close()
    return {"items":items}

@router.post("/sync-from-knowledge")
async def sync():
    c = _conn().cursor()
    now = datetime.datetime.now().isoformat()
    rows = c.execute("SELECT id FROM knowledge_nodes WHERE node_type IN ('concept','topic')").fetchall()
    count = 0
    for (nid,) in rows:
        c.execute("INSERT OR IGNORE INTO memory_nodes(knowledge_node_id,session_id,mastery_level,created_at,updated_at) VALUES(?,?,0.3,?,?)",(nid,SID,now,now))
        if c.rowcount > 0: count += 1
    c.connection.commit()
    c.close()
    return {"synced":count,"status":"ok"}
