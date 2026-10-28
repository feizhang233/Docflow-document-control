from sqlalchemy import func, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.iam import User
from app.models.user_column_preference import UserColumnPreference
from app.schemas.column_preferences import ColumnPreferencesUpdate, ColumnRegister


class ColumnPreferencesService:
    def __init__(self, db: Session):
        self.db = db

    def read(self, user_id: int, register: ColumnRegister) -> dict:
        item = self.db.get(UserColumnPreference, (user_id, register))
        return {
            "register": register,
            "visibility": dict(item.visibility) if item else {},
            "column_order": list(item.column_order) if item else [],
        }

    def update(self, user_id: int, register: ColumnRegister, data: ColumnPreferencesUpdate) -> dict:
        if self.db.get_bind().dialect.name == "sqlite":
            # SQLite has no row locks. Its atomic upsert merges JSON inside the
            # database, preserving distinct patches even on first creation.
            statement = sqlite_insert(UserColumnPreference).values(
                user_id=user_id, register=register, visibility=data.visibility or {},
                column_order=data.column_order or [],
            )
            updates = {"updated_at": func.now()}
            if data.visibility is not None:
                updates["visibility"] = func.json_patch(UserColumnPreference.visibility, statement.excluded.visibility)
            if data.column_order is not None:
                updates["column_order"] = statement.excluded.column_order
            self.db.execute(statement.on_conflict_do_update(
                index_elements=["user_id", "register"],
                set_=updates,
            ))
            self.db.commit()
            return self.read(user_id, register)
        # Serialize patches for an account, including the first preference row,
        # so concurrent tabs cannot overwrite unrelated column choices.
        self.db.scalar(select(User.id).where(User.id == user_id).with_for_update())
        item = self.db.scalar(select(UserColumnPreference).where(
            UserColumnPreference.user_id == user_id,
            UserColumnPreference.register == register,
        ).with_for_update())
        if item is None:
            item = UserColumnPreference(user_id=user_id, register=register, visibility={}, column_order=[])
            self.db.add(item)
        if data.visibility is not None:
            item.visibility = {**item.visibility, **data.visibility}
        if data.column_order is not None:
            item.column_order = list(data.column_order)
        self.db.commit()
        return self.read(user_id, register)
