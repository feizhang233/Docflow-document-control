import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError
from app.api.router import api_router
from app.core.config import settings
from app.db.session import SessionLocal, is_database_disconnect, reset_database_pool
from app.services.email_notification_service import EmailNotificationService


def dispatch_email():
    with SessionLocal() as db:
        EmailNotificationService(db).dispatch_pending()


async def email_loop():
    while True:
        try:
            await asyncio.to_thread(dispatch_email)
        except Exception:
            logging.getLogger(__name__).warning("Email queue unavailable; retrying on the next interval")
        await asyncio.sleep(max(5, settings.email_poll_seconds))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(email_loop()) if settings.mail_configured else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

app = FastAPI(title=settings.app_name, version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(api_router, prefix=settings.api_prefix)

@app.exception_handler(OperationalError)
@app.exception_handler(InterfaceError)
def database_connection_error(_request: Request, exc: Exception):
    if is_database_disconnect(exc):
        reset_database_pool()
        return JSONResponse(status_code=503, content={"detail": "Database connection was lost. Retry the request."})
    return JSONResponse(status_code=500, content={"detail": "A database error occurred."})

@app.get("/", include_in_schema=False)
def root(): return {"name":settings.app_name,"docs":"/api/docs"}
