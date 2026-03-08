#!/usr/bin/env python3
"""
Drop legacy external-storage tables from uploads.db.

This script is intentionally idempotent:
- If a table does not exist, it is skipped.
- If the database file is missing, the script exits with a clear message.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path("uploads.db")
LEGACY_TABLES = [
    "file_system_metadata",
    "file_system_tree",
    "file_download_requests",
]


def table_exists(cursor: sqlite3.Cursor, table_name: str) -> bool:
    """Return True when a table exists in SQLite."""
    cursor.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def drop_legacy_tables(database_path: Path) -> int:
    """Drop external-storage legacy tables and return the number dropped."""
    if not database_path.exists():
        raise FileNotFoundError(f"Database not found: {database_path}")

    dropped_count = 0
    connection = sqlite3.connect(str(database_path))
    try:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF")

        for table_name in LEGACY_TABLES:
            if table_exists(cursor, table_name):
                cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
                dropped_count += 1
                print(f"Dropped table: {table_name}")
            else:
                print(f"Skipped (not found): {table_name}")

        connection.commit()
        return dropped_count
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main() -> None:
    """Entry point for CLI execution."""
    try:
        dropped = drop_legacy_tables(DB_PATH)
        print(f"Completed. Tables dropped: {dropped}")
    except FileNotFoundError as error:
        print(str(error))
    except sqlite3.Error as error:
        print(f"SQLite error: {error}")
    except Exception as error:
        print(f"Unexpected error: {error}")


if __name__ == "__main__":
    main()
