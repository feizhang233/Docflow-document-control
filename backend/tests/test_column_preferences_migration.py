import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, MetaData, String, Table, create_engine, func, inspect, select


def test_order_migration_preserves_existing_visibility(tmp_path):
    migration_path = Path(__file__).parents[1] / "alembic/versions/20261028_29_user_column_order.py"
    spec = importlib.util.spec_from_file_location("user_column_order_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'migration.db'}")
    metadata = MetaData()
    users = Table("users", metadata, Column("id", Integer, primary_key=True))
    preferences = Table(
        "user_column_preferences", metadata,
        Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        Column("register", String(20), primary_key=True),
        Column("visibility", JSON, nullable=False),
        Column("updated_at", DateTime, server_default=func.now(), nullable=False),
    )
    metadata.create_all(engine)
    try:
        with engine.begin() as connection:
            connection.execute(users.insert(), [{"id": 1}, {"id": 2}])
            connection.execute(preferences.insert(), [
                {"user_id": 1, "register": "documents", "visibility": {"feedback": False}},
                {"user_id": 2, "register": "workflow", "visibility": {"document_title": True}},
            ])
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            upgraded = Table("user_column_preferences", MetaData(), autoload_with=connection)
            rows = connection.execute(select(upgraded).order_by(upgraded.c.user_id)).mappings().all()
            assert rows[0]["visibility"] == {"feedback": False}
            assert rows[1]["visibility"] == {"document_title": True}
            assert all(row["column_order"] == [] for row in rows)
            assert next(column for column in inspect(connection).get_columns("user_column_preferences") if column["name"] == "column_order")["nullable"] is False
            assert inspect(connection).get_pk_constraint("user_column_preferences")["constrained_columns"] == ["user_id", "register"]
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert "column_order" not in {column["name"] for column in inspect(connection).get_columns("user_column_preferences")}
            assert connection.execute(select(preferences.c.visibility).order_by(preferences.c.user_id)).scalars().all() == [{"feedback": False}, {"document_title": True}]
    finally:
        engine.dispose()
