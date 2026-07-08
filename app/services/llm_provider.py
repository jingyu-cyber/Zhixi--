"""
BiliMind — 统一 LLM Provider 调度层

支持 DashScope (阿里云通义千问) 和 讯飞星火 Spark，通过 LLM_PROVIDER 环境变量切换。

使用方式:
    from app.services.llm_provider import get_llm_config, create_async_client, create_client
    api_key, base_url, model = get_llm_config()
    client = create_async_client()
"""

from __future__ import annotations

from openai import AsyncOpenAI, OpenAI

from app.config import settings


def get_llm_config() -> tuple[str, str, str]:
    """
    根据 LLM_PROVIDER 返回 (api_key, base_url, model)。

    返回:
        (api_key, base_url, model) 三元组
    """
    provider = settings.llm_provider.lower()

    if provider == "spark":
        api_key = settings.spark_api_key or settings.openai_api_key
        base_url = settings.spark_base_url
        model = settings.spark_model
    else:
        # 默认 dashscope / openai 兼容
        api_key = settings.openai_api_key
        base_url = settings.openai_base_url
        model = settings.llm_model

    return api_key, base_url, model


def create_async_client(timeout: float = 60.0) -> AsyncOpenAI:
    """创建异步 OpenAI 兼容客户端（用于 extractor / agent / compiler / learning_path）。"""
    api_key, base_url, _model = get_llm_config()
    return AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=timeout)


def create_client(timeout: float = 60.0) -> OpenAI:
    """创建同步 OpenAI 兼容客户端（用于 chat.py 非流式调用）。"""
    api_key, base_url, _model = get_llm_config()
    return OpenAI(api_key=api_key, base_url=base_url, timeout=timeout)


def get_model_name() -> str:
    """获取当前 Provider 的模型名。"""
    _api_key, _base_url, model = get_llm_config()
    return model


def get_provider_name() -> str:
    """获取当前 Provider 名称（用于日志/调试）。"""
    return settings.llm_provider.lower()
