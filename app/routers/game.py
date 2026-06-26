"""
BiliMind 知识树学习导航系统

知识预测游戏路由 - 概念关系猜测
"""
import random
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.database import get_db, get_db_context
from app.models import GameScore
from app.services.graph_store import GraphStore
from app.config import settings

router = APIRouter(prefix="/game", tags=["知识游戏"])

async def _get_session_graph(db: AsyncSession, session_id: Optional[str]) -> GraphStore:
    from app.utils import resolve_owner_mid as _resolve_owner_mid
    owner_mid = await _resolve_owner_mid(db, session_id)
    graph = GraphStore(graph_path=settings.graph_persist_path)
    await graph.load_from_db(db, session_id=None, owner_mid=owner_mid)
    return graph

RELATION_TEMPLATES = {
    "belongs_to": {
        "correct": "「{a}」是「{b}」主题下的一个知识点",
        "wrong": [
            "「{b}」是「{a}」的子概念，属于同一知识体系",
            "「{a}」和「{b}」是完全无关的两个概念",
            "「{a}」必须先掌握「{b}」才能理解",
        ],
    },
    "co_occurrence": {
        "correct": "「{a}」和「{b}」经常在同一学习内容中出现，互相关联",
        "wrong": [
            "「{a}」是「{b}」的前提知识，必须先学前者",
            "「{a}」和「{b}」是同一概念的不同名称",
            "「{b}」完全包含了「{a}」的知识范畴",
        ],
    },
    "prerequisite_of": {
        "correct": "「{a}」是学习「{b}」的前置知识，必须先掌握",
        "wrong": [
            "「{a}」和「{b}」可以独立学习，没有先后关系",
            "「{b}」是「{a}」的基础，应该先学后者",
            "「{a}」和「{b}」属于完全不同的学科领域",
        ],
    },
    "part_of": {
        "correct": "「{a}」是「{b}」的一个组成部分或子类别",
        "wrong": [
            "「{a}」和「{b}」是同一层级的并列概念",
            "「{b}」是「{a}」的一个具体实例",
            "「{a}」和「{b}」之间没有包含关系",
        ],
    },
    "related_to": {
        "correct": "「{a}」和「{b}」在知识体系中密切相关，互相参照",
        "wrong": [
            "「{a}」是「{b}」的充分必要条件",
            "「{a}」和「{b}」来自不同的学科，没有交叉",
            "学习「{b}」之前必须先完全掌握「{a}」",
        ],
    },
    "explains": {
        "correct": "「{a}」可以用来解释或说明「{b}」的含义",
        "wrong": [
            "「{a}」和「{b}」互不相干，各自独立",
            "「{b}」是「{a}」的上位概念，范畴更大",
            "「{a}」与「{b}」互为反义概念",
        ],
    },
    "supports": {
        "correct": "「{a}」为「{b}」提供了理论支撑或证据支持",
        "wrong": [
            "「{a}」和「{b}」相互矛盾，不能共存",
            "「{b}」的存在否定了「{a}」的正确性",
            "「{a}」和「{b}」没有任何逻辑联系",
        ],
    },
    "recommends_next": {
        "correct": "掌握「{a}」后，推荐继续学习「{b}」以深化理解",
        "wrong": [
            "必须先学「{b}」才能学「{a}」，顺序不可颠倒",
            "「{a}」和「{b}」学习顺序任意，没有推荐路径",
            "「{a}」和「{b}」属于互斥的学习方向",
        ],
    },
    "无关系": {
        "correct": "「{a}」和「{b}」之间没有直接的知识关联",
        "wrong": [
            "「{a}」是「{b}」的进阶内容",
            "「{a}」和「{b}」属于同一知识体系",
            "「{b}」包含了「{a}」的核心思想",
        ],
    },
}


def _generate_options(a_name: str, b_name: str, relation: str):
    """根据两个概念和实际关系，生成4个自然语言选项（A/B/C/D）"""
    tmpl = RELATION_TEMPLATES.get(relation, RELATION_TEMPLATES["无关系"])
    correct_text = tmpl["correct"].format(a=a_name, b=b_name)
    wrong_texts = [t.format(a=a_name, b=b_name) for t in tmpl["wrong"]]

    # 随机选3个错误选项
    random.shuffle(wrong_texts)
    selected_wrong = wrong_texts[:3]

    # 组装选项
    labels = ["A", "B", "C", "D"]
    random.shuffle(labels)
    option_texts = {}
    correct_label = labels[0]
    option_texts[correct_label] = correct_text
    for i, wt in enumerate(selected_wrong):
        option_texts[labels[i + 1]] = wt

    options = sorted(option_texts.keys())
    return options, option_texts, correct_label


class AnswerRequest(BaseModel):
    session_id: str
    node_a_id: int
    node_b_id: int
    answer: str


@router.get("/challenge")
async def get_challenge(
    session_id: Optional[str] = Query(None, description="会话ID"),
    db: AsyncSession = Depends(get_db),
):
    """随机生成一道概念关系题，4个自然语言选项"""
    if not session_id:
        raise HTTPException(status_code=400, detail="需要提供 session_id")

    graph = await _get_session_graph(db, session_id)
    edges = list(graph.graph.edges(data=True))
    nodes = list(graph.graph.nodes(data=True))

    if len(nodes) < 2:
        return {"empty": True, "message": "知识图谱中节点不足", "node_a": None, "node_b": None, "options": []}

    # 挑选概念对
    if random.random() < 0.5 and len(nodes) >= 2:
        a_idx, b_idx = random.sample(range(len(nodes)), 2)
        src, src_data = nodes[a_idx]
        tgt, tgt_data = nodes[b_idx]
        if graph.graph.has_edge(src, tgt):
            correct_relation = graph.graph.get_edge_data(src, tgt).get("relation_type", "related_to")
        elif graph.graph.has_edge(tgt, src):
            correct_relation = graph.graph.get_edge_data(tgt, src).get("relation_type", "related_to")
        else:
            correct_relation = "无关系"
    elif edges:
        src, tgt, data = random.choice(edges)
        correct_relation = data.get("relation_type", "related_to")
        src_data = graph.get_node(src) or {}
        tgt_data = graph.get_node(tgt) or {}
    else:
        a_idx, b_idx = random.sample(range(len(nodes)), 2)
        src, src_data = nodes[a_idx]
        tgt, tgt_data = nodes[b_idx]
        correct_relation = "无关系"

    a_name = src_data.get("name", f"Node {src}")
    b_name = tgt_data.get("name", f"Node {tgt}")

    options, option_labels, correct_option = _generate_options(a_name, b_name, correct_relation)

    return {
        "node_a": {"id": src, "name": a_name, "type": src_data.get("node_type", "concept"), "definition": src_data.get("definition", "")},
        "node_b": {"id": tgt, "name": b_name, "type": tgt_data.get("node_type", "concept"), "definition": tgt_data.get("definition", "")},
        "options": options,
        "option_labels": option_labels,
        "correct_option": correct_option,
    }


@router.post("/answer")
async def submit_answer(
    req: AnswerRequest,
    db: AsyncSession = Depends(get_db),
):
    """提交答案并更新分数"""
    graph = await _get_session_graph(db, req.session_id)

    edge_data = graph.graph.get_edge_data(req.node_a_id, req.node_b_id)
    if edge_data is None:
        edge_data = graph.graph.get_edge_data(req.node_b_id, req.node_a_id)

    real_relation = edge_data.get("relation_type", "related_to") if edge_data else "无关系"

    # 生成正确选项来验证
    a_name = (graph.get_node(req.node_a_id) or {}).get("name", f"Node {req.node_a_id}")
    b_name = (graph.get_node(req.node_b_id) or {}).get("name", f"Node {req.node_b_id}")
    _, _, correct_id = _generate_options(a_name, b_name, real_relation)

    is_correct = req.answer == correct_id

    # 更新游戏分数
    score = 0
    streak = 0
    try:
        result = await db.execute(
            select(GameScore).where(GameScore.session_id == req.session_id)
        )
        gs = result.scalars().first()
        if gs:
            gs.total_challenges += 1
            if is_correct:
                gs.correct_count += 1
                gs.streak += 1
                gs.best_streak = max(gs.best_streak, gs.streak)
                gs.score += 10 + gs.streak * 2
            else:
                gs.streak = 0
            score = gs.score
            streak = gs.streak
            await db.commit()
    except Exception:
        pass

    return {
        "correct": is_correct,
        "correct_answer": correct_id,
        "correct_answer_label": f"{correct_id}",
        "explanation": "",
        "score": score,
        "streak": streak,
    }


@router.get("/stats")
async def get_stats(
    session_id: Optional[str] = Query(None, description="会话ID"),
    db: AsyncSession = Depends(get_db),
):
    """获取用户游戏统计"""
    if not session_id:
        return {"total": 0, "correct": 0, "streak": 0, "best_streak": 0, "score": 0}
    result = await db.execute(
        select(GameScore).where(GameScore.session_id == session_id)
    )
    gs = result.scalars().first()
    if not gs:
        return {"total": 0, "correct": 0, "streak": 0, "best_streak": 0, "score": 0}
    return {
        "total": gs.total_challenges,
        "correct": gs.correct_count,
        "streak": gs.streak,
        "best_streak": gs.best_streak,
        "score": gs.score,
    }
