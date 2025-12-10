from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict
from datetime import datetime
import asyncio
import json

from app.database import get_db, async_session
from app.models import SyncJob, JobRun, Credential, User, SyncStatus
from app.schemas import SyncJobCreate, SyncJobUpdate, SyncJobResponse, JobRunResponse, CompareResultSchema
from app.auth import require_editor, get_current_user
from app.config import settings
from app.services.git_sync import GitSyncService
from app.services.demo_sync import DemoSyncService
from app.routers.credentials import decrypt_secret


router = APIRouter()

# Store active WebSocket connections for live logs
active_connections: Dict[str, List[WebSocket]] = {}


@router.get("", response_model=List[SyncJobResponse])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(SyncJob).order_by(SyncJob.created_at.desc()))
    jobs = result.scalars().all()
    return [_job_to_response(job) for job in jobs]


@router.post("", response_model=SyncJobResponse)
async def create_job(
    job_data: SyncJobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor)
):
    job = SyncJob(
        name=job_data.name,
        source_url=job_data.source_url,
        source_credential_id=job_data.source_credential_id or None,
        destination_url=job_data.destination_url,
        destination_credential_id=job_data.destination_credential_id or None,
        branch_filter=job_data.branch_filter,
        tag_filter=job_data.tag_filter,
        cron_schedule=job_data.cron_schedule,
        enabled=job_data.enabled,
        last_run_status=SyncStatus.IDLE
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return _job_to_response(job)


@router.get("/{job_id}", response_model=SyncJobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(SyncJob).where(SyncJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@router.put("/{job_id}", response_model=SyncJobResponse)
async def update_job(
    job_id: str,
    job_data: SyncJobUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor)
):
    result = await db.execute(select(SyncJob).where(SyncJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    update_data = job_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        # Map schema field names to model field names
        model_key = key
        if key == "source_url":
            model_key = "source_url"
        elif key == "destination_url":
            model_key = "destination_url"
        setattr(job, model_key, value)
    
    await db.commit()
    await db.refresh(job)
    return _job_to_response(job)


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor)
):
    result = await db.execute(select(SyncJob).where(SyncJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    await db.delete(job)
    await db.commit()
    return {"message": "Job deleted"}


@router.post("/{job_id}/trigger")
async def trigger_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor)
):
    result = await db.execute(select(SyncJob).where(SyncJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not job.enabled:
        raise HTTPException(status_code=400, detail="Job is disabled")
    
    if job.last_run_status == SyncStatus.SYNCING:
        raise HTTPException(status_code=400, detail="Job is already running")
    
    # Create job run record
    run = JobRun(
        job_id=job_id,
        status=SyncStatus.SYNCING,
        message="Sync started manually...",
        logs=[]
    )
    db.add(run)
    
    # Update job status
    job.last_run_status = SyncStatus.SYNCING
    job.last_run_message = "Sync started manually..."
    
    await db.commit()
    await db.refresh(run)
    
    # Start async sync operation
    asyncio.create_task(_execute_sync(job_id, run.id))
    
    return {"run_id": run.id, "message": "Sync job triggered"}


@router.post("/{job_id}/compare", response_model=CompareResultSchema)
async def compare_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Compare source and destination repositories without syncing"""
    result = await db.execute(select(SyncJob).where(SyncJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Load credentials
    source_cred = None
    dest_cred = None
    
    if job.source_credential_id:
        result = await db.execute(select(Credential).where(Credential.id == job.source_credential_id))
        source_cred = result.scalar_one_or_none()
    
    if job.destination_credential_id:
        result = await db.execute(select(Credential).where(Credential.id == job.destination_credential_id))
        dest_cred = result.scalar_one_or_none()
    
    # Create sync service for comparison
    sync_service = GitSyncService(
        source_url=job.source_url,
        destination_url=job.destination_url,
        branch_filter=job.branch_filter,
        tag_filter=job.tag_filter,
        source_username=source_cred.username if source_cred else None,
        source_password=decrypt_secret(source_cred.encrypted_password) if source_cred and source_cred.encrypted_password else None,
        source_ssh_key=decrypt_secret(source_cred.encrypted_ssh_key) if source_cred and source_cred.encrypted_ssh_key else None,
        source_token=decrypt_secret(source_cred.encrypted_token) if source_cred and source_cred.encrypted_token else None,
        dest_username=dest_cred.username if dest_cred else None,
        dest_password=decrypt_secret(dest_cred.encrypted_password) if dest_cred and dest_cred.encrypted_password else None,
        dest_ssh_key=decrypt_secret(dest_cred.encrypted_ssh_key) if dest_cred and dest_cred.encrypted_ssh_key else None,
        dest_token=decrypt_secret(dest_cred.encrypted_token) if dest_cred and dest_cred.encrypted_token else None,
    )
    
    compare_result = await sync_service.compare()
    
    return CompareResultSchema(
        success=compare_result.success,
        message=compare_result.message,
        branches=[{
            "name": b.name,
            "source_commit": b.source_commit,
            "dest_commit": b.dest_commit,
            "ahead": b.ahead,
            "behind": b.behind,
            "status": b.status
        } for b in compare_result.branches],
        tags=[{
            "name": t.name,
            "source_commit": t.source_commit,
            "dest_commit": t.dest_commit,
            "status": t.status
        } for t in compare_result.tags],
        summary=compare_result.summary,
        logs=[{"timestamp": l["timestamp"], "level": l["level"], "message": l["message"]} for l in compare_result.logs]
    )


@router.get("/{job_id}/runs", response_model=List[JobRunResponse])
async def get_job_runs(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(JobRun)
        .where(JobRun.job_id == job_id)
        .order_by(JobRun.started_at.desc())
        .limit(50)
    )
    runs = result.scalars().all()
    return [_run_to_response(run) for run in runs]


@router.get("/{job_id}/runs/{run_id}", response_model=JobRunResponse)
async def get_job_run(
    job_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(JobRun).where(JobRun.id == run_id, JobRun.job_id == job_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_response(run)


@router.websocket("/{job_id}/logs")
async def websocket_logs(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for live log streaming"""
    await websocket.accept()
    
    if job_id not in active_connections:
        active_connections[job_id] = []
    active_connections[job_id].append(websocket)
    
    try:
        while True:
            # Keep connection alive, wait for messages (like close)
            data = await websocket.receive_text()
            if data == "close":
                break
    except WebSocketDisconnect:
        pass
    finally:
        if job_id in active_connections:
            active_connections[job_id].remove(websocket)
            if not active_connections[job_id]:
                del active_connections[job_id]


async def _broadcast_log(job_id: str, timestamp: str, level: str, message: str):
    """Broadcast log entry to all connected WebSocket clients"""
    if job_id in active_connections:
        log_entry = json.dumps({
            "timestamp": timestamp,
            "level": level,
            "message": message
        })
        for connection in active_connections[job_id]:
            try:
                await connection.send_text(log_entry)
            except:
                pass


async def _execute_sync(job_id: str, run_id: str):
    """Execute the actual sync operation"""
    async with async_session() as db:
        # Load job and credentials
        result = await db.execute(select(SyncJob).where(SyncJob.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return
        
        source_cred = None
        dest_cred = None
        
        if job.source_credential_id:
            result = await db.execute(select(Credential).where(Credential.id == job.source_credential_id))
            source_cred = result.scalar_one_or_none()
        
        if job.destination_credential_id:
            result = await db.execute(select(Credential).where(Credential.id == job.destination_credential_id))
            dest_cred = result.scalar_one_or_none()
        
        # Get the run record
        result = await db.execute(select(JobRun).where(JobRun.id == run_id))
        run = result.scalar_one_or_none()
        if not run:
            return
        
        # Create log callback for live updates - only broadcast, don't save (final logs saved at end)
        async def log_callback(timestamp: str, level: str, message: str):
            # Just broadcast to WebSocket clients for live view
            await _broadcast_log(job_id, timestamp, level, message)
        
        try:
            # Check if demo mode
            if settings.DEMO_MODE:
                sync_service = DemoSyncService(
                    log_callback=lambda t, l, m: asyncio.create_task(log_callback(t, l, m))
                )
            else:
                sync_service = GitSyncService(
                    source_url=job.source_url,
                    destination_url=job.destination_url,
                    branch_filter=job.branch_filter,
                    tag_filter=job.tag_filter,
                    source_username=source_cred.username if source_cred else None,
                    source_password=decrypt_secret(source_cred.encrypted_password) if source_cred and source_cred.encrypted_password else None,
                    source_ssh_key=decrypt_secret(source_cred.encrypted_ssh_key) if source_cred and source_cred.encrypted_ssh_key else None,
                    source_token=decrypt_secret(source_cred.encrypted_token) if source_cred and source_cred.encrypted_token else None,
                    dest_username=dest_cred.username if dest_cred else None,
                    dest_password=decrypt_secret(dest_cred.encrypted_password) if dest_cred and dest_cred.encrypted_password else None,
                    dest_ssh_key=decrypt_secret(dest_cred.encrypted_ssh_key) if dest_cred and dest_cred.encrypted_ssh_key else None,
                    dest_token=decrypt_secret(dest_cred.encrypted_token) if dest_cred and dest_cred.encrypted_token else None,
                    log_callback=lambda t, l, m: asyncio.create_task(log_callback(t, l, m))
                )
            
            sync_result = await sync_service.sync()
            
            # Update run record
            run.completed_at = datetime.utcnow()
            run.status = SyncStatus.SUCCESS if sync_result.success else SyncStatus.FAILED
            run.message = sync_result.message
            run.logs = sync_result.logs
            
            if sync_result.success:
                run.stats = {
                    "branches_synced": sync_result.branches_synced,
                    "tags_synced": sync_result.tags_synced,
                    "commits_pushed": sync_result.commits_pushed,
                    "files_changed": sync_result.files_changed,
                    "bytes_transferred": sync_result.bytes_transferred
                }
            
            # Update job status
            job.last_run_at = datetime.utcnow()
            job.last_run_status = run.status
            job.last_run_message = sync_result.message
            
            await db.commit()
            
            # Send final status via WebSocket
            await _broadcast_log(job_id, datetime.utcnow().isoformat() + "Z", 
                                "COMPLETE" if sync_result.success else "FAILED", 
                                sync_result.message)
            
        except Exception as e:
            # Handle any unexpected errors
            run.completed_at = datetime.utcnow()
            run.status = SyncStatus.FAILED
            run.message = str(e)
            
            job.last_run_at = datetime.utcnow()
            job.last_run_status = SyncStatus.FAILED
            job.last_run_message = str(e)
            
            await db.commit()
            
            await _broadcast_log(job_id, datetime.utcnow().isoformat() + "Z", "ERROR", str(e))


def _job_to_response(job: SyncJob) -> SyncJobResponse:
    """Convert job model to response schema"""
    return SyncJobResponse(
        id=job.id,
        name=job.name,
        source_url=job.source_url,
        source_credential_id=job.source_credential_id,
        destination_url=job.destination_url,
        destination_credential_id=job.destination_credential_id,
        branch_filter=job.branch_filter,
        tag_filter=job.tag_filter,
        cron_schedule=job.cron_schedule,
        enabled=job.enabled,
        last_run_at=job.last_run_at,
        last_run_status=job.last_run_status,
        last_run_message=job.last_run_message,
        created_at=job.created_at
    )


def _run_to_response(run: JobRun) -> JobRunResponse:
    """Convert run model to response schema"""
    from app.schemas import JobRunStats, JobRunLogEntry
    
    stats = None
    if run.stats:
        stats = JobRunStats(
            branches_synced=run.stats.get("branches_synced", 0),
            tags_synced=run.stats.get("tags_synced", 0),
            commits_pushed=run.stats.get("commits_pushed", 0),
            files_changed=run.stats.get("files_changed", 0),
            bytes_transferred=run.stats.get("bytes_transferred", 0)
        )
    
    logs = []
    if run.logs:
        for log in run.logs:
            logs.append(JobRunLogEntry(
                timestamp=log.get("timestamp", ""),
                level=log.get("level", "INFO"),
                message=log.get("message", "")
            ))
    
    return JobRunResponse(
        id=run.id,
        job_id=run.job_id,
        started_at=run.started_at,
        completed_at=run.completed_at,
        status=run.status,
        message=run.message,
        stats=stats,
        logs=logs
    )
