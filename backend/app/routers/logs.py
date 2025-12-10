from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from datetime import datetime, timedelta

from app.database import get_db
from app.models import LogEntry, User
from app.schemas import LogEntryResponse
from app.auth import get_current_user, require_admin
from app.config import settings


router = APIRouter()


@router.get("", response_model=List[LogEntryResponse])
async def get_logs(
    source: Optional[str] = Query(None, description="Filter by source (job_id or 'system')"),
    level: Optional[str] = Query(None, description="Filter by log level"),
    since: Optional[datetime] = Query(None, description="Get logs since this time"),
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(LogEntry).order_by(LogEntry.timestamp.desc()).limit(limit)
    
    if source:
        query = query.where(LogEntry.source == source)
    if level:
        query = query.where(LogEntry.level == level)
    if since:
        query = query.where(LogEntry.timestamp >= since)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("")
async def clear_logs(
    older_than_days: int = Query(None, description="Delete logs older than N days"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if older_than_days is None:
        older_than_days = settings.LOG_RETENTION_DAYS
    
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    
    result = await db.execute(
        delete(LogEntry).where(LogEntry.timestamp < cutoff)
    )
    await db.commit()
    
    return {"message": f"Deleted logs older than {older_than_days} days", "deleted": result.rowcount}


async def add_log(
    db: AsyncSession,
    level: str,
    message: str,
    source: str = "system",
    details: dict = None
):
    """Helper function to add log entries"""
    entry = LogEntry(
        level=level,
        message=message,
        source=source,
        details=details
    )
    db.add(entry)
    await db.commit()
