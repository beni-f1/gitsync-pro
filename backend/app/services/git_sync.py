"""
Git synchronization service - performs actual git operations
"""
import os
import re
import shutil
import tempfile
import subprocess
from datetime import datetime
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass, field
import asyncio

from app.config import settings


@dataclass
class SyncResult:
    success: bool
    message: str
    branches_synced: int = 0
    tags_synced: int = 0
    commits_pushed: int = 0
    files_changed: int = 0
    bytes_transferred: int = 0
    logs: List[Dict] = field(default_factory=list)


@dataclass
class BranchComparison:
    name: str
    source_commit: Optional[str] = None
    dest_commit: Optional[str] = None
    ahead: int = 0  # commits in source not in dest
    behind: int = 0  # commits in dest not in source
    status: str = "synced"  # synced, ahead, behind, diverged, new_in_source, new_in_dest


@dataclass
class TagComparison:
    name: str
    source_commit: Optional[str] = None
    dest_commit: Optional[str] = None
    status: str = "synced"  # synced, new_in_source, new_in_dest, different


@dataclass
class CompareResult:
    success: bool
    message: str
    branches: List[BranchComparison] = field(default_factory=list)
    tags: List[TagComparison] = field(default_factory=list)
    summary: Dict = field(default_factory=dict)
    logs: List[Dict] = field(default_factory=list)


class GitSyncService:
    def __init__(
        self,
        source_url: str,
        destination_url: str,
        branch_filter: str = ".*",
        tag_filter: str = "",
        source_username: str = None,
        source_password: str = None,
        source_ssh_key: str = None,
        source_token: str = None,
        dest_username: str = None,
        dest_password: str = None,
        dest_ssh_key: str = None,
        dest_token: str = None,
        log_callback: Callable[[str, str, str], None] = None
    ):
        self.source_url = source_url
        self.destination_url = destination_url
        self.branch_filter = branch_filter
        self.tag_filter = tag_filter
        self.source_creds = {
            "username": source_username,
            "password": source_password,
            "ssh_key": source_ssh_key,
            "token": source_token
        }
        self.dest_creds = {
            "username": dest_username,
            "password": dest_password,
            "ssh_key": dest_ssh_key,
            "token": dest_token
        }
        self.log_callback = log_callback
        self.logs: List[Dict] = []
        self.work_dir: Optional[str] = None
        
    def _log(self, level: str, message: str):
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": level,
            "message": message
        }
        self.logs.append(entry)
        if self.log_callback:
            self.log_callback(entry["timestamp"], level, message)
    
    def _build_auth_url(self, url: str, creds: Dict) -> str:
        """Build URL with embedded credentials for HTTP/HTTPS repos"""
        from urllib.parse import quote
        
        if url.startswith("git@") or url.startswith("ssh://"):
            return url  # SSH URL, handled differently
        
        # Handle both http:// and https://
        if creds.get("token"):
            # Use token as password with 'git' or 'oauth2' as username
            token = quote(creds['token'], safe='')
            if "github.com" in url:
                url = url.replace("https://", f"https://oauth2:{token}@")
                url = url.replace("http://", f"http://oauth2:{token}@")
            elif "gitlab" in url:
                url = url.replace("https://", f"https://oauth2:{token}@")
                url = url.replace("http://", f"http://oauth2:{token}@")
            else:
                url = url.replace("https://", f"https://git:{token}@")
                url = url.replace("http://", f"http://git:{token}@")
        elif creds.get("username") and creds.get("password"):
            username = quote(creds['username'], safe='')
            password = quote(creds['password'], safe='')
            url = url.replace("https://", f"https://{username}:{password}@")
            url = url.replace("http://", f"http://{username}:{password}@")
        
        return url
    
    def _setup_ssh_key(self, ssh_key: str) -> str:
        """Write SSH key to temp file and return path"""
        key_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.key')
        key_file.write(ssh_key)
        key_file.close()
        os.chmod(key_file.name, 0o600)
        return key_file.name
    
    def _run_git(self, args: List[str], cwd: str = None, ssh_key_path: str = None) -> subprocess.CompletedProcess:
        """Run a git command with optional SSH key"""
        env = os.environ.copy()
        if ssh_key_path:
            env["GIT_SSH_COMMAND"] = f"ssh -i {ssh_key_path} -o StrictHostKeyChecking=no"
        
        cmd = ["git"] + args
        # Sanitize command for logging (hide credentials)
        sanitized_args = ' '.join(args)
        sanitized_args = re.sub(r'https://[^:]+:[^@]+@', 'https://***:***@', sanitized_args)
        sanitized_args = re.sub(r'http://[^:]+:[^@]+@', 'http://***:***@', sanitized_args)
        self._log("DEBUG", f"Running: git {sanitized_args}")
        
        result = subprocess.run(
            cmd,
            cwd=cwd or self.work_dir,
            capture_output=True,
            text=True,
            env=env,
            timeout=settings.GIT_TIMEOUT
        )
        return result
    
    async def sync(self) -> SyncResult:
        """Perform the actual git sync operation"""
        result = SyncResult(success=False, message="")
        source_ssh_key_path = None
        dest_ssh_key_path = None
        
        try:
            # Create temporary work directory
            self.work_dir = tempfile.mkdtemp(prefix="gitsync_")
            self._log("INFO", "Starting sync job...")
            
            # Setup SSH keys if needed
            if self.source_creds.get("ssh_key"):
                source_ssh_key_path = self._setup_ssh_key(self.source_creds["ssh_key"])
            if self.dest_creds.get("ssh_key"):
                dest_ssh_key_path = self._setup_ssh_key(self.dest_creds["ssh_key"])
            
            # Build authenticated URLs
            source_url = self._build_auth_url(self.source_url, self.source_creds)
            dest_url = self._build_auth_url(self.destination_url, self.dest_creds)
            
            # Clone source repository (mirror mode)
            self._log("INFO", "Connecting to source repository...")
            await asyncio.sleep(0.1)  # Allow log callback to process
            
            clone_result = self._run_git(
                ["clone", "--mirror", source_url, "repo"],
                cwd=self.work_dir,
                ssh_key_path=source_ssh_key_path
            )
            
            if clone_result.returncode != 0:
                error_msg = clone_result.stderr.strip() or "Failed to clone source repository"
                # Sanitize credentials from error message
                error_msg = self._sanitize_output(error_msg)
                self._log("ERROR", error_msg)
                result.message = error_msg
                result.logs = self.logs
                return result
            
            self._log("INFO", "Fetching remote refs...")
            await asyncio.sleep(0.1)
            
            repo_dir = os.path.join(self.work_dir, "repo")
            
            # Get branches and tags
            branches = self._get_matching_refs(repo_dir, "heads", self.branch_filter)
            tags = self._get_matching_refs(repo_dir, "tags", self.tag_filter) if self.tag_filter else []
            
            self._log("DEBUG", f"Found {len(branches)} branches matching filter")
            if tags:
                self._log("DEBUG", f"Found {len(tags)} tags matching filter")
            
            result.branches_synced = len(branches)
            result.tags_synced = len(tags)
            
            # Add destination remote
            self._log("INFO", "Connecting to destination repository...")
            await asyncio.sleep(0.1)
            
            add_remote = self._run_git(
                ["remote", "add", "destination", dest_url],
                cwd=repo_dir,
                ssh_key_path=dest_ssh_key_path
            )
            
            # Push to destination
            self._log("INFO", "Pushing changes to destination...")
            await asyncio.sleep(0.1)
            
            # Build refspecs for branches and tags
            refspecs = []
            for branch in branches:
                refspecs.append(f"refs/heads/{branch}:refs/heads/{branch}")
            for tag in tags:
                refspecs.append(f"refs/tags/{tag}:refs/tags/{tag}")
            
            if not refspecs:
                self._log("WARN", "No refs to push")
                result.success = True
                result.message = "No matching branches or tags to sync"
                result.logs = self.logs
                return result
            
            push_result = self._run_git(
                ["push", "destination", "--force"] + refspecs,
                cwd=repo_dir,
                ssh_key_path=dest_ssh_key_path
            )
            
            if push_result.returncode != 0:
                error_msg = push_result.stderr.strip() or "Failed to push to destination"
                error_msg = self._sanitize_output(error_msg)
                self._log("ERROR", error_msg)
                result.message = error_msg
                result.logs = self.logs
                return result
            
            # Parse push output for stats
            push_output = push_result.stderr + push_result.stdout
            commits, files, bytes_transferred = self._parse_push_stats(push_output)
            
            result.commits_pushed = commits
            result.files_changed = files
            result.bytes_transferred = bytes_transferred
            
            if commits > 0:
                self._log("INFO", f"Pushed {commits} commits")
            if bytes_transferred > 0:
                self._log("INFO", f"Transferred {self._format_bytes(bytes_transferred)}")
            
            self._log("INFO", "Sync completed successfully")
            
            result.success = True
            result.message = f"Synced {len(branches)} branches, {len(tags)} tags, {commits} commits"
            result.logs = self.logs
            
        except subprocess.TimeoutExpired:
            self._log("ERROR", "Git operation timed out")
            result.message = "Git operation timed out"
            result.logs = self.logs
            
        except Exception as e:
            error_msg = str(e)
            self._log("ERROR", f"Sync failed: {error_msg}")
            result.message = error_msg
            result.logs = self.logs
            
        finally:
            # Cleanup
            if source_ssh_key_path and os.path.exists(source_ssh_key_path):
                os.unlink(source_ssh_key_path)
            if dest_ssh_key_path and os.path.exists(dest_ssh_key_path):
                os.unlink(dest_ssh_key_path)
            if self.work_dir and os.path.exists(self.work_dir):
                shutil.rmtree(self.work_dir, ignore_errors=True)
        
        return result

    async def compare(self) -> CompareResult:
        """Compare source and destination repositories without syncing"""
        result = CompareResult(success=False, message="")
        source_ssh_key_path = None
        dest_ssh_key_path = None
        
        try:
            # Create temporary work directory
            self.work_dir = tempfile.mkdtemp(prefix="gitsync_compare_")
            self._log("INFO", "Starting repository comparison...")
            
            # Setup SSH keys if needed
            if self.source_creds.get("ssh_key"):
                source_ssh_key_path = self._setup_ssh_key(self.source_creds["ssh_key"])
            if self.dest_creds.get("ssh_key"):
                dest_ssh_key_path = self._setup_ssh_key(self.dest_creds["ssh_key"])
            
            # Build authenticated URLs
            source_url = self._build_auth_url(self.source_url, self.source_creds)
            dest_url = self._build_auth_url(self.destination_url, self.dest_creds)
            
            # Clone source repository (bare)
            self._log("INFO", "Fetching source repository...")
            await asyncio.sleep(0.1)
            
            source_dir = os.path.join(self.work_dir, "source")
            clone_source = self._run_git(
                ["clone", "--bare", source_url, "source"],
                cwd=self.work_dir,
                ssh_key_path=source_ssh_key_path
            )
            
            if clone_source.returncode != 0:
                error_msg = clone_source.stderr.strip() or "Failed to clone source repository"
                error_msg = self._sanitize_output(error_msg)
                self._log("ERROR", error_msg)
                result.message = error_msg
                result.logs = self.logs
                return result
            
            # Clone destination repository (bare)
            self._log("INFO", "Fetching destination repository...")
            await asyncio.sleep(0.1)
            
            dest_dir = os.path.join(self.work_dir, "dest")
            clone_dest = self._run_git(
                ["clone", "--bare", dest_url, "dest"],
                cwd=self.work_dir,
                ssh_key_path=dest_ssh_key_path
            )
            
            if clone_dest.returncode != 0:
                error_msg = clone_dest.stderr.strip() or "Failed to clone destination repository"
                error_msg = self._sanitize_output(error_msg)
                self._log("ERROR", error_msg)
                result.message = error_msg
                result.logs = self.logs
                return result
            
            # Get branches from both repos
            source_branches = self._get_all_refs(source_dir, "heads")
            dest_branches = self._get_all_refs(dest_dir, "heads")
            
            # Get tags from both repos
            source_tags = self._get_all_refs(source_dir, "tags")
            dest_tags = self._get_all_refs(dest_dir, "tags")
            
            # Apply filters
            source_branches_filtered = self._filter_refs(source_branches, self.branch_filter)
            dest_branches_filtered = self._filter_refs(dest_branches, self.branch_filter)
            
            if self.tag_filter:
                source_tags_filtered = self._filter_refs(source_tags, self.tag_filter)
                dest_tags_filtered = self._filter_refs(dest_tags, self.tag_filter)
            else:
                source_tags_filtered = {}
                dest_tags_filtered = {}
            
            self._log("INFO", "Comparing branches...")
            
            # Compare branches
            all_branch_names = set(source_branches_filtered.keys()) | set(dest_branches_filtered.keys())
            branch_comparisons = []
            
            for branch_name in sorted(all_branch_names):
                source_commit = source_branches_filtered.get(branch_name)
                dest_commit = dest_branches_filtered.get(branch_name)
                
                comparison = BranchComparison(
                    name=branch_name,
                    source_commit=source_commit[:8] if source_commit else None,
                    dest_commit=dest_commit[:8] if dest_commit else None
                )
                
                if source_commit and not dest_commit:
                    comparison.status = "new_in_source"
                    self._log("DEBUG", f"Branch '{branch_name}': new in source")
                elif dest_commit and not source_commit:
                    comparison.status = "new_in_dest"
                    self._log("DEBUG", f"Branch '{branch_name}': only in destination")
                elif source_commit == dest_commit:
                    comparison.status = "synced"
                else:
                    # Need to count commits ahead/behind
                    # Add source as remote to dest repo for comparison
                    self._run_git(["remote", "add", "source", source_dir], cwd=dest_dir)
                    self._run_git(["fetch", "source"], cwd=dest_dir)
                    
                    # Count commits ahead (in source, not in dest)
                    ahead_result = self._run_git(
                        ["rev-list", "--count", f"{dest_commit}..source/{branch_name}"],
                        cwd=dest_dir
                    )
                    ahead = int(ahead_result.stdout.strip()) if ahead_result.returncode == 0 else 0
                    
                    # Count commits behind (in dest, not in source)
                    behind_result = self._run_git(
                        ["rev-list", "--count", f"source/{branch_name}..{dest_commit}"],
                        cwd=dest_dir
                    )
                    behind = int(behind_result.stdout.strip()) if behind_result.returncode == 0 else 0
                    
                    comparison.ahead = ahead
                    comparison.behind = behind
                    
                    if ahead > 0 and behind > 0:
                        comparison.status = "diverged"
                        self._log("DEBUG", f"Branch '{branch_name}': diverged ({ahead} ahead, {behind} behind)")
                    elif ahead > 0:
                        comparison.status = "ahead"
                        self._log("DEBUG", f"Branch '{branch_name}': {ahead} commits ahead")
                    elif behind > 0:
                        comparison.status = "behind"
                        self._log("DEBUG", f"Branch '{branch_name}': {behind} commits behind")
                    else:
                        comparison.status = "synced"
                
                branch_comparisons.append(comparison)
            
            # Compare tags
            self._log("INFO", "Comparing tags...")
            all_tag_names = set(source_tags_filtered.keys()) | set(dest_tags_filtered.keys())
            tag_comparisons = []
            
            for tag_name in sorted(all_tag_names):
                source_commit = source_tags_filtered.get(tag_name)
                dest_commit = dest_tags_filtered.get(tag_name)
                
                comparison = TagComparison(
                    name=tag_name,
                    source_commit=source_commit[:8] if source_commit else None,
                    dest_commit=dest_commit[:8] if dest_commit else None
                )
                
                if source_commit and not dest_commit:
                    comparison.status = "new_in_source"
                elif dest_commit and not source_commit:
                    comparison.status = "new_in_dest"
                elif source_commit == dest_commit:
                    comparison.status = "synced"
                else:
                    comparison.status = "different"
                
                tag_comparisons.append(comparison)
            
            # Build summary
            summary = {
                "total_branches": len(branch_comparisons),
                "branches_synced": len([b for b in branch_comparisons if b.status == "synced"]),
                "branches_ahead": len([b for b in branch_comparisons if b.status == "ahead"]),
                "branches_behind": len([b for b in branch_comparisons if b.status == "behind"]),
                "branches_diverged": len([b for b in branch_comparisons if b.status == "diverged"]),
                "branches_new_in_source": len([b for b in branch_comparisons if b.status == "new_in_source"]),
                "branches_new_in_dest": len([b for b in branch_comparisons if b.status == "new_in_dest"]),
                "total_tags": len(tag_comparisons),
                "tags_synced": len([t for t in tag_comparisons if t.status == "synced"]),
                "tags_new_in_source": len([t for t in tag_comparisons if t.status == "new_in_source"]),
                "tags_new_in_dest": len([t for t in tag_comparisons if t.status == "new_in_dest"]),
                "tags_different": len([t for t in tag_comparisons if t.status == "different"]),
            }
            
            self._log("INFO", f"Comparison complete: {summary['total_branches']} branches, {summary['total_tags']} tags")
            
            result.success = True
            result.message = "Comparison completed successfully"
            result.branches = branch_comparisons
            result.tags = tag_comparisons
            result.summary = summary
            result.logs = self.logs
            
        except subprocess.TimeoutExpired:
            self._log("ERROR", "Git operation timed out")
            result.message = "Git operation timed out"
            result.logs = self.logs
            
        except Exception as e:
            error_msg = str(e)
            self._log("ERROR", f"Comparison failed: {error_msg}")
            result.message = error_msg
            result.logs = self.logs
            
        finally:
            # Cleanup
            if source_ssh_key_path and os.path.exists(source_ssh_key_path):
                os.unlink(source_ssh_key_path)
            if dest_ssh_key_path and os.path.exists(dest_ssh_key_path):
                os.unlink(dest_ssh_key_path)
            if self.work_dir and os.path.exists(self.work_dir):
                shutil.rmtree(self.work_dir, ignore_errors=True)
        
        return result
    
    def _get_all_refs(self, repo_dir: str, ref_type: str) -> Dict[str, str]:
        """Get all refs with their commit hashes"""
        result = self._run_git(
            ["for-each-ref", f"refs/{ref_type}", "--format=%(refname:short) %(objectname)"],
            cwd=repo_dir
        )
        if result.returncode != 0:
            return {}
        
        refs = {}
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split()
                if len(parts) >= 2:
                    refs[parts[0]] = parts[1]
        return refs
    
    def _filter_refs(self, refs: Dict[str, str], pattern: str) -> Dict[str, str]:
        """Filter refs by pattern"""
        if not pattern:
            return refs
        try:
            regex = re.compile(pattern)
            return {k: v for k, v in refs.items() if regex.match(k)}
        except re.error:
            return {k: v for k, v in refs.items() if pattern in k}
    
    def _get_matching_refs(self, repo_dir: str, ref_type: str, pattern: str) -> List[str]:
        """Get refs matching the filter pattern"""
        if not pattern:
            return []
        
        result = self._run_git(["for-each-ref", f"refs/{ref_type}", "--format=%(refname:short)"], cwd=repo_dir)
        if result.returncode != 0:
            return []
        
        refs = result.stdout.strip().split('\n')
        refs = [r for r in refs if r]
        
        try:
            regex = re.compile(pattern)
            return [r for r in refs if regex.match(r)]
        except re.error:
            # Invalid regex, treat as glob/literal
            return [r for r in refs if pattern in r]
    
    def _parse_push_stats(self, output: str) -> tuple:
        """Parse git push output for statistics"""
        commits = 0
        files = 0
        bytes_transferred = 0
        
        # Look for patterns like "1234 bytes" or "1.2 MiB"
        bytes_match = re.search(r'(\d+(?:\.\d+)?)\s*(bytes|[KMG]iB)', output)
        if bytes_match:
            value = float(bytes_match.group(1))
            unit = bytes_match.group(2)
            if unit == "KiB":
                bytes_transferred = int(value * 1024)
            elif unit == "MiB":
                bytes_transferred = int(value * 1024 * 1024)
            elif unit == "GiB":
                bytes_transferred = int(value * 1024 * 1024 * 1024)
            else:
                bytes_transferred = int(value)
        
        # Count objects
        objects_match = re.search(r'(\d+)\s+objects', output)
        if objects_match:
            commits = int(objects_match.group(1))
        
        return commits, files, bytes_transferred
    
    def _format_bytes(self, bytes_val: int) -> str:
        """Format bytes to human readable"""
        if bytes_val < 1024:
            return f"{bytes_val} B"
        elif bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        else:
            return f"{bytes_val / (1024 * 1024):.2f} MB"
    
    def _sanitize_output(self, text: str) -> str:
        """Remove credentials from output"""
        # Remove URLs with embedded credentials (both http and https)
        text = re.sub(r'https://[^:]+:[^@]+@', 'https://***:***@', text)
        text = re.sub(r'http://[^:]+:[^@]+@', 'http://***:***@', text)
        return text
