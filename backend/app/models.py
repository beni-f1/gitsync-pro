from sqlalchemy import Column, String, Boolean, DateTime, Integer, Enum as SQLEnum, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
import uuid

from app.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    VIEWER = "VIEWER"
    EDITOR = "EDITOR"
    ADMIN = "ADMIN"


class CredentialType(str, enum.Enum):
    USERNAME_PASSWORD = "USERNAME_PASSWORD"
    SSH_KEY = "SSH_KEY"
    PERSONAL_ACCESS_TOKEN = "PERSONAL_ACCESS_TOKEN"


class SyncStatus(str, enum.Enum):
    IDLE = "IDLE"
    SYNCING = "SYNCING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.VIEWER)
    created_at = Column(DateTime, default=datetime.utcnow)
    

class Credential(Base):
    __tablename__ = "credentials"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    type = Column(SQLEnum(CredentialType), nullable=False)
    username = Column(String, nullable=True)
    # Encrypted storage for secrets
    encrypted_password = Column(Text, nullable=True)
    encrypted_ssh_key = Column(Text, nullable=True)
    encrypted_token = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    jobs_as_source = relationship("SyncJob", back_populates="source_credential", foreign_keys="SyncJob.source_credential_id")
    jobs_as_dest = relationship("SyncJob", back_populates="destination_credential", foreign_keys="SyncJob.destination_credential_id")


class SyncJob(Base):
    __tablename__ = "sync_jobs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    source_url = Column(String, nullable=False)
    source_credential_id = Column(String, ForeignKey("credentials.id"), nullable=True)
    destination_url = Column(String, nullable=False)
    destination_credential_id = Column(String, ForeignKey("credentials.id"), nullable=True)
    branch_filter = Column(String, default=".*")
    tag_filter = Column(String, default="")
    cron_schedule = Column(String, default="0 * * * *")
    enabled = Column(Boolean, default=True)
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(SQLEnum(SyncStatus), default=SyncStatus.IDLE)
    last_run_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    source_credential = relationship("Credential", back_populates="jobs_as_source", foreign_keys=[source_credential_id])
    destination_credential = relationship("Credential", back_populates="jobs_as_dest", foreign_keys=[destination_credential_id])
    runs = relationship("JobRun", back_populates="job", cascade="all, delete-orphan")


class JobRun(Base):
    __tablename__ = "job_runs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    job_id = Column(String, ForeignKey("sync_jobs.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(SQLEnum(SyncStatus), default=SyncStatus.SYNCING)
    message = Column(String, nullable=True)
    stats = Column(JSON, nullable=True)  # {branches_synced, tags_synced, commits_pushed, files_changed, bytes_transferred}
    logs = Column(JSON, default=list)  # [{timestamp, level, message}]
    
    job = relationship("SyncJob", back_populates="runs")


class LogEntry(Base):
    __tablename__ = "log_entries"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    level = Column(String, default="INFO")
    source = Column(String, nullable=True)  # job_id or "system"
    message = Column(Text, nullable=False)
    details = Column(JSON, nullable=True)


class AppSettings(Base):
    __tablename__ = "app_settings"
    
    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False)
