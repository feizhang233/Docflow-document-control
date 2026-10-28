import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, create_engine, inspect, select


def test_session_migration_preserves_legacy_rows_and_reversible_metadata(tmp_path):
    migration_path = Path(__file__).parents[1] / "alembic/versions/20261028_30_absolute_login_sessions.py"
    spec = importlib.util.spec_from_file_location("absolute_login_session_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'session-migration.db'}")
    metadata = MetaData()
    old = Table(
        "refresh_tokens", metadata,
        Column("id", Integer, primary_key=True),
        Column("user_id", Integer, nullable=False),
        Column("token_hash", String(64), nullable=False, unique=True),
        Column("expires_at", DateTime, nullable=False),
        Column("revoked_at", DateTime, nullable=True),
        Column("user_agent", String(255), nullable=True),
        Column("ip_address", String(64), nullable=True),
        Column("created_at", DateTime, nullable=False),
    )
    metadata.create_all(engine)
    created_at = datetime(2026, 10, 28, 10, 0)
    original = {"id": 7, "user_id": 3, "token_hash": "a" * 64, "expires_at": created_at + timedelta(days=7), "revoked_at": None, "user_agent": "browser", "ip_address": "127.0.0.1", "created_at": created_at}
    try:
        with engine.begin() as connection:
            connection.execute(old.insert().values(**original))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            upgraded = Table("refresh_tokens", MetaData(), autoload_with=connection)
            saved = connection.execute(select(upgraded)).mappings().one()
            assert {field: saved[field] for field in original} == original
            assert all(saved[field] is None for field in ("refresh_nonce", "rotated_at", "previous_token_hash", "previous_valid_until"))
            assert any(index["name"] == "ix_refresh_tokens_previous_token_hash" for index in inspect(connection).get_indexes("refresh_tokens"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert connection.execute(select(old)).mappings().one() == original
    finally:
        engine.dispose()
