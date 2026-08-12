#!/bin/sh
set -e

# docker compose restart restarts db+backend together; depends_on health only
# applies to "up", so wait here until MySQL accepts connections.
python - <<'PY'
import os
import time

from sqlalchemy import create_engine, text

url = os.environ.get("DATABASE_URL")
if not url:
    raise SystemExit("DATABASE_URL is required")

engine = create_engine(url, pool_pre_ping=True)
last_error = None
for attempt in range(1, 61):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"database ready after {attempt} attempt(s)", flush=True)
        break
    except Exception as exc:  # noqa: BLE001 - retry any connect failure during boot
        last_error = exc
        time.sleep(1)
else:
    raise SystemExit(f"database not ready: {last_error}")
PY

alembic upgrade head
python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
