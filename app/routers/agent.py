"""
知溯 — 智能体路由

POST /agent/ask  —— 工具调用智能体回答（返回最终答案 + 工具调用轨迹 + 来源引用）
"""
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.auth import get_session
from app.services.agent import KnowledgeAgent

router = APIRouter(prefix="/agent", tags=["智能体"])


class AgentAskRequest(BaseModel):
    question: str
    session_id: str | None = None


@router.post("/ask")
async def agent_ask(request: AgentAskRequest, db: AsyncSession = Depends(get_db)):
    """智能体问答：自主调用工具检索本会话知识库后作答。"""
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")
    # 鉴权：显式拒空 session_id（不依赖 DB 列约束），再校验有效性；
    # agent 会做多次 LLM 调用并读取该会话私有知识库。
    if not request.session_id or not await get_session(request.session_id):
        raise HTTPException(status_code=401, detail="会话无效或已过期，请重新登录")

    agent = KnowledgeAgent(db, request.session_id)
    try:
        return await agent.run(request.question.strip())
    except Exception as e:
        logger.error(f"智能体执行失败: {e}")  # 详情仅记日志，不回传给客户端
        raise HTTPException(status_code=500, detail="智能体执行失败，请稍后重试")
