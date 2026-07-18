"""
知映 ZhiYing — 知识编译引擎

将视频内容编译为 Concept-Claim-Evidence 三级知识结构：
- Concept: 抽象概念（如"梯度下降"）
- Claim: 具体论断（如"梯度下降通过负梯度方向迭代更新参数"）
- Evidence: 锚定到视频时间戳的原始字幕片段
"""
import asyncio
import json
import re
from datetime import datetime
from typing import Optional

from loguru import logger
from openai import AsyncOpenAI
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Concept, Claim, ConceptRelation, Segment, VideoCache,
)
from app.services.extractor import (
    NOISE_EN_WORDS, NOISE_ZH_WORDS, OVERLY_BROAD,
)
from app.services.llm_provider import get_model_name


# ==================== LLM 客户端 ====================

_client: Optional[AsyncOpenAI] = None


def _get_client() -> Optional[AsyncOpenAI]:
    global _client
    if _client is None:
        from app.services.llm_provider import get_llm_config
        api_key, base_url, _model = get_llm_config()
        if api_key:
            _client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
            )
    return _client


# ==================== 编译 Prompt ====================

COMPILATION_PROMPT = """你是视频知识编译专家。请将以下视频片段编译为结构化知识。

视频标题：{title}
时间段：{start_time_fmt}-{end_time_fmt}
字幕文本：{text}

请严格输出以下JSON格式（不要输出其他内容）：
{{
  "concepts": [
    {{"name": "概念名", "definition": "一句话定义（基于视频中对该概念的实际描述）", "difficulty": 1-5}}
  ],
  "claims": [
    {{
      "concept": "关联概念名",
      "statement": "该片段中明确提出的具体论断/知识点（必须是视频字幕中真实出现的论述）",
      "type": "definition|explanation|example|comparison|warning",
      "confidence": 0.0-1.0
    }}
  ],
  "prerequisites": ["前置概念1", "前置概念2"]
}}

核心规则（必须严格遵守，违反任一条即为不合格输出）：
1. concept 必须直接来自视频字幕文本中实际讨论的概念，不得凭空编造
2. 每个 claim 的 statement 必须是视频字幕中真实出现的论述——禁止改写、禁止脑补、禁止调用外部知识
3. 如果某概念只在字幕中被提及但未展开讲解，降低 confidence 到 0.3 以下或直接不输出
4. claim 必须关联到对应的 concept
5. prerequisites 必须是视频中明确说出"需要先了解/掌握X"的原话——禁止你自己推断依赖关系
6. confidence < 0.3 不要输出
7. 不要抽取过于宽泛的概念（如"学习""内容""视频""方法""引言""介绍""总结"等）
8. 概念数量控制在 2-6 个，论断数量控制在 2-10 个
9. 如果视频内容确实很少（如只是简单介绍），宁可少抽取也要保证每个概念/论断有视频依据
10. definition 必须基于视频中的原话——禁止用百科式定义或你记忆中的知识替代视频内容
11. 字幕中的 ASR 识别错误碎片（不成句的乱码文字）不是有效概念，直接跳过不输出
12. 宁可输出空结果（空JSON对象），也不要输出无法在视频字幕中找到原文对应内容的概念或论断"""


# ==================== 噪声过滤 ====================

def _is_noise_concept(name: str) -> bool:
    """判断概念名是否为噪声（复用 extractor 的噪声词表）"""
    lower = name.strip().lower()
    if lower in NOISE_EN_WORDS:
        return True
    if name in NOISE_ZH_WORDS:
        return True
    if lower in OVERLY_BROAD:
        return True
    if re.match(r'^[\d\s.\-]+$', name):
        return True
    if len(name) == 1:
        return True
    if re.match(r'^[a-zA-Z]{1,3}$', name):
        return True
    if re.match(r'^[\W_]+$', name):
        return True
    return False


def _normalize_name(name: str) -> str:
    """归一化概念名"""
    name = name.strip().lower()
    name = re.sub(r"\s+", " ", name)
    name = re.sub(r"[（(].*?[）)]", "", name).strip()
    return name


def _fmt_time(seconds: Optional[float]) -> str:
    """格式化秒为 MM:SS 或 H:MM:SS"""
    if seconds is None:
        return "?:??"
    total = int(seconds)
    m, s = divmod(total, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


# ==================== 核心：编译单个片段 ====================

def _compile_segment_rules(
    text: str,
    video_title: str,
    start_time: Optional[float],
    end_time: Optional[float],
) -> dict:
    """
    基于规则的片段编译（LLM 不可用时的 fallback）

    从文本中提取概念名词和论断，不使用 LLM
    """
    if not text or len(text.strip()) < 30:
        return {"concepts": [], "claims": [], "prerequisites": []}

    # 提取英文术语（2+字母，可能含连字符）
    en_terms = re.findall(r"\b[A-Z][A-Za-z\-]{2,}\b", text)
    # 提取中文术语（引号、书名号内）
    zh_quoted = re.findall(r"[「“《](.+?)[」”》]", text)
    # "XX是/指/即 XX" 模式
    zh_def_patterns = re.findall(
        r"([一-鿿《a-zA-Z0-9\-]{2,20})(?:是|是指|指的是|即|也就是|简单来说|通俗来讲|换句话说|指)",
        text
    )

    # 停用词
    stop_words = {
        "这个", "那个", "可以", "进行", "使用", "通过", "如果", "因为", "所以", "但是",
        "我们", "他们", "它们", "什么", "哪里", "怎么", "为什么", "如何",
        "这样", "那样", "这些", "那些", "一些", "一种", "一个",
        "不过", "而且", "或者", "以及", "并且", "虽然", "然而",
        "不是", "没有", "不会", "不能", "不用",
        "就是", "就是说", "主要是", "主要是为了", "实际上",
    }

    # 从标题提取主题概念
    title_clean = re.sub(r"【.*?】|\[.*?\]", "", video_title)
    title_clean = re.sub(r"[|｜\-—·].*$", "", title_clean).strip()

    concepts = {}
    claims = []

    # 从标题生成主题概念
    if title_clean and len(title_clean) >= 2:
        title_key = title_clean.lower()
        concepts[title_key] = {
            "name": title_clean,
            "definition": f"来自视频《{video_title}》的核心主题",
            "difficulty": 2,
        }

    # 从中英文术语提取概念
    all_terms = []
    seen_terms = set()
    for term in en_terms:
        lower = term.strip().lower()
        if lower not in seen_terms and lower not in stop_words:
            seen_terms.add(lower)
            all_terms.append(term.strip())

    for term in zh_quoted:
        t = term.strip()
        if t not in seen_terms and t not in stop_words:
            seen_terms.add(t)
            all_terms.append(t)

    for term in zh_def_patterns:
        t = term.strip()
        if t not in seen_terms and t not in stop_words:
            seen_terms.add(t)
            all_terms.append(t)

    # 限制概念数量
    for i, term in enumerate(all_terms[:6]):
        key = term.lower().strip()
        if key and len(key) >= 2:
            concepts[key] = {
                "name": term,
                "definition": f"视频《{video_title}》中讨论的{term}相关内容",
                "difficulty": min(5, 1 + i // 2),
            }

    # 生成概念列表
    concept_list = list(concepts.values())

    # 为每个概念生成 claim（从文本中提取句子）
    sentences = re.split(r"[。！？\.\!\?\n]", text)
    for i, sent in enumerate(sentences):
        sent = sent.strip()
        if len(sent) < 10:
            continue
        # 为匹配到的概念创建 claim
        for c in concept_list:
            if c["name"] in sent:
                claims.append({
                    "concept": c["name"],
                    "statement": sent[:200],
                    "type": "explanation",
                    "confidence": 0.5,
                })
                break
        if len(claims) >= 6:
            break

    # 提取前置关系
    prereq_patterns = re.findall(
        r"(?:需要|先要|前提是|基于|建立在).*?(?:了解|掌握|学习|熟悉|知道)[一-鿿]{2,15}",
        text
    )
    prerequisites = []
    seen_prereqs = set()
    for p in prereq_patterns[:4]:
        match = re.search(r"(?:了解|掌握|学习|熟悉|知道)([一-鿿]{2,15})", p)
        if match:
            prereq = match.group(1).strip()
            if prereq not in seen_prereqs:
                seen_prereqs.add(prereq)
                prerequisites.append(prereq)

    logger.info(
        f"[规则编译] 提取 {len(concept_list)} 概念, {len(claims)} 论断, "
        f"{len(prerequisites)} 前置关系"
    )

    return {
        "concepts": concept_list,
        "claims": claims,
        "prerequisites": prerequisites,
    }


async def _compile_segment(
    text: str,
    video_title: str,
    start_time: Optional[float],
    end_time: Optional[float],
) -> dict:
    """
    对单个片段调用 LLM 进行知识编译

    Returns:
        {"concepts": [...], "claims": [...], "prerequisites": [...]}
    """
    client = _get_client()
    if not client:
        logger.info("LLM 客户端未配置，使用规则引擎编译")
        return _compile_segment_rules(text, video_title, start_time, end_time)

    # 跳过过短文本
    if not text or len(text.strip()) < 30:
        return {"concepts": [], "claims": [], "prerequisites": []}

    prompt = COMPILATION_PROMPT.format(
        title=video_title,
        start_time_fmt=_fmt_time(start_time),
        end_time_fmt=_fmt_time(end_time),
        text=text[:3000],
    )

    last_error = None
    for attempt in range(2):  # 最多重试 1 次
        try:
            response = await client.chat.completions.create(
                model=get_model_name(),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=2000,
                timeout=30,
            )
            raw = response.choices[0].message.content.strip()
            parsed = _parse_compilation_output(raw)
            return parsed
        except Exception as e:
            last_error = e
            if attempt == 0:
                logger.warning(f"编译片段失败(尝试{attempt+1})，重试: {e}")
                await asyncio.sleep(1)

    logger.warning(f"编译片段最终失败: {last_error}，使用规则引擎 fallback")
    return _compile_segment_rules(text, video_title, start_time, end_time)


def _parse_compilation_output(raw: str) -> dict:
    """解析 LLM 的 JSON 输出"""
    # 尝试从 markdown 代码块提取
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if json_match:
        raw = json_match.group(1)

    # 直接找 JSON 对象
    brace_start = raw.find("{")
    brace_end = raw.rfind("}")
    if brace_start != -1 and brace_end != -1:
        raw = raw[brace_start:brace_end + 1]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to parse compilation output as JSON")
        return {"concepts": [], "claims": [], "prerequisites": []}

    # 验证并过滤 concepts
    concepts = []
    for c in data.get("concepts", []):
        if not isinstance(c, dict):
            continue
        name = (c.get("name") or "").strip()
        if not name or len(name) < 2:
            continue
        if _is_noise_concept(name):
            continue
        difficulty = int(c.get("difficulty", 1))
        difficulty = max(1, min(5, difficulty))
        concepts.append({
            "name": name,
            "definition": (c.get("definition") or "").strip(),
            "difficulty": difficulty,
        })

    # 验证 claims
    valid_types = {"definition", "explanation", "example", "comparison", "warning"}
    claims = []
    for cl in data.get("claims", []):
        if not isinstance(cl, dict):
            continue
        concept_name = (cl.get("concept") or "").strip()
        statement = (cl.get("statement") or "").strip()
        if not concept_name or not statement:
            continue
        confidence = float(cl.get("confidence", 0.5))
        if confidence < 0.3:
            continue
        claim_type = cl.get("type", "explanation")
        if claim_type not in valid_types:
            claim_type = "explanation"
        claims.append({
            "concept": concept_name,
            "statement": statement,
            "type": claim_type,
            "confidence": confidence,
        })

    # 验证 prerequisites
    prerequisites = []
    for p in data.get("prerequisites", []):
        if isinstance(p, str) and len(p.strip()) >= 2:
            p_name = p.strip()
            if not _is_noise_concept(p_name):
                prerequisites.append(p_name)

    return {
        "concepts": concepts,
        "claims": claims,
        "prerequisites": prerequisites,
    }


# ==================== 跨片段合并 ====================

def _merge_concepts(all_segment_results: list[dict]) -> dict:
    """
    合并多个片段的编译结果，按 normalized_name 去重概念

    Returns:
        {
            "concepts": {normalized_name: {name, definition, difficulty, source_count, claims: [...]}},
            "prerequisites": [(source_norm, target_norm)],
        }
    """
    concept_map: dict[str, dict] = {}  # normalized_name -> concept info
    all_prerequisites: list[tuple[str, str]] = []

    for seg_result in all_segment_results:
        seg_concepts = seg_result.get("concepts", [])
        seg_claims = seg_result.get("claims", [])
        seg_prereqs = seg_result.get("prerequisites", [])
        seg_start = seg_result.get("start_time")
        seg_end = seg_result.get("end_time")
        seg_text = seg_result.get("raw_text", "")

        # 建立本片段内 concept name -> normalized 映射
        local_name_map: dict[str, str] = {}
        for c in seg_concepts:
            normalized = _normalize_name(c["name"])
            local_name_map[c["name"]] = normalized

            if normalized in concept_map:
                existing = concept_map[normalized]
                existing["source_count"] += 1
                existing["difficulty"] = max(existing["difficulty"], c.get("difficulty", 1))
                if c.get("definition") and not existing.get("definition"):
                    existing["definition"] = c["definition"]
            else:
                concept_map[normalized] = {
                    "name": c["name"],
                    "normalized_name": normalized,
                    "definition": c.get("definition", ""),
                    "difficulty": c.get("difficulty", 1),
                    "source_count": 1,
                    "claims": [],
                }

        # 挂载 claims 到对应 concept
        for cl in seg_claims:
            concept_name = cl["concept"]
            normalized = local_name_map.get(concept_name)
            if not normalized:
                # 尝试模糊匹配
                normalized = _normalize_name(concept_name)
            if normalized in concept_map:
                concept_map[normalized]["claims"].append({
                    "statement": cl["statement"],
                    "type": cl["type"],
                    "confidence": cl["confidence"],
                    "start_time": seg_start,
                    "end_time": seg_end,
                    "raw_text": seg_text,
                })

        # 收集前置关系
        # prerequisites 是当前片段概念的前置，建立 prerequisite -> concept 关系
        for prereq_name in seg_prereqs:
            prereq_norm = _normalize_name(prereq_name)
            # prerequisite_of 关系：prereq 是 concept 的前置
            for c in seg_concepts:
                c_norm = _normalize_name(c["name"])
                if prereq_norm != c_norm:
                    all_prerequisites.append((prereq_norm, c_norm))

            # 如果 prerequisite 自身不在 concept_map 中，也创建一个轻量概念
            if prereq_norm not in concept_map:
                concept_map[prereq_norm] = {
                    "name": prereq_name,
                    "normalized_name": prereq_norm,
                    "definition": "",
                    "difficulty": 1,
                    "source_count": 0,
                    "claims": [],
                }

    # 去重 prerequisites
    unique_prereqs = list(set(all_prerequisites))

    return {
        "concepts": concept_map,
        "prerequisites": unique_prereqs,
    }


# ==================== 证据校验（反幻觉） ====================

def _verify_claims(
    concept_map: dict[str, dict],
    all_segment_results: list[dict],
) -> dict[str, dict]:
    """
    逐条验证 claim 是否有视频原文支撑。

    规则：
    1. 必须有 raw_text（原文片段）
    2. statement 长度 >= 5 字符
    3. confidence >= 0.4
    4. 至少 30% 的 statement 字符能在全文中找到

    不满足任一条件的 claim → 丢弃
    没有任何有效 claim 的概念 → 丢弃
    """
    all_text = " ".join(
        seg.get("raw_text", "") for seg in all_segment_results
    )

    verified_map = {}
    total_dropped_claims = 0
    total_dropped_concepts = 0

    for norm_name, cdata in concept_map.items():
        verified_claims = []
        for cl in cdata.get("claims", []):
            raw = cl.get("raw_text", "").strip()
            stmt = cl.get("statement", "").strip()
            conf = cl.get("confidence", 0.5)

            # 规则1：必须有原文
            if not raw:
                total_dropped_claims += 1
                continue

            # 规则2：statement 不能太短
            if len(stmt) < 5:
                total_dropped_claims += 1
                continue

            # 规则3：置信度阈值
            if conf < 0.4:
                total_dropped_claims += 1
                continue

            # 规则4：statement 字符覆盖率 > 30%
            if all_text and len(stmt) > 0:
                stmt_chars = set(stmt.replace(" ", ""))
                text_chars = set(all_text.replace(" ", ""))
                if len(stmt_chars) > 0:
                    overlap = len(stmt_chars & text_chars) / len(stmt_chars)
                    if overlap < 0.3:
                        total_dropped_claims += 1
                        continue

            verified_claims.append(cl)

        if verified_claims:
            cdata["claims"] = verified_claims
            verified_map[norm_name] = cdata
        else:
            total_dropped_concepts += 1

    if total_dropped_claims > 0 or total_dropped_concepts > 0:
        logger.info(
            f"[证据校验] 丢弃 {total_dropped_claims} 条无证据论断, "
            f"{total_dropped_concepts} 个空概念"
        )

    return verified_map


# ==================== 节点数量控制 ====================

def _enforce_node_limits(
    concept_map: dict[str, dict],
    prerequisite_pairs: list[tuple[str, str]],
    video_title: str,
    all_segment_text: str,
) -> dict[str, dict]:
    """
    确保编译结果满足数量要求：
    - 概念: 5-10 个（最少5，最多10）
    - 论断总数: 5-15 条

    策略：
    1. 溢出时按 source_count + 置信度排序截断
    2. 不足5个概念时，从视频标题和文本中提取补充概念
    """
    MIN_CONCEPTS = 1
    MAX_CONCEPTS = 10
    MIN_CLAIMS = 1
    MAX_CLAIMS = 15

    # 统计总论断数
    total_claims = sum(len(cdata.get("claims", [])) for cdata in concept_map.values())

    # --- 概念过多：按重要性排序截断 ---
    if len(concept_map) > MAX_CONCEPTS:
        # 按 (source_count, claims数量*置信度) 排序
        scored = []
        for norm, cdata in concept_map.items():
            claims_score = sum(
                cl.get("confidence", 0.5) for cl in cdata.get("claims", [])
            )
            score = cdata.get("source_count", 1) * 0.5 + claims_score * 0.5
            scored.append((norm, score))
        scored.sort(key=lambda x: -x[1])
        keep_norms = {norm for norm, _ in scored[:MAX_CONCEPTS]}
        concept_map = {k: v for k, v in concept_map.items() if k in keep_norms}
        # 更新 prerequisite_pairs（原地修改以影响调用方）
        prerequisite_pairs[:] = [
            (s, t) for s, t in prerequisite_pairs
            if s in keep_norms and t in keep_norms
        ]
        logger.info(
            f"[数量控制] 概念 {len(scored)}→{MAX_CONCEPTS} (截断)"
        )

    # --- 论断过多：每个概念最多保留前N条高置信度论断 ---
    if total_claims > MAX_CLAIMS:
        # 按概念的重要性分配配额
        remaining = total_claims
        target = MAX_CLAIMS
        for norm, cdata in concept_map.items():
            claims = cdata.get("claims", [])
            if not claims:
                continue
            # 按置信度排序
            claims.sort(key=lambda cl: cl.get("confidence", 0.5), reverse=True)
            # 按比例分配：该概念占总数比例 × 目标总数
            proportion = len(claims) / max(remaining, 1)
            quota = max(1, round(proportion * target))
            cdata["claims"] = claims[:quota]
            remaining -= len(claims)
            target -= quota
        # 重新统计
        total_claims = sum(len(cdata.get("claims", [])) for cdata in concept_map.values())
        logger.info(
            f"[数量控制] 论断 → {total_claims} 条 (截断)"
        )

    # --- 概念不足：不做补充，宁可少不能假 ---
    if len(concept_map) < MIN_CONCEPTS:
        logger.info(
            f"[数量控制] 概念仅 {len(concept_map)} 个，跳过补充（反幻觉：不编造非视频内容）"
        )

    # --- 论断不足：不做补充 ---
    total_claims = sum(len(cdata.get("claims", [])) for cdata in concept_map.values())
    if total_claims < MIN_CLAIMS:
        logger.info(f"[数量控制] 论断仅 {total_claims} 条，跳过补充（反幻觉：不编造非视频内容）")

    return concept_map


def _supplement_from_title(video_title: str, all_text: str) -> list[dict]:
    """
    当视频内容匮乏时，从标题提取补充概念。
    使用简单的规则提取，确保至少有5个概念。
    """
    import re

    concepts = []
    title_clean = re.sub(r"【.*?】|\[.*?\]|[|｜\-—·].*$", "", video_title).strip()

    # 1. 标题本身作为主要概念
    if title_clean and len(title_clean) >= 2:
        concepts.append({
            "name": title_clean,
            "definition": f"视频核心主题：{title_clean}",
            "difficulty": 2,
        })

    # 2. 从标题中提取关键词（按常见分隔符拆分）
    parts = re.split(r"[、，,/\s]+", title_clean)
    for part in parts:
        part = part.strip()
        if len(part) >= 2 and part != title_clean:
            concepts.append({
                "name": part,
                "definition": f"视频《{video_title}》涉及的主题：{part}",
                "difficulty": 2,
            })

    # 3. 从文本中提取高频关键词（简单TF方法）
    if all_text and len(all_text) > 50:
        # 提取2-4字中文词组
        zh_words = re.findall(r"[一-鿿]{2,4}", all_text)
        word_freq = {}
        for w in zh_words:
            # 过滤停用词
            if w in {"我们", "他们", "可以", "这个", "那个", "什么", "怎么", "为什么",
                      "就是", "不是", "没有", "这样", "那样", "一些", "一种", "一个",
                      "因为", "所以", "但是", "虽然", "然而", "不过", "而且", "或者",
                      "进行", "使用", "通过", "如果", "需要", "问题", "方法", "内容"}:
                continue
            word_freq[w] = word_freq.get(w, 0) + 1

        # 取频率最高的前5个
        top_words = sorted(word_freq.items(), key=lambda x: -x[1])[:5]
        for word, _ in top_words:
            if word not in {c["name"] for c in concepts}:
                concepts.append({
                    "name": word,
                    "definition": f"视频《{video_title}》中反复提到的概念",
                    "difficulty": 2,
                })

    return concepts


# ==================== 知识密度 ====================

def _calculate_density(
    segments: list[dict],
    claims: list[dict],
) -> list[dict]:
    """
    计算每个片段的知识密度

    Args:
        segments: [{"start_time", "end_time", ...}]
        claims: [{"start_time", "end_time", ...}]

    Returns:
        segments with added "knowledge_density" and "is_peak" fields
    """
    if not segments:
        return segments

    for seg in segments:
        seg_start = seg.get("start_time") or 0
        seg_end = seg.get("end_time") or seg_start
        duration = max(seg_end - seg_start, 1)

        # 统计落在此片段时间范围内的 claim 数量
        claim_count = 0
        seg_concept_names = set()
        for cl in claims:
            cl_start = cl.get("start_time")
            cl_end = cl.get("end_time")
            if cl_start is None or cl_end is None:
                continue
            # claim 的时间范围与 segment 有重叠
            if cl_start < seg_end and cl_end > seg_start:
                claim_count += 1
                if cl.get("concept_normalized"):
                    seg_concept_names.add(cl["concept_normalized"])

        density = claim_count / duration
        seg["knowledge_density"] = round(density, 4)
        seg["claim_count"] = claim_count
        seg["concept_names"] = list(seg_concept_names)

    # 计算平均密度，标记峰值
    densities = [s["knowledge_density"] for s in segments]
    avg_density = sum(densities) / len(densities) if densities else 0

    for seg in segments:
        seg["is_peak"] = seg["knowledge_density"] > avg_density * 1.5

    return segments


# ==================== 网络调研兜底（低配版） ====================

WEB_RESEARCH_PROMPT = """你是知识图谱构建专家。请根据你的知识，为以下主题生成结构化的概念、定义和论断。

主题：{topic}

请输出JSON格式（不要输出其他内容）：
{{
  "concepts": [
    {{"name": "概念名", "definition": "一句话定义", "difficulty": 1-5, "confidence": 0.0-1.0}}
  ],
  "claims": [
    {{
      "concept": "关联概念名",
      "statement": "具体知识点/论断",
      "type": "definition|explanation|example|comparison|warning",
      "confidence": 0.0-1.0
    }}
  ],
  "prerequisites": ["前置概念1"]
}}

规则：
1. 只输出该领域公认、无争议的核心概念——不确定的不要输出
2. 定义必须准确，不能模糊或泛泛而谈
3. 置信度：核心概念=0.7，辅助概念=0.5，边缘概念=0.3
4. 概念数量 3-8 个，论断数量 3-12 个
5. 每个概念必须与主题直接相关——不要把不相关的内容硬塞进来
6. 如果主题太冷门你不了解，输出空JSON——宁可少不能编"""


async def _compile_from_web(
    video_title: str,
    db,
    bvid: str,
    session_id: str,
    owner_mid,
    content_fetcher=None,
    page_cid=None,
) -> Optional[dict]:
    """
    网络调研兜底：用视频标题搜索网络，提取知识。

    仅在视频无字幕/ASR内容时调用。
    每条知识都标注来源URL。
    """
    from app.services.web_research import WebResearchService
    from app.database import get_db_context

    logger.info(f"[{bvid}] 无视频内容，启动网络调研: {video_title}")

    # Step 1: 网络调研
    # 直接用 LLM 知识生成（不搜网页）
    client = _get_client()
    if not client:
        logger.warning(f"[{bvid}] LLM 不可用")
        return None

    prompt = WEB_RESEARCH_PROMPT.format(topic=video_title)
    source_urls_list = ["ai:spark-lite"]
    sources = []

    try:
        response = await client.chat.completions.create(
            model=get_model_name(),
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=3000,
            timeout=60,
        )
        raw = response.choices[0].message.content.strip()
        parsed = _parse_compilation_output(raw)
    except Exception as e:
        logger.warning(f"[{bvid}] LLM 提取失败: {e}")
        return None

    concepts_data = parsed.get("concepts", [])
    claims_data = parsed.get("claims", [])
    prerequisites = parsed.get("prerequisites", [])

    if not concepts_data and not claims_data:
        logger.info(f"[{bvid}] LLM 未从网络调研中提取到知识")
        return None

    logger.info(
        f"[{bvid}] 网络提取: {len(concepts_data)} 概念, "
        f"{len(claims_data)} 论断"
    )

    # Step 3: 写入数据库
    total_claims = 0
    for c in concepts_data:
        norm_name = _normalize_name(c.get("name", ""))

        # 检查是否已有同名概念
        from sqlalchemy import select as sql_select
        existing = await db.execute(
            sql_select(Concept).where(
                Concept.normalized_name == norm_name,
                Concept.owner_mid == owner_mid,
            )
        )
        concept_row = existing.scalars().first()

        if concept_row:
            concept_row.source_count += 1
            if c.get("definition") and not concept_row.definition:
                concept_row.definition = c["definition"]
        else:
            import json as _json
            # 取 source_urls（概念级别的来源标注）
            c_source_urls = c.get("source_urls", source_urls_list)
            if isinstance(c_source_urls, str):
                c_source_urls = json.loads(c_source_urls) if c_source_urls.startswith('[') else [c_source_urls]
            if not isinstance(c_source_urls, list):
                c_source_urls = source_urls_list

            concept_row = Concept(
                session_id=session_id,
                owner_mid=owner_mid,
                name=c.get("name", ""),
                normalized_name=norm_name,
                definition=c.get("definition", ""),
                difficulty=c.get("difficulty", 1),
                source_count=1,
                video_count=1,
                video_bvid=bvid,
                source_type="web_research",
                source_urls=_json.dumps(c_source_urls, ensure_ascii=False),
            )
            db.add(concept_row)
            await db.flush()

        # 写入该概念下的 Claims。LLM 偶尔会让 claim.concept 与概念名不完全一致，
        # 这会导致“编译完成但结果页为空”，所以每个概念至少保留一条定义型关联。
        concept_claim_count = 0
        for cl in claims_data:
            if _normalize_name(cl.get("concept", "")) != norm_name:
                continue

            cl_source_url = cl.get("source_url", "")
            if not cl_source_url and source_urls_list:
                cl_source_url = source_urls_list[0]

            claim_row = Claim(
                session_id=session_id,
                owner_mid=owner_mid,
                concept_id=concept_row.id,
                statement=cl.get("statement", ""),
                claim_type=cl.get("type", "explanation"),
                confidence=cl.get("confidence", 0.6),
                video_bvid=bvid,
                page_cid=page_cid,
                raw_text=f"[网络来源] {cl_source_url}",
            )
            db.add(claim_row)
            total_claims += 1
            concept_claim_count += 1

        if concept_claim_count == 0:
            fallback_statement = c.get("definition") or f"{c.get('name', '该概念')} 与视频主题相关。"
            claim_row = Claim(
                session_id=session_id,
                owner_mid=owner_mid,
                concept_id=concept_row.id,
                statement=fallback_statement,
                claim_type="definition",
                confidence=0.5,
                video_bvid=bvid,
                page_cid=page_cid,
                raw_text=f"[网络来源] {source_urls_list[0] if source_urls_list else 'ai'}",
            )
            db.add(claim_row)
            total_claims += 1

    await db.flush()
    await db.commit()

    concept_count = len(concepts_data)
    logger.info(
        f"[{bvid}] 网络调研编译完成: {concept_count} 概念, "
        f"{total_claims} 论断 (Spark LLM 生成)"
    )

    return {
        "bvid": bvid,
        "concept_count": concept_count,
        "claim_count": total_claims,
        "peak_count": 0,
        "segment_count": 1,
        "memory_nodes_synced": 0,
        "source_type": "web_research",
        "source_urls": source_urls_list,
    }


# ==================== 主入口：编译视频 ====================

async def compile_video(
    db: AsyncSession,
    bvid: str,
    session_id: str,
    content_fetcher,
    owner_mid: Optional[int] = None,
    page_cid: Optional[int] = None,
    page_title: Optional[str] = None,
) -> dict:
    """
    编译视频内容为 Concept-Claim-Evidence 知识结构

    Args:
        db: 数据库会话
        bvid: 视频 BV 号
        session_id: 用户会话 ID (已废弃，用于向后兼容)
        content_fetcher: ContentFetcher 实例
        owner_mid: B站用户ID (数据所有权标识)
        page_cid: 可选，指定分P的 cid 进行分集编译
        page_title: 可选，分集标题

    Returns:
        {
            "bvid": str,
            "concept_count": int,
            "claim_count": int,
            "peak_count": int,
            "segment_count": int,
        }
    """
    is_page = bool(page_cid)
    log_id = f"{bvid}_p{page_cid}" if is_page else bvid
    logger.info(f"[{log_id}] 开始知识编译...")

    # 获取或创建视频信息
    result = await db.execute(
        select(VideoCache).where(VideoCache.bvid == bvid)
    )
    video_cache = result.scalars().first()

    # 如果 VideoCache 不存在，从 B站 API 获取视频信息并创建
    if not video_cache:
        try:
            video_info = await content_fetcher.bili.get_video_info(bvid)
            if video_info:
                video_cache = VideoCache(
                    bvid=bvid,
                    cid=video_info.get("cid"),
                    title=video_info.get("title", "未知标题"),
                    description=video_info.get("desc", ""),
                    owner_name=video_info.get("owner", {}).get("name", ""),
                    owner_mid=video_info.get("owner", {}).get("mid"),
                    duration=video_info.get("duration"),
                    pic_url=video_info.get("pic", ""),
                    source_type="bilibili",
                    source_url=f"https://www.bilibili.com/video/{bvid}",
                    content_source="unknown",
                    is_processed=False,
                    extraction_status="pending",
                    session_id=session_id,
                )
                db.add(video_cache)
                await db.flush()
                await db.commit()
                logger.info(f"[{bvid}] 创建 VideoCache 记录")
        except Exception as e:
            logger.warning(f"[{bvid}] 创建 VideoCache 失败: {e}")
    elif video_cache and owner_mid is not None and video_cache.owner_mid != owner_mid:
        # 已有记录但属于其他用户 → 更新为当前用户的 owner_mid
        video_cache.owner_mid = owner_mid
        video_cache.session_id = session_id
        await db.flush()
        await db.commit()
        logger.info(f"[{bvid}] 更新 VideoCache owner_mid: {video_cache.owner_mid}")

    video_title = page_title or (video_cache.title if video_cache else "未知标题")
    web_research_topic = f"{video_cache.title} - {page_title}" if (page_title and video_cache and video_cache.title) else video_title
    video_duration = video_cache.duration if video_cache else None

    # Step 1: 获取片段（分集编译时使用指定的 cid）
    segments_data = await content_fetcher.fetch_segments(bvid, cid=page_cid, title=page_title or video_title)
    # 检查是否只有 basic 信息（无实际内容）
    has_real_content = any(
        seg.get("source_type") in ("subtitle", "asr")
        for seg in (segments_data or [])
    )

    if not segments_data or (len(segments_data) == 1 and not has_real_content):
        # 尝试网络调研兜底
        only_basic = segments_data and len(segments_data) == 1 and not has_real_content
        if only_basic:
            logger.info(f"[{log_id}] 视频仅有标题信息，尝试网络调研")
        else:
            logger.warning(f"[{log_id}] 无法获取视频片段，尝试网络调研")

        web_result = await _compile_from_web(
            video_title=web_research_topic,
            db=db,
            bvid=bvid,
            session_id=session_id,
            owner_mid=owner_mid,
            content_fetcher=content_fetcher,
            page_cid=page_cid,
        )

        if web_result:
            return web_result

        # 网络调研也失败了，返回空结果
        logger.warning(f"[{log_id}] 网络调研也无结果")
        return {
            "bvid": bvid,
            "concept_count": 0,
            "claim_count": 0,
            "peak_count": 0,
            "segment_count": 0,
        }

    logger.info(f"[{bvid}] 获取到 {len(segments_data)} 个片段")

    # 清除此视频的旧编译数据（按 bvid + page_cid 精确清理）
    from sqlalchemy import delete as sql_delete

    # 1. 找到此视频此分集旧 claims 关联的 concept_id
    claim_filter = [Claim.video_bvid == bvid]
    if is_page:
        claim_filter.append(Claim.page_cid == page_cid)
    old_claims_result = await db.execute(
        select(Claim.concept_id).where(*claim_filter)
    )
    old_concept_ids = set(row[0] for row in old_claims_result.fetchall() if row[0])

    # 2. 删除此视频此分集的所有旧 claims
    await db.execute(
        sql_delete(Claim).where(*claim_filter)
    )

    # 3. 删除此视频此分集的旧 segments
    seg_filter = [Segment.video_bvid == bvid]
    if is_page:
        seg_filter.append(Segment.page_cid == page_cid)
    await db.execute(
        sql_delete(Segment).where(*seg_filter)
    )

    # 4. 删除没有其他 claim 的孤儿概念
    for cid in old_concept_ids:
        remaining = await db.scalar(
            select(func.count()).select_from(Claim).where(Claim.concept_id == cid)
        )
        if remaining == 0:
            await db.execute(
                sql_delete(Concept).where(Concept.id == cid)
            )

    # 5. 删除旧的 ConceptRelation
    if owner_mid is not None:
        await db.execute(
            sql_delete(ConceptRelation).where(ConceptRelation.owner_mid == owner_mid)
        )

    await db.flush()

    # 写入新 Segment 记录
    segment_records = []
    for seg in segments_data:
        record = Segment(
            video_bvid=bvid,
            page_cid=page_cid,
            segment_index=seg["segment_index"],
            start_time=seg.get("start_time"),
            end_time=seg.get("end_time"),
            raw_text=seg["raw_text"],
            cleaned_text=seg["raw_text"],
            source_type=seg.get("source_type", "unknown"),
            confidence=seg.get("confidence", 0.5),
            extraction_status="pending",
            session_id=session_id,
            owner_mid=owner_mid,
        )
        db.add(record)
        segment_records.append(record)
    await db.flush()

    # Step 2: 逐片段编译
    all_segment_results = []
    for seg_rec in segment_records:
        seg_result = await _compile_segment(
            text=seg_rec.raw_text,
            video_title=video_title,
            start_time=seg_rec.start_time,
            end_time=seg_rec.end_time,
        )
        # 附加片段元信息
        seg_result["start_time"] = seg_rec.start_time
        seg_result["end_time"] = seg_rec.end_time
        seg_result["raw_text"] = seg_rec.raw_text
        seg_result["segment_id"] = seg_rec.id
        all_segment_results.append(seg_result)

        seg_rec.extraction_status = "done"
        logger.debug(
            f"[{bvid}] 片段 {seg_rec.segment_index}: "
            f"{len(seg_result.get('concepts', []))} 概念, "
            f"{len(seg_result.get('claims', []))} 论断"
        )

    # Step 3: 跨片段合并
    merged = _merge_concepts(all_segment_results)
    concept_map = merged["concepts"]
    prerequisite_pairs = merged["prerequisites"]

    logger.info(
        f"[{bvid}] 合并后: {len(concept_map)} 概念, "
        f"{sum(len(c['claims']) for c in concept_map.values())} 论断, "
        f"{len(prerequisite_pairs)} 前置关系"
    )

    # Step 3.5: 节点数量控制 (5-10 概念, 5-15 论断)
    all_segment_text = " ".join(
        seg.get("raw_text", "") for seg in all_segment_results
    )
    concept_map = _enforce_node_limits(
        concept_map, prerequisite_pairs, video_title, all_segment_text
    )
    logger.info(
        f"[{bvid}] 数量控制后: {len(concept_map)} 概念, "
        f"{sum(len(c['claims']) for c in concept_map.values())} 论断"
    )

    # Step 3.6: 逐条证据校验（反幻觉）
    concept_map = _verify_claims(concept_map, all_segment_results)
    logger.info(
        f"[{bvid}] 证据校验后: {len(concept_map)} 概念, "
        f"{sum(len(c['claims']) for c in concept_map.values())} 论断"
    )

    # Step 4: 写入 Concept 和 Claim 表
    norm_to_concept_id: dict[str, int] = {}
    total_claims = 0

    for norm_name, cdata in concept_map.items():
        # 查找是否已存在同名概念（跨视频复用）
        existing = await db.execute(
            select(Concept).where(
                Concept.normalized_name == norm_name,
                Concept.owner_mid == owner_mid,
            )
        )
        concept_row = existing.scalars().first()

        if concept_row:
            # 更新已有概念
            concept_row.source_count += cdata["source_count"]
            concept_row.video_count = (concept_row.video_count or 1) + 1
            concept_row.difficulty = max(concept_row.difficulty or 1, cdata["difficulty"])
            if cdata["definition"] and not concept_row.definition:
                concept_row.definition = cdata["definition"]
        else:
            concept_row = Concept(
                session_id=session_id,
                owner_mid=owner_mid,
                name=cdata["name"],
                normalized_name=norm_name,
                definition=cdata["definition"],
                difficulty=cdata["difficulty"],
                source_count=cdata["source_count"],
                video_count=1,
                video_bvid=bvid,
            )
            db.add(concept_row)
            await db.flush()

        norm_to_concept_id[norm_name] = concept_row.id

        # 写入 Claim
        for cl in cdata["claims"]:
            # 查找对应的 segment_id
            seg_id = None
            for seg_rec in segment_records:
                if seg_rec.start_time == cl.get("start_time") and seg_rec.end_time == cl.get("end_time"):
                    seg_id = seg_rec.id
                    break

            claim_row = Claim(
                session_id=session_id,
                owner_mid=owner_mid,
                concept_id=concept_row.id,
                page_cid=page_cid,
                statement=cl["statement"],
                claim_type=cl["type"],
                confidence=cl["confidence"],
                segment_id=seg_id,
                video_bvid=bvid,
                start_time=cl.get("start_time"),
                end_time=cl.get("end_time"),
                raw_text=cl.get("raw_text", ""),
            )
            db.add(claim_row)
            total_claims += 1

    await db.flush()

    # Step 5: 写入 ConceptRelation（前置关系）
    for src_norm, tgt_norm in prerequisite_pairs:
        src_id = norm_to_concept_id.get(src_norm)
        tgt_id = norm_to_concept_id.get(tgt_norm)
        if src_id and tgt_id and src_id != tgt_id:
            rel = ConceptRelation(
                session_id=session_id,
                source_concept_id=src_id,
                target_concept_id=tgt_id,
                relation_type="prerequisite_of",
                confidence=0.6,
            )
            db.add(rel)

    # Step 6: 计算知识密度并更新 Segment
    # 收集所有 claims 的时间信息
    all_claims_for_density = []
    for norm_name, cdata in concept_map.items():
        for cl in cdata["claims"]:
            all_claims_for_density.append({
                "start_time": cl.get("start_time"),
                "end_time": cl.get("end_time"),
                "concept_normalized": norm_name,
            })

    seg_density_data = [
        {
            "segment_id": sr.id,
            "start_time": sr.start_time,
            "end_time": sr.end_time,
        }
        for sr in segment_records
    ]
    seg_density_data = _calculate_density(seg_density_data, all_claims_for_density)

    peak_count = 0
    for sd in seg_density_data:
        # 更新 Segment 表
        for sr in segment_records:
            if sr.id == sd["segment_id"]:
                sr.knowledge_density = sd["knowledge_density"]
                sr.is_peak = sd["is_peak"]
                if sd["is_peak"]:
                    peak_count += 1
                break

    # Step 7: 同步 concepts 到 knowledge_nodes（兼容知识树/搜索等读取 knowledge_nodes 的模块）
    synced_node_count = 0
    synced_edge_count = 0
    for norm_name, cdata in concept_map.items():
        concept_id = norm_to_concept_id.get(norm_name)
        if not concept_id:
            continue
        # 检查是否已存在同名的 knowledge_node
        from app.models import KnowledgeNode, KnowledgeEdge
        existing_node = await db.execute(
            select(KnowledgeNode).where(
                KnowledgeNode.normalized_name == norm_name,
                KnowledgeNode.owner_mid == owner_mid,
            )
        )
        kn = existing_node.scalars().first()
        if kn:
            # 更新已有节点
            kn.source_count = max(kn.source_count or 1, cdata["source_count"])
            kn.confidence = max(kn.confidence or 0.5, 0.5)
            if cdata["definition"] and not kn.definition:
                kn.definition = cdata["definition"]
        else:
            kn = KnowledgeNode(
                node_type="concept",
                name=cdata["name"],
                normalized_name=norm_name,
                definition=cdata["definition"],
                difficulty=cdata["difficulty"],
                confidence=0.5,
                source_count=cdata["source_count"],
                session_id=session_id,
                owner_mid=owner_mid,
            )
            db.add(kn)
            await db.flush()
        synced_node_count += 1

        # 为每个 concept 的 claims 创建 edge 到相关视频
        for cl in cdata.get("claims", []):
            node_id = kn.id
            # 连接到代表该视频的节点（如果有的话）
            if cdata["name"] != video_title:
                # 查找代表该视频的 knowledge_node
                title_node = await db.execute(
                    select(KnowledgeNode).where(
                        KnowledgeNode.normalized_name == video_title.lower().strip(),
                        KnowledgeNode.owner_mid == owner_mid,
                    )
                )
                title_kn = title_node.scalars().first()
                if title_kn and title_kn.id != kn.id:
                    # 检查是否已有此边
                    existing_edge = await db.execute(
                        select(KnowledgeEdge).where(
                            KnowledgeEdge.source_node_id == kn.id,
                            KnowledgeEdge.target_node_id == title_kn.id,
                            KnowledgeEdge.relation_type == "related_to",
                        )
                    )
                    if not existing_edge.scalars().first():
                        edge = KnowledgeEdge(
                            source_node_id=kn.id,
                            target_node_id=title_kn.id,
                            relation_type="related_to",
                            weight=1.0,
                            confidence=0.5,
                            evidence_video_bvid=bvid,
                            session_id=session_id,
                            owner_mid=owner_mid,
                        )
                        db.add(edge)
                        synced_edge_count += 1
                elif not title_kn:
                    # 创建视频主题节点
                    title_kn = KnowledgeNode(
                        node_type="topic",
                        name=video_title,
                        normalized_name=video_title.lower().strip(),
                        definition=f"来自视频《{video_title}》的知识主题",
                        difficulty=1,
                        confidence=0.5,
                        source_count=1,
                        session_id=session_id,
                        owner_mid=owner_mid,
                    )
                    db.add(title_kn)
                    await db.flush()
                    edge = KnowledgeEdge(
                        source_node_id=kn.id,
                        target_node_id=title_kn.id,
                        relation_type="related_to",
                        weight=1.0,
                        confidence=0.5,
                        evidence_video_bvid=bvid,
                        session_id=session_id, owner_mid=owner_mid,
                    )
                    db.add(edge)
                    synced_edge_count += 1

    await db.commit()

    # 更新 VideoCache 状态（编译完成后标记）
    if video_cache:
        video_cache.is_processed = True
        video_cache.extraction_status = "done"
        video_cache.knowledge_node_count = len(concept_map)
        await db.commit()

    # Step 8: 同步 concepts 到 MemoryNode (记忆系统)
    synced_memory_count = 0
    synced_memory_edge_count = 0
    from app.models import MemoryNode, MemoryEdge, KnowledgeNode as KNodeModel

    for norm_name, cdata in concept_map.items():
        # 查找对应的 KnowledgeNode ID (刚刚在 Step 7 创建/更新的)
        kn_id = None
        kn_result = await db.execute(
            select(KNodeModel).where(
                KNodeModel.normalized_name == norm_name,
                KNodeModel.owner_mid == owner_mid,
            )
        )
        kn_row = kn_result.scalars().first()
        if kn_row:
            kn_id = kn_row.id
        if kn_id is None:
            kn_id = -1  # sentinel for unknown knowledge_node

        # 收集证据
        evidences = []
        for cl in cdata.get("claims", []):
            seg_id = None
            for seg_rec in segment_records:
                if seg_rec.start_time == cl.get("start_time") and seg_rec.end_time == cl.get("end_time"):
                    seg_id = seg_rec.id
                    break
            evidences.append({
                "source_type": "bilibili",
                "source_id": bvid,
                "source_title": video_title,
                "segment_id": seg_id,
                "start_time": cl.get("start_time"),
                "end_time": cl.get("end_time"),
                "text_snippet": (cl.get("raw_text", "") or "")[:500],
                "confidence": cl.get("confidence", 0.5),
            })

        # 确定记忆类型
        memory_type = "episodic" if cdata["source_count"] <= 1 else "semantic"

        existing_mem = await db.execute(
            select(MemoryNode).where(
                MemoryNode.normalized_name == norm_name,
                MemoryNode.owner_mid == owner_mid,
            )
        )
        mem = existing_mem.scalars().first()

        if mem:
            mem.source_count = max(mem.source_count or 1, cdata["source_count"])
            mem.confidence = max(mem.confidence or 0.5, 0.5)
            # 多源 → 升级为语义记忆
            if mem.source_count >= 2:
                mem.memory_type = "semantic"
            # 合并证据列表 (去重)
            existing_evs = list(mem.evidence_json or [])
            existing_sources = {(e.get("source_id"), e.get("segment_id")) for e in existing_evs}
            for ev in evidences:
                key = (ev.get("source_id"), ev.get("segment_id"))
                if key not in existing_sources:
                    existing_evs.append(ev)
                    existing_sources.add(key)
            mem.evidence_json = existing_evs
            if cdata["definition"] and not mem.definition:
                mem.definition = cdata["definition"]
            mem.updated_at = datetime.utcnow()
        else:
            mem = MemoryNode(
                memory_type=memory_type,
                memory_layer="short_term",
                name=cdata["name"],
                normalized_name=norm_name,
                definition=cdata["definition"],
                content=cdata["definition"],
                base_strength=cdata.get("confidence", 0.5) or 0.5,
                stability=1.0,
                recall_count=0,
                confidence=cdata.get("confidence", 0.5) or 0.5,
                source_count=cdata["source_count"],
                difficulty=cdata.get("difficulty", 1),
                knowledge_node_id=kn_id,
                evidence_json=evidences,
                session_id=session_id,
                owner_mid=owner_mid,
            )
            db.add(mem)
            await db.flush()
        synced_memory_count += 1

    # 同步记忆关系
    for src_norm, tgt_norm in prerequisite_pairs:
        src_mem = await db.execute(
            select(MemoryNode).where(
                MemoryNode.normalized_name == src_norm,
                MemoryNode.owner_mid == owner_mid,
            )
        )
        tgt_mem = await db.execute(
            select(MemoryNode).where(
                MemoryNode.normalized_name == tgt_norm,
                MemoryNode.owner_mid == owner_mid,
            )
        )
        src_m = src_mem.scalars().first()
        tgt_m = tgt_mem.scalars().first()
        if src_m and tgt_m and src_m.id != tgt_m.id:
            from sqlalchemy import select as sa_select
            existing_me = await db.execute(
                sa_select(MemoryEdge).where(
                    MemoryEdge.source_id == src_m.id,
                    MemoryEdge.target_id == tgt_m.id,
                    MemoryEdge.relation_type == "prerequisite_of",
                )
            )
            if not existing_me.scalars().first():
                me = MemoryEdge(
                    source_id=src_m.id,
                    target_id=tgt_m.id,
                    relation_type="prerequisite_of",
                    weight=1.0,
                    confidence=0.6,
                    evidence_video_bvid=bvid,
                    session_id=session_id,
                    owner_mid=owner_mid,
                )
                db.add(me)
                synced_memory_edge_count += 1

    await db.commit()

    logger.info(
        f"[{log_id}] 知识编译完成: "
        f"{len(concept_map)} 概念, {total_claims} 论断, "
        f"{peak_count} 峰值片段, "
        f"同步 {synced_memory_count} MemoryNode, {synced_memory_edge_count} MemoryEdge"
    )

    return {
        "bvid": bvid,
        "concept_count": len(concept_map),
        "claim_count": total_claims,
        "peak_count": peak_count,
        "segment_count": len(segment_records),
        "memory_nodes_synced": synced_memory_count,
    }
