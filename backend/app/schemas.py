from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models import UserRole, CredentialType, SyncStatus


# Auth Schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# User Schemas
class UserBase(BaseModel):
    username: str
    email: str
    role: UserRole


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[UserRole] = None
    password: Optional[str] = None


class UserResponse(UserBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Credential Schemas
class CredentialBase(BaseModel):
    name: str
    type: CredentialType
    username: Optional[str] = None


class CredentialCreate(CredentialBase):
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    token: Optional[str] = None


class CredentialUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[CredentialType] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    token: Optional[str] = None


class CredentialResponse(CredentialBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Sync Job Schemas
class SyncJobBase(BaseModel):
    name: str
    source_url: str
    source_credential_id: Optional[str] = None
    destination_url: str
    destination_credential_id: Optional[str] = None
    branch_filter: str = ".*"
    tag_filter: str = ""
    cron_schedule: str = "0 * * * *"
    enabled: bool = True


class SyncJobCreate(SyncJobBase):
    pass


class SyncJobUpdate(BaseModel):
    name: Optional[str] = None
    source_url: Optional[str] = None
    source_credential_id: Optional[str] = None
    destination_url: Optional[str] = None
    destination_credential_id: Optional[str] = None
    branch_filter: Optional[str] = None
    tag_filter: Optional[str] = None
    cron_schedule: Optional[str] = None
    enabled: Optional[bool] = None


class SyncJobResponse(SyncJobBase):
    id: str
    last_run_at: Optional[datetime] = None
    last_run_status: SyncStatus
    last_run_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Job Run Schemas
class JobRunStats(BaseModel):
    branches_synced: int = 0
    tags_synced: int = 0
    commits_pushed: int = 0
    files_changed: int = 0
    bytes_transferred: int = 0


class JobRunLogEntry(BaseModel):
    timestamp: str
    level: str
    message: str


class JobRunResponse(BaseModel):
    id: str
    job_id: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: SyncStatus
    message: Optional[str] = None
    stats: Optional[JobRunStats] = None
    logs: List[JobRunLogEntry] = []

    class Config:
        from_attributes = True


# Log Entry Schemas
class LogEntryResponse(BaseModel):
    id: str
    timestamp: datetime
    level: str
    source: Optional[str] = None
    message: str
    details: Optional[dict] = None

    class Config:
        from_attributes = True


# Settings Schemas
class AppSettingsSchema(BaseModel):
    git_timeout: int = 300
    max_retries: int = 3
    log_retention_days: int = 14
    demo_mode: bool = False


# Compare Schemas
class BranchComparisonSchema(BaseModel):
    name: str
    source_commit: Optional[str] = None
    dest_commit: Optional[str] = None
    ahead: int = 0
    behind: int = 0
    status: str = "synced"  # synced, ahead, behind, diverged, new_in_source, new_in_dest


class TagComparisonSchema(BaseModel):
    name: str
    source_commit: Optional[str] = None
    dest_commit: Optional[str] = None
    status: str = "synced"  # synced, new_in_source, new_in_dest, different


class CompareSummarySchema(BaseModel):
    total_branches: int = 0
    branches_synced: int = 0
    branches_ahead: int = 0
    branches_behind: int = 0
    branches_diverged: int = 0
    branches_new_in_source: int = 0
    branches_new_in_dest: int = 0
    total_tags: int = 0
    tags_synced: int = 0
    tags_new_in_source: int = 0
    tags_new_in_dest: int = 0
    tags_different: int = 0


class CompareResultSchema(BaseModel):
    success: bool
    message: str
    branches: List[BranchComparisonSchema] = []
    tags: List[TagComparisonSchema] = []
    summary: CompareSummarySchema = CompareSummarySchema()
    logs: List[JobRunLogEntry] = []
