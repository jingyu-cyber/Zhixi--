"""
BiliMind 共享工具函数
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import UserSession


async def resolve_owner_mid(db: AsyncSession, session_id: Optional[str]) -> Optional[int]:
    """从 session_id 解析 B站用户 ID (owner_mid)，用于跨 session 数据共享

    演示用户 (bili_mid=0) 返回 0，实现数据隔离。
    普通用户返回其 bili_mid。
    """
    if not session_id:
        return None
    result = await db.execute(
        select(UserSession.bili_mid).where(UserSession.session_id == session_id)
    )
    row = result.first()
    if row and row[0] is not None:
        return row[0]  # 0 for demo, or real mid for regular users
    return None
