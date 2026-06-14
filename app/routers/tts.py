"""
BiliMind TTS 路由 - 甜美中文女声语音合成
使用 Microsoft Edge TTS (免费、免 API Key、神经网络音色)
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from loguru import logger
import edge_tts
import io
import asyncio

router = APIRouter(prefix="/tts", tags=["TTS 语音合成"])

# 甜美女声配置: 晓伊(最甜) > 晓晓(最自然) > 晓晨(温柔治愈)
SWEET_VOICES = [
    "zh-CN-XiaoyiNeural",      # 晓伊 - 活泼可爱元气少女，最甜美
    "zh-CN-XiaoxiaoNeural",    # 晓晓 - 最自然清晰，温柔亲切
    "zh-CN-XiaochenNeural",    # 晓晨 - 温柔治愈
]


@router.get("/speak")
async def tts_speak(
    text: str = Query(..., description="要合成的文本", max_length=500),
    voice: str = Query("zh-CN-XiaoyiNeural", description="音色代码"),
    rate: str = Query("+5%", description="语速: -50% ~ +100%"),
    pitch: str = Query("+5Hz", description="音调: -20Hz ~ +20Hz"),
):
    """
    甜美中文女声 TTS — 返回 MP3 音频流

    默认使用 晓伊 (Xiaoyi) — 最甜美的元气少女音色
    可选: Xiaoxiao (温柔), Xiaochen (治愈)
    """
    if not text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")

    try:
        tts = edge_tts.Communicate(text.strip(), voice, rate=rate, pitch=pitch)
        buf = io.BytesIO()

        async for chunk in tts.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])

        if buf.tell() == 0:
            raise HTTPException(status_code=500, detail="TTS 未生成音频，请检查参数")

        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline",
                "X-TTS-Voice": voice,
                "Cache-Control": "public, max-age=3600",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS 合成失败: {e}")
        raise HTTPException(status_code=500, detail=f"语音合成失败: {str(e)}")


@router.get("/voices")
async def list_voices():
    """列出可用的甜美中文女声"""
    try:
        manager = await edge_tts.VoicesManager.create()
        zh_female = [
            {
                "short_name": v["ShortName"],
                "name": v["FriendlyName"],
                "locale": v["Locale"],
                "gender": v["Gender"],
            }
            for v in manager.voices
            if "zh-CN" in str(v.get("Locale", ""))
            and v.get("Gender") == "Female"
        ]
        return {"voices": zh_female, "default": SWEET_VOICES[0]}
    except Exception as e:
        logger.error(f"获取音色列表失败: {e}")
        # 返回已知的甜美女声列表作为回退
        return {
            "voices": [
                {"short_name": "zh-CN-XiaoyiNeural", "name": "晓伊 - 活泼可爱元气少女", "locale": "zh-CN", "gender": "Female"},
                {"short_name": "zh-CN-XiaoxiaoNeural", "name": "晓晓 - 温柔亲切最自然", "locale": "zh-CN", "gender": "Female"},
                {"short_name": "zh-CN-XiaochenNeural", "name": "晓晨 - 温柔治愈", "locale": "zh-CN", "gender": "Female"},
            ],
            "default": "zh-CN-XiaoyiNeural",
        }
