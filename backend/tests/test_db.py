from sqlalchemy.exc import DisconnectionError, OperationalError

from app.db.session import engine_kwargs, is_database_disconnect


def test_mysql_engine_recycles_before_wait_timeout():
    kwargs = engine_kwargs("mysql+pymysql://docflow:docflow@db:3306/docflow")
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_recycle"] <= 300
    assert kwargs["pool_use_lifo"] is True
    assert kwargs["connect_args"]["connect_timeout"] == 10
    assert "wait_timeout=600" in kwargs["connect_args"]["init_command"]


def test_sqlite_engine_omits_mysql_socket_timeouts():
    kwargs = engine_kwargs("sqlite+pysqlite:///:memory:")
    assert kwargs == {"pool_pre_ping": True}


def test_mysql_disconnect_errors_are_detected():
    class GoneAway(Exception):
        pass

    gone = GoneAway(2006, "MySQL server has gone away")
    wrapped = OperationalError("(pymysql.err.OperationalError) (2006, 'MySQL server has gone away')", None, gone)
    assert is_database_disconnect(gone)
    assert is_database_disconnect(wrapped)
    assert is_database_disconnect(DisconnectionError("lost connection"))
    assert not is_database_disconnect(OperationalError("duplicate key", None, Exception("duplicate key")))
    assert not is_database_disconnect(ValueError("not a database problem"))
