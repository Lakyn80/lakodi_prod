import os
import sys

import pytest

# Přidá kořen projektu do PYTHONPATH
ROOT = os.path.dirname(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Pro testy použij in-memory SQLite
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from backend.app.db import Base, engine, init_db


@pytest.fixture(autouse=True)
def reset_test_db():
    Base.metadata.drop_all(bind=engine)
    init_db()
    yield
