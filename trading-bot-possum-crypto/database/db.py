"""
Possum Crypto -- Database Connection & Setup
SQLite database with WAL mode, context-managed connections.
Same pattern as Possum US/AU.
"""

import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

logger = logging.getLogger("possum.crypto.db")

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


class Database:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._initialized = False

    def initialize(self) -> None:
        """Create tables from schema.sql if they don't exist."""
        if self._initialized:
            return

        schema_sql = SCHEMA_PATH.read_text()

        with self.get_connection() as conn:
            conn.executescript(schema_sql)
            logger.info("Database initialized at %s", self.db_path)

        self._initialized = True

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Yield a connection with WAL mode and Row factory."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def execute(self, query: str, params: tuple = ()) -> list[sqlite3.Row]:
        """Execute a query and return all rows."""
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            return cursor.fetchall()

    def execute_insert(self, query: str, params: tuple = ()) -> int:
        """Execute an INSERT and return the lastrowid."""
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            return cursor.lastrowid

    def fetch_one(self, query: str, params: tuple = ()) -> sqlite3.Row | None:
        """Fetch a single row or None."""
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            return cursor.fetchone()

    def fetch_all(self, query: str, params: tuple = ()) -> list[sqlite3.Row]:
        """Fetch all rows."""
        return self.execute(query, params)


# Module-level singleton
_db: Database | None = None


def get_db() -> Database:
    global _db
    if _db is None:
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from config import get_config
        config = get_config()
        _db = Database(config.db_path)
        _db.initialize()
    return _db
