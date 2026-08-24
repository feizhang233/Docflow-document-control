import os
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["EXTERNAL_API_KEY"] = "test-external-key"
os.environ["AUTH_SECRET"] = "test-auth-secret-value-32-chars-min"
os.environ["AUTH_BCRYPT_ROUNDS"] = "4"
os.environ["BOOTSTRAP_ADMIN_USERNAME"] = "admin"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = "test-admin-password"
os.environ["BOOTSTRAP_ADMIN_NAME"] = "Test Admin"
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.iam_service import IamService
from tests.helpers import ADMIN_PASSWORD, ADMIN_USERNAME, login

engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread":False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine,autoflush=False,autocommit=False)
Base.metadata.create_all(engine)
def override_db():
    db=TestingSession()
    try: yield db
    finally: db.close()
app.dependency_overrides[get_db]=override_db

def bootstrap_iam():
    db = TestingSession()
    try:
        IamService(db).bootstrap()
    finally:
        db.close()

@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(engine); Base.metadata.create_all(engine); bootstrap_iam(); yield

@pytest.fixture
def client():
    test_client = TestClient(app)
    login(test_client)
    return test_client

@pytest.fixture
def anon_client():
    return TestClient(app)
