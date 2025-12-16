# Git Synchronization Process - Technical Deep Dive

This document describes in detail the complete flow and process used by GitsSync Pro to synchronize two Git repositories.

---

## Overview

GitsSync Pro uses a **mirror-based synchronization** approach. It clones the source repository in bare/mirror mode, then pushes the selected refs (branches and tags) to the destination repository with `--force` to ensure the destination matches the source exactly.

---

## Process Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYNC JOB TRIGGERED                                │
│                    (Manual trigger or Cron schedule)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. CREATE JOB RUN RECORD                                                   │
│     - Generate unique run ID                                                │
│     - Set status = SYNCING                                                  │
│     - Record start timestamp                                                │
│     - Initialize empty logs array                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. LOAD CREDENTIALS                                                        │
│     - Fetch source credential from database                                 │
│     - Fetch destination credential from database                            │
│     - Decrypt encrypted fields (password, token, SSH key)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. INITIALIZE GIT SYNC SERVICE                                             │
│     - Create GitSyncService instance with:                                  │
│       • Source URL + credentials                                            │
│       • Destination URL + credentials                                       │
│       • Branch filter (regex)                                               │
│       • Tag filter (regex)                                                  │
│       • Log callback for real-time updates                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. CREATE TEMPORARY WORK DIRECTORY                                         │
│     - Create temp directory: /tmp/gitsync_XXXXXX/                           │
│     - This isolates each sync operation                                     │
│     - Will be cleaned up after sync completes                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. SETUP SSH KEYS (if applicable)                                          │
│     - Write SSH private key to temp file                                    │
│     - Set permissions to 600 (owner read/write only)                        │
│     - Configure GIT_SSH_COMMAND environment variable                        │
│     - Disable strict host key checking                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. BUILD AUTHENTICATED URLs                                                │
│                                                                             │
│     For HTTPS/HTTP URLs:                                                    │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ Original:  https://github.com/user/repo.git                     │     │
│     │                                                                 │     │
│     │ With Token:                                                     │     │
│     │   https://oauth2:<token>@github.com/user/repo.git               │     │
│     │                                                                 │     │
│     │ With Username/Password:                                         │     │
│     │   https://<user>:<pass>@github.com/user/repo.git                │     │
│     │                                                                 │     │
│     │ Note: Special characters are URL-encoded                        │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     For SSH URLs: No modification (uses SSH key from step 5)                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  7. CLONE SOURCE REPOSITORY                                                 │
│                                                                             │
│     Command: git clone --mirror <source_url> repo                           │
│                                                                             │
│     The --mirror flag:                                                      │
│     • Creates a bare repository                                             │
│     • Copies all refs (branches, tags, notes)                               │
│     • Sets up refspecs to mirror all refs on fetch                          │
│     • Ideal for creating an exact copy of a repository                      │
│                                                                             │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  /tmp/gitsync_XXXXXX/                                           │     │
│     │  └── repo/                    <- Bare mirror clone              │     │
│     │      ├── HEAD                                                   │     │
│     │      ├── config                                                 │     │
│     │      ├── objects/                                               │     │
│     │      ├── refs/                                                  │     │
│     │      │   ├── heads/           <- All branches                   │     │
│     │      │   └── tags/            <- All tags                       │     │
│     │      └── ...                                                    │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     If clone fails: Log error, set status = FAILED, return                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  8. GET AND FILTER BRANCHES                                                 │
│                                                                             │
│     Command: git for-each-ref refs/heads --format=%(refname:short)          │
│                                                                             │
│     Example output:                                                         │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  main                                                           │     │
│     │  develop                                                        │     │
│     │  feature/login                                                  │     │
│     │  feature/dashboard                                              │     │
│     │  bugfix/memory-leak                                             │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     Apply branch filter regex (e.g., "^(main|develop)$"):                   │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Matched: main, develop                                         │     │
│     │  Filtered out: feature/*, bugfix/*                              │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     Default filter ".*" matches all branches                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  9. GET AND FILTER TAGS (if tag filter specified)                           │
│                                                                             │
│     Command: git for-each-ref refs/tags --format=%(refname:short)           │
│                                                                             │
│     Example output:                                                         │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  v1.0.0                                                         │     │
│     │  v1.1.0                                                         │     │
│     │  v2.0.0-beta                                                    │     │
│     │  release-2024-01                                                │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     Apply tag filter regex (e.g., "^v[0-9]+\.[0-9]+\.[0-9]+$"):             │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Matched: v1.0.0, v1.1.0                                        │     │
│     │  Filtered out: v2.0.0-beta, release-2024-01                     │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     Empty tag filter = no tags synced                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  10. ADD DESTINATION AS REMOTE                                              │
│                                                                             │
│      Command: git remote add destination <dest_url>                         │
│                                                                             │
│      This adds the destination repository as a named remote                 │
│      so we can push to it                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  11. BUILD REFSPECS                                                         │
│                                                                             │
│      For each matched branch:                                               │
│        refs/heads/<branch>:refs/heads/<branch>                              │
│                                                                             │
│      For each matched tag:                                                  │
│        refs/tags/<tag>:refs/tags/<tag>                                      │
│                                                                             │
│      Example refspecs array:                                                │
│      ┌─────────────────────────────────────────────────────────────────┐    │
│      │  refs/heads/main:refs/heads/main                                │    │
│      │  refs/heads/develop:refs/heads/develop                          │    │
│      │  refs/tags/v1.0.0:refs/tags/v1.0.0                              │    │
│      │  refs/tags/v1.1.0:refs/tags/v1.1.0                              │    │
│      └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  12. PUSH TO DESTINATION                                                    │
│                                                                             │
│      Command: git push destination --force <refspecs...>                    │
│                                                                             │
│      The --force flag:                                                      │
│      • Overwrites destination refs even if they've diverged                 │
│      • Ensures destination exactly matches source                           │
│      • Required for true mirroring behavior                                 │
│                                                                             │
│      ⚠️  WARNING: Force push overwrites destination history!                │
│          Any commits in destination not in source will be lost              │
│                                                                             │
│      Push output is parsed for statistics:                                  │
│      • Number of objects transferred                                        │
│      • Bytes transferred                                                    │
│      • New refs created                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  13. RECORD RESULTS                                                         │
│                                                                             │
│      Success:                                                               │
│      ┌─────────────────────────────────────────────────────────────────┐    │
│      │  status: SUCCESS                                                │    │
│      │  message: "Synced 2 branches, 2 tags, 15 commits"               │    │
│      │  stats:                                                         │    │
│      │    branches_synced: 2                                           │    │
│      │    tags_synced: 2                                               │    │
│      │    commits_pushed: 15                                           │    │
│      │    bytes_transferred: 45678                                     │    │
│      │  completed_at: 2025-12-16T10:30:45Z                             │    │
│      └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│      Failure:                                                               │
│      ┌─────────────────────────────────────────────────────────────────┐    │
│      │  status: FAILED                                                 │    │
│      │  message: "Authentication failed for destination"               │    │
│      │  completed_at: 2025-12-16T10:30:45Z                             │    │
│      └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  14. UPDATE JOB STATUS                                                      │
│                                                                             │
│      Update the job record with:                                            │
│      • last_run_at: Current timestamp                                       │
│      • last_run_status: SUCCESS or FAILED                                   │
│      • last_run_message: Summary message                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  15. CLEANUP                                                                │
│                                                                             │
│      • Delete temporary SSH key files                                       │
│      • Remove temporary work directory (rm -rf /tmp/gitsync_XXXXXX/)        │
│      • Close WebSocket connections                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  16. BROADCAST FINAL STATUS                                                 │
│                                                                             │
│      Send WebSocket message to connected clients:                           │
│      {                                                                      │
│        "timestamp": "2025-12-16T10:30:45Z",                                 │
│        "level": "COMPLETE",  // or "FAILED"                                 │
│        "message": "Synced 2 branches, 2 tags, 15 commits"                   │
│      }                                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Compare Process Flow

The compare process is similar but doesn't push - it only analyzes differences:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPARE TRIGGERED                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. CLONE BOTH REPOSITORIES (bare mode)                                     │
│                                                                             │
│     /tmp/gitsync_compare_XXXXXX/                                            │
│     ├── source/     <- Clone of source repo                                 │
│     └── dest/       <- Clone of destination repo                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. GET ALL REFS FROM BOTH REPOS                                            │
│                                                                             │
│     For each repo, get:                                                     │
│     • All branches with their HEAD commit SHA                               │
│     • All tags with their commit SHA                                        │
│                                                                             │
│     Command: git for-each-ref refs/heads --format='%(refname:short) %(objectname)'
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. APPLY FILTERS                                                           │
│                                                                             │
│     Apply branch_filter regex to both source and dest branches              │
│     Apply tag_filter regex to both source and dest tags                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. COMPARE BRANCHES                                                        │
│                                                                             │
│     For each branch (union of source and dest):                             │
│                                                                             │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Case 1: Branch only in source                                  │     │
│     │    → status: "new_in_source"                                    │     │
│     │                                                                 │     │
│     │  Case 2: Branch only in destination                             │     │
│     │    → status: "new_in_dest"                                      │     │
│     │                                                                 │     │
│     │  Case 3: Same commit SHA                                        │     │
│     │    → status: "synced"                                           │     │
│     │                                                                 │     │
│     │  Case 4: Different commit SHA                                   │     │
│     │    → Count commits ahead/behind using git rev-list              │     │
│     │    → status: "ahead", "behind", or "diverged"                   │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│     Ahead/behind calculation:                                               │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  # Commits in source not in dest (ahead)                        │     │
│     │  git rev-list --count dest_commit..source_commit                │     │
│     │                                                                 │     │
│     │  # Commits in dest not in source (behind)                       │     │
│     │  git rev-list --count source_commit..dest_commit                │     │
│     └─────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. COMPARE TAGS                                                            │
│                                                                             │
│     For each tag (union of source and dest):                                │
│                                                                             │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  • Only in source     → "new_in_source"                         │     │
│     │  • Only in dest       → "new_in_dest"                           │     │
│     │  • Same commit        → "synced"                                │     │
│     │  • Different commit   → "different"                             │     │
│     └─────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. BUILD SUMMARY                                                           │
│                                                                             │
│     {                                                                       │
│       "total_branches": 5,                                                  │
│       "branches_synced": 2,                                                 │
│       "branches_ahead": 1,                                                  │
│       "branches_behind": 0,                                                 │
│       "branches_diverged": 1,                                               │
│       "branches_new_in_source": 1,                                          │
│       "branches_new_in_dest": 0,                                            │
│       "total_tags": 3,                                                      │
│       "tags_synced": 2,                                                     │
│       "tags_new_in_source": 1,                                              │
│       "tags_new_in_dest": 0,                                                │
│       "tags_different": 0                                                   │
│     }                                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  7. RETURN RESULTS & CLEANUP                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Credential Handling

### HTTPS with Username/Password

```
Original URL:    https://github.com/user/repo.git
With creds:      https://username:password@github.com/user/repo.git

Special characters in password are URL-encoded:
  @ → %40
  : → %3A
  / → %2F
  etc.
```

### HTTPS with Token

```
GitHub:    https://oauth2:<token>@github.com/user/repo.git
GitLab:    https://oauth2:<token>@gitlab.com/user/repo.git
Other:     https://git:<token>@server.com/user/repo.git
```

### SSH with Private Key

```bash
# Temporary key file created
/tmp/gitsync_key_XXXXXX.key

# Git configured to use it
GIT_SSH_COMMAND="ssh -i /tmp/gitsync_key_XXXXXX.key -o StrictHostKeyChecking=no"

# URL unchanged
git@github.com:user/repo.git
```

---

## Error Handling

### Clone Failures
- Network issues → Retry with timeout
- Authentication failure → Log error with sanitized URL
- Repository not found → Log 404 error

### Push Failures
- Authentication failure → Credential error message
- Permission denied → Access rights error
- Network timeout → Timeout error with retry suggestion

### Credential Sanitization
All error messages are sanitized to remove credentials:
```
Before: failed to push to https://user:secret123@github.com/repo.git
After:  failed to push to https://***:***@github.com/repo.git
```

---

## Real-time Logging

During sync, logs are streamed via WebSocket:

```json
{"timestamp": "2025-12-16T10:30:00Z", "level": "INFO", "message": "Starting sync job..."}
{"timestamp": "2025-12-16T10:30:01Z", "level": "INFO", "message": "Connecting to source repository..."}
{"timestamp": "2025-12-16T10:30:02Z", "level": "DEBUG", "message": "Running: git clone --mirror http://***:***@server/repo.git repo"}
{"timestamp": "2025-12-16T10:30:15Z", "level": "INFO", "message": "Fetching remote refs..."}
{"timestamp": "2025-12-16T10:30:16Z", "level": "DEBUG", "message": "Found 3 branches matching filter"}
{"timestamp": "2025-12-16T10:30:17Z", "level": "INFO", "message": "Connecting to destination repository..."}
{"timestamp": "2025-12-16T10:30:18Z", "level": "INFO", "message": "Pushing changes to destination..."}
{"timestamp": "2025-12-16T10:30:25Z", "level": "INFO", "message": "Sync completed successfully"}
{"timestamp": "2025-12-16T10:30:25Z", "level": "COMPLETE", "message": "Synced 3 branches, 0 tags, 12 commits"}
```

---

## Important Notes

### Force Push Behavior
⚠️ **This tool uses `git push --force`**, which means:
- Destination history is overwritten to match source
- Any commits in destination not in source are **permanently lost**
- Destination becomes an exact mirror of source (for matched refs)

### Ref Isolation
Only refs matching the filters are synced:
- Unmatched branches in destination are **not deleted**
- Unmatched tags in destination are **not deleted**
- To fully mirror, use `.*` for both branch and tag filters

### Concurrent Syncs
- Each sync creates its own temporary directory
- Multiple syncs can run in parallel
- Same job cannot run concurrently (locked by status check)

### Timeout Handling
- Default git operation timeout: 300 seconds
- Configurable in Settings
- Long-running clones of large repos may need higher timeout
