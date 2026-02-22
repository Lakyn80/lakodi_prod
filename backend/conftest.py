import sys
import os

# Přidá kořen projektu do PYTHONPATH
ROOT = os.path.dirname(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Pro testy použij in-memory SQLite
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
