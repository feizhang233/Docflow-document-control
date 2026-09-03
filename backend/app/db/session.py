import socket
from sqlalchemy import create_engine, event
from sqlalchemy.exc import DisconnectionError
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

MYSQL_DISCONNECT_CODES = {2006, 2013, 2014, 2045, 2055, 4031}
# Recycle before MySQL wait_timeout and typical Docker/NAT idle drops.
MYSQL_POOL_RECYCLE_SECONDS = 280
MYSQL_WAIT_TIMEOUT_SECONDS = 600


def engine_kwargs(database_url: str) -> dict:
    kwargs: dict = {"pool_pre_ping": True}
    if not database_url.startswith("mysql"):
        return kwargs
    kwargs.update(
        pool_recycle=MYSQL_POOL_RECYCLE_SECONDS,
        pool_size=10,
        max_overflow=20,
        pool_timeout=30,
        pool_use_lifo=True,
        connect_args={
            "charset": "utf8mb4",
            "connect_timeout": 10,
            "read_timeout": 30,
            "write_timeout": 30,
            "init_command": f"SET SESSION wait_timeout={MYSQL_WAIT_TIMEOUT_SECONDS}, interactive_timeout={MYSQL_WAIT_TIMEOUT_SECONDS}",
        },
    )
    return kwargs


def _enable_tcp_keepalive(dbapi_connection) -> None:
    sock = getattr(dbapi_connection, "_sock", None)
    if sock is None:
        return
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        if hasattr(socket, "TCP_KEEPIDLE"):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
        sock.setsockopt(socket.IPPROTO_TCP, getattr(socket, "TCP_USER_TIMEOUT", 18), 5000)
    except OSError:
        return


engine = create_engine(settings.database_url, **engine_kwargs(settings.database_url))
if settings.database_url.startswith("mysql"):
    event.listen(engine, "connect", lambda dbapi_connection, _record: _enable_tcp_keepalive(dbapi_connection))
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def is_database_disconnect(exc: BaseException) -> bool:
    seen: list[BaseException] = []
    current: BaseException | None = exc
    while current is not None and current not in seen:
        seen.append(current)
        if isinstance(current, DisconnectionError):
            return True
        code = current.args[0] if getattr(current, "args", None) else None
        if isinstance(code, int) and code in MYSQL_DISCONNECT_CODES:
            return True
        message = " ".join(str(part).lower() for part in getattr(current, "args", ())[1:])
        if any(marker in message for marker in ("gone away", "lost connection", "not connected", "broken pipe", "connection reset")):
            return True
        current = getattr(current, "orig", None)
    return False


def reset_database_pool() -> None:
    engine.dispose()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
