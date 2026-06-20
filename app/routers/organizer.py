"""
收藏整理分类中心路由 - 共享知识库
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.video_organizer import VideoOrganizerService

router = APIRouter(prefix="/organizer", tags=["收藏整理分类中心"])
SHARED = "00000000-0000-0000-0000-000000000000"

@router.get("/report")
async def get_organizer_report(
    session_id: str = Query(SHARED),
    folder_ids: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    parsed = None
    if folder_ids:
        parsed = [int(i) for i in folder_ids.split(",") if i.strip().isdigit()]
    service = VideoOrganizerService(db)
    return await service.build_report(session_id=SHARED, folder_ids=parsed)

@router.get("/export")
async def export_organizer_report(
    session_id: str = Query(SHARED),
    format: str = Query("json", pattern="^(json|markdown)$"),
    db: AsyncSession = Depends(get_db),
):
    service = VideoOrganizerService(db)
    try:
        body, media_type, filename = await service.export_report(session_id=SHARED, format_name=format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(content=body, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
