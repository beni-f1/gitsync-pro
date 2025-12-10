"""
GitsSync Pro - Backend API
A real git repository synchronization service
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import auth, users, credentials, jobs, settings, logs
from app.scheduler import start_scheduler, stop_scheduler
from app.config import settings as app_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await start_scheduler()
    yield
    # Shutdown
    await stop_scheduler()


app = FastAPI(
    title="GitsSync Pro API",
    description="Git Repository Synchronization Service",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(credentials.router, prefix="/api/credentials", tags=["Credentials"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Sync Jobs"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(logs.router, prefix="/api/logs", tags=["Logs"])


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "demo_mode": app_settings.DEMO_MODE}
