from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Credential, User
from app.schemas import CredentialCreate, CredentialUpdate, CredentialResponse
from app.auth import require_editor, get_current_user
from app.config import settings

# Simple encryption (in production, use proper encryption like Fernet)
from base64 import b64encode, b64decode


def encrypt_secret(value: str) -> str:
    """Simple obfuscation - in production use proper encryption"""
    if not value:
        return None
    return b64encode(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    """Simple deobfuscation - in production use proper decryption"""
    if not value:
        return None
    return b64decode(value.encode()).decode()


router = APIRouter()


@router.get("", response_model=List[CredentialResponse])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Credential).order_by(Credential.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=CredentialResponse)
async def create_credential(
    cred_data: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor)
):
    credential = Credential(
        name=cred_data.name,
        type=cred_data.type,
        username=cred_data.username,
        encrypted_password=encrypt_secret(cred_data.password) if cred_data.password else None,
        encrypted_ssh_key=encrypt_secret(cred_data.ssh_key) if cred_data.ssh_key else None,
        encrypted_token=encrypt_secret(cred_data.token) if cred_data.token else None,
    )
    db.add(credential)
    await db.commit()
    await db.refresh(credential)
    return credential


@router.get("/{cred_id}", response_model=CredentialResponse)
async def get_credential(
    cred_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Credential).where(Credential.id == cred_id))
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    return credential


@router.put("/{cred_id}", response_model=CredentialResponse)
async def update_credential(
    cred_id: str,
    cred_data: CredentialUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor)
):
    result = await db.execute(select(Credential).where(Credential.id == cred_id))
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    
    if cred_data.name:
        credential.name = cred_data.name
    if cred_data.type:
        credential.type = cred_data.type
    if cred_data.username is not None:
        credential.username = cred_data.username
    if cred_data.password:
        credential.encrypted_password = encrypt_secret(cred_data.password)
    if cred_data.ssh_key:
        credential.encrypted_ssh_key = encrypt_secret(cred_data.ssh_key)
    if cred_data.token:
        credential.encrypted_token = encrypt_secret(cred_data.token)
    
    await db.commit()
    await db.refresh(credential)
    return credential


@router.delete("/{cred_id}")
async def delete_credential(
    cred_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor)
):
    result = await db.execute(select(Credential).where(Credential.id == cred_id))
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    
    await db.delete(credential)
    await db.commit()
    return {"message": "Credential deleted"}
