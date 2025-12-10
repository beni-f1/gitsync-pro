"""
Demo mode service - provides fake data for UI testing
"""
import random
from datetime import datetime
from typing import List, Dict, Callable
from dataclasses import dataclass, field
import asyncio


@dataclass
class DemoSyncResult:
    success: bool
    message: str
    branches_synced: int = 0
    tags_synced: int = 0
    commits_pushed: int = 0
    files_changed: int = 0
    bytes_transferred: int = 0
    logs: List[Dict] = field(default_factory=list)


class DemoSyncService:
    """
    Fake sync service for demo mode - simulates git operations
    with realistic timing and random data.
    """
    
    def __init__(self, log_callback: Callable[[str, str, str], None] = None):
        self.log_callback = log_callback
        self.logs: List[Dict] = []
    
    def _log(self, level: str, message: str):
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level,
            "message": message
        }
        self.logs.append(entry)
        if self.log_callback:
            self.log_callback(entry["timestamp"], level, message)
    
    async def sync(self) -> DemoSyncResult:
        """Simulate a git sync operation with fake data"""
        result = DemoSyncResult(success=False, message="")
        
        # Determine random outcome
        success = random.random() > 0.3
        
        # Simulate connection to source
        self._log("INFO", "Starting sync job...")
        await asyncio.sleep(0.5)
        
        self._log("INFO", "Connecting to source repository...")
        await asyncio.sleep(1.2)
        
        self._log("INFO", "Fetching remote refs...")
        await asyncio.sleep(0.8)
        
        branches = random.randint(1, 5)
        tags = random.randint(0, 3)
        
        self._log("DEBUG", f"Found {branches} branches matching filter")
        await asyncio.sleep(0.3)
        
        if tags > 0:
            self._log("DEBUG", f"Found {tags} tags matching filter")
            await asyncio.sleep(0.2)
        
        self._log("INFO", "Connecting to destination repository...")
        await asyncio.sleep(1.0)
        
        if success:
            commits = random.randint(1, 20)
            files = random.randint(commits, commits + 50)
            bytes_transferred = random.randint(100000, 5000000)
            
            self._log("INFO", f"Pushing {commits} commits...")
            await asyncio.sleep(2.0)
            
            self._log("INFO", f"Transferred {files} files ({bytes_transferred / (1024*1024):.2f} MB)")
            await asyncio.sleep(0.5)
            
            self._log("INFO", "Sync completed successfully")
            
            result.success = True
            result.branches_synced = branches
            result.tags_synced = tags
            result.commits_pushed = commits
            result.files_changed = files
            result.bytes_transferred = bytes_transferred
            result.message = f"Synced {branches} branches, {tags} tags, {commits} commits"
        else:
            self._log("WARN", "Push operation taking longer than expected...")
            await asyncio.sleep(3.0)
            
            errors = [
                "Connection timed out while pushing to destination",
                "Authentication failed: Invalid credentials",
                "Remote rejected push: pre-receive hook declined",
                "Network error: Unable to resolve host",
                "Permission denied: Insufficient access rights"
            ]
            error_msg = random.choice(errors)
            
            self._log("ERROR", error_msg)
            
            result.branches_synced = branches
            result.tags_synced = tags
            result.message = error_msg
        
        result.logs = self.logs
        return result
