from fastapi import APIRouter
from app.api.routes import auth, external, health, iam, notifications, packages, settings
api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(iam.router)
api_router.include_router(packages.router)
api_router.include_router(settings.router)
api_router.include_router(notifications.router)
api_router.include_router(external.router)
