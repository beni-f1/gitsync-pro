# GitsSync Pro - Features Documentation

## Overview

GitsSync Pro is a web-based Git repository synchronization tool that allows you to mirror repositories between different Git servers. It provides automated scheduling, credential management, and real-time monitoring of sync operations.

---

## Architecture

### Frontend
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Icons:** Lucide React

### Backend
- **Framework:** Python FastAPI (async)
- **Database:** SQLite with SQLAlchemy (async via aiosqlite)
- **Authentication:** JWT tokens with bcrypt password hashing
- **Scheduler:** APScheduler for cron-based job execution
- **WebSocket:** Real-time log streaming during sync operations

### Deployment
- **Containerization:** Docker Compose
- **Frontend Server:** Nginx (Alpine)
- **Backend Server:** Uvicorn
- **Development:** VS Code DevContainer support

---

## Features

### 1. Authentication & Authorization

#### User Roles
| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage users, credentials, jobs, settings |
| **Editor** | Manage credentials and jobs, cannot manage users |
| **Viewer** | Read-only access to dashboard and job status |

#### Security
- JWT-based authentication with configurable expiration
- Password hashing using bcrypt
- Role-based access control (RBAC) on all endpoints
- Session management via sessionStorage

---

### 2. Dashboard

#### Statistics Cards
- **Total Sync Jobs:** Number of configured sync jobs
- **Healthy:** Jobs whose last run was successful
- **Failing:** Jobs whose last run failed
- **Active Syncs:** Currently running sync operations

#### Recent Runs Overview Chart
- Bar chart showing success/failed/syncing distribution
- Based on the last 10 sync runs across all jobs

#### Recent Sync Activity
- List of recent sync operations with status
- Click to view detailed run information including:
  - Branches synced
  - Tags synced
  - Commits pushed
  - Files changed
  - Bytes transferred
  - Full execution logs

---

### 3. Sync Jobs Management

#### Job Configuration
| Field | Description |
|-------|-------------|
| **Name** | Display name for the job |
| **Source URL** | Git repository URL to sync from |
| **Source Credential** | Authentication for source repository |
| **Destination URL** | Git repository URL to sync to |
| **Destination Credential** | Authentication for destination repository |
| **Branch Filter** | Regex pattern to filter branches (default: `.*` for all) |
| **Tag Filter** | Regex pattern to filter tags (empty = no tags) |
| **Cron Schedule** | Cron expression for automatic scheduling |
| **Enabled** | Toggle to enable/disable the job |

#### Job Actions
| Button | Icon | Description |
|--------|------|-------------|
| **Enable/Disable** | Toggle | Enable or disable scheduled execution |
| **History** | 📜 | View past sync runs and their details |
| **Compare** | 🔀 | Preview differences before syncing |
| **Sync Now** | ▶️ | Trigger immediate sync execution |
| **Edit** | ✏️ | Modify job configuration |
| **Delete** | 🗑️ | Remove the job |

#### Live Sync Logs
- Real-time log streaming via WebSocket during sync
- Color-coded log levels (INFO, WARN, ERROR, DEBUG)
- Auto-scroll to latest entries
- Duration tracking

---

### 4. Repository Compare Feature

#### Purpose
Preview differences between source and destination repositories before executing a sync.

#### Compare Modal Shows
- **Summary Cards:**
  - Total branches
  - Synced branches
  - Branches needing sync
  - Diverged branches

- **Branch Comparison:**
  | Status | Meaning |
  |--------|---------|
  | ✅ Synced | Branch is identical in both repos |
  | ↗️ Ahead | Source has commits not in destination |
  | ↘️ Behind | Destination has commits not in source |
  | ⚠️ Diverged | Both have unique commits (will be force-pushed) |
  | 🆕 New in source | Branch exists only in source |
  | 📁 Only in dest | Branch exists only in destination |

- **Tag Comparison:**
  - Shows new, synced, and different tags

- **Quick Actions:**
  - "Sync Now" button to proceed with sync if differences found

---

### 5. Credentials Management

#### Credential Types
| Type | Fields | Use Case |
|------|--------|----------|
| **Username/Password** | Username, Password | HTTP/HTTPS basic auth |
| **SSH Key** | Private key content | SSH-based Git access |
| **Token** | Personal access token | GitHub, GitLab, Bitbucket tokens |

#### Security
- Credentials encrypted at rest (Base64 encoding - production should use Fernet)
- Passwords/tokens never exposed in API responses
- Credentials sanitized from logs (shows `***:***` instead)

---

### 6. User Management

#### Capabilities (Admin only)
- Create new users with role assignment
- Edit user email and role
- Change user passwords
- Delete users (except self)

#### Default User
- Username: `admin`
- Password: `admin`
- Role: Admin

---

### 7. Settings

#### Configurable Options
| Setting | Description | Default |
|---------|-------------|---------|
| **Git Timeout** | Seconds before git operations timeout | 300 |
| **Max Retries** | Number of retry attempts on failure | 3 |
| **Log Retention** | Days to keep sync logs | 14 |
| **Demo Mode** | Use simulated data instead of real git ops | false |

#### Demo Mode
When enabled, sync operations use fake/simulated data instead of actual git commands. Useful for:
- Testing the UI without real repositories
- Demonstrations and training
- Development without network access

---

### 8. Git Sync Operations

#### Sync Process
1. Clone source repository (bare/mirror mode)
2. Filter branches by regex pattern
3. Filter tags by regex pattern (if specified)
4. Add destination as remote
5. Push matching refs with `--force`
6. Report statistics and cleanup

#### Supported Protocols
- **HTTPS** with username/password or token
- **HTTP** with username/password or token
- **SSH** with private key

#### URL Credential Handling
- Credentials automatically embedded in URLs
- Special characters URL-encoded
- Works with GitHub, GitLab, Bitbucket, and self-hosted servers

---

### 9. Scheduling

#### Cron Expression Format
```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

#### Examples
| Expression | Schedule |
|------------|----------|
| `0 * * * *` | Every hour |
| `0 0 * * *` | Daily at midnight |
| `0 2 * * 0` | Weekly on Sunday at 2 AM |
| `*/15 * * * *` | Every 15 minutes |
| `0 9-17 * * 1-5` | Hourly during business hours (Mon-Fri) |

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login and get JWT token |
| GET | `/api/auth/me` | Get current user info |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/{id}` | Update user |
| DELETE | `/api/users/{id}` | Delete user |

### Credentials
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/credentials` | List credentials |
| POST | `/api/credentials` | Create credential |
| PUT | `/api/credentials/{id}` | Update credential |
| DELETE | `/api/credentials/{id}` | Delete credential |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | List all jobs |
| POST | `/api/jobs` | Create job |
| PUT | `/api/jobs/{id}` | Update job |
| DELETE | `/api/jobs/{id}` | Delete job |
| POST | `/api/jobs/{id}/trigger` | Trigger sync |
| POST | `/api/jobs/{id}/compare` | Compare repos |
| GET | `/api/jobs/{id}/runs` | Get job run history |
| WS | `/api/jobs/{id}/logs` | WebSocket for live logs |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |

---

## Deployment

### Quick Start
```bash
./deploy.sh
```

### Manual Deployment
```bash
npm install
npm run build
docker-compose build
docker-compose up -d
```

### URLs
| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

### Docker Commands
```bash
# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

---

## Development

### DevContainer
The project includes VS Code DevContainer configuration for consistent development environment:
- Python 3.12
- Node.js 20
- Docker-in-Docker support
- Pre-configured extensions

### Local Development
```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.0.1 | 2025-12-10 | Initial release |
| v0.0.2 | 2025-12-10 | Add repository compare feature |

---

## Future Enhancements (Ideas)

- [ ] Email notifications on sync failure
- [ ] Webhook triggers for external integrations
- [ ] Multi-repo sync groups
- [ ] Sync conflict resolution options
- [ ] Audit log for user actions
- [ ] Backup/restore configuration
- [ ] LDAP/SAML authentication
- [ ] Prometheus metrics endpoint
- [ ] Branch/tag exclusion patterns
- [ ] Scheduled maintenance windows
