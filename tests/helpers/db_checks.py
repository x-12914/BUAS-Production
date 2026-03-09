from __future__ import annotations

import sqlite3
from pathlib import Path


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def list_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {row["name"] for row in rows}


def resolve_table(conn: sqlite3.Connection, candidates: list[str]) -> str | None:
    tables = list_tables(conn)
    for name in candidates:
        if name in tables:
            return name
    return None


def fetch_one(conn: sqlite3.Connection, query: str, params: tuple = ()):
    return conn.execute(query, params).fetchone()


def fetch_all(conn: sqlite3.Connection, query: str, params: tuple = ()):
    return conn.execute(query, params).fetchall()
