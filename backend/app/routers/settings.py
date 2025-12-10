from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import AppSettings, User
from app.schemas import AppSettingsSchema
from app.auth import require_admin, get_current_user
from app.config import settings as app_config


router = APIRouter()


@router.get("", response_model=AppSettingsSchema)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Get settings from database or return defaults
    settings_dict = {
        "git_timeout": app_config.GIT_TIMEOUT,
        "max_retries": app_config.MAX_RETRIES,
        "log_retention_days": app_config.LOG_RETENTION_DAYS,
        "demo_mode": app_config.DEMO_MODE
    }
    
    # Override with database values if they exist
    result = await db.execute(select(AppSettings))
    db_settings = result.scalars().all()
    
    for setting in db_settings:
        if setting.key in settings_dict:
            settings_dict[setting.key] = setting.value
    
    return AppSettingsSchema(**settings_dict)


@router.put("", response_model=AppSettingsSchema)
async def update_settings(
    new_settings: AppSettingsSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    settings_data = new_settings.model_dump()
    
    for key, value in settings_data.items():
        result = await db.execute(select(AppSettings).where(AppSettings.key == key))
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.value = value
        else:
            db.add(AppSettings(key=key, value=value))
    
    await db.commit()
    
    # Update runtime config if demo_mode changed
    if "demo_mode" in settings_data:
        app_config.DEMO_MODE = settings_data["demo_mode"]
    
    return new_settings
