"""
Scheduler for cron-based job execution
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
import logging

from app.database import async_session
from app.models import SyncJob, JobRun, SyncStatus
from app.config import settings

logger = logging.getLogger(__name__)
scheduler: AsyncIOScheduler = None


async def start_scheduler():
    global scheduler
    scheduler = AsyncIOScheduler()
    
    # Add job to check and schedule sync jobs every minute
    scheduler.add_job(
        check_scheduled_jobs,
        'interval',
        minutes=1,
        id='check_scheduled_jobs'
    )
    
    scheduler.start()
    logger.info("Scheduler started")


async def stop_scheduler():
    global scheduler
    if scheduler:
        scheduler.shutdown()
        logger.info("Scheduler stopped")


async def check_scheduled_jobs():
    """Check for jobs that need to run based on cron schedule"""
    from app.routers.jobs import _execute_sync
    import asyncio
    from datetime import datetime
    from croniter import croniter
    
    try:
        async with async_session() as db:
            # Get all enabled jobs
            result = await db.execute(
                select(SyncJob).where(
                    SyncJob.enabled == True,
                    SyncJob.last_run_status != SyncStatus.SYNCING
                )
            )
            jobs = result.scalars().all()
            
            now = datetime.utcnow()
            
            for job in jobs:
                try:
                    # Check if job should run based on cron schedule
                    cron = croniter(job.cron_schedule, job.last_run_at or now)
                    next_run = cron.get_next(datetime)
                    
                    if next_run <= now:
                        logger.info(f"Triggering scheduled job: {job.name}")
                        
                        # Create job run
                        run = JobRun(
                            job_id=job.id,
                            status=SyncStatus.SYNCING,
                            message="Scheduled sync started...",
                            logs=[]
                        )
                        db.add(run)
                        
                        job.last_run_status = SyncStatus.SYNCING
                        job.last_run_message = "Scheduled sync started..."
                        
                        await db.commit()
                        await db.refresh(run)
                        
                        # Execute sync in background
                        asyncio.create_task(_execute_sync(job.id, run.id))
                        
                except Exception as e:
                    logger.error(f"Error checking schedule for job {job.name}: {e}")
                    
    except Exception as e:
        logger.error(f"Error in scheduler: {e}")
