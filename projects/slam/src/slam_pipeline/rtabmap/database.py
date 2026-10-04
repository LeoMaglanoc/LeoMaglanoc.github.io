"""Read-only RTAB-Map graph diagnostics."""

from __future__ import annotations

import sqlite3
from pathlib import Path


# RTAB-Map Link::Type values. They are used only for graph inspection; pose
# export always uses the supported rtabmap-export command.
_LINK_TYPES = {
    "neighbor_link_count": 0,
    "global_loop_closure_count": 1,
    "local_space_closure_count": 2,
    "local_time_closure_count": 3,
}


def inspect_database(database: str | Path) -> dict[str, int | float | None]:
    """Return graph statistics without changing the database."""
    database = Path(database)
    if not database.is_file() or database.stat().st_size == 0:
        raise FileNotFoundError(f"RTAB-Map database missing or empty: {database}")
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        node_count = int(connection.execute("SELECT COUNT(*) FROM Node").fetchone()[0])
        link_count = int(connection.execute("SELECT COUNT(*) FROM Link").fetchone()[0])
        first_node_stamp, last_node_stamp = connection.execute(
            "SELECT MIN(stamp), MAX(stamp) FROM Node"
        ).fetchone()
        result: dict[str, int | float | None] = {
            "node_count": node_count,
            "link_count": link_count,
            "database_size_bytes": database.stat().st_size,
            "first_node_stamp": float(first_node_stamp) if first_node_stamp is not None else None,
            "last_node_stamp": float(last_node_stamp) if last_node_stamp is not None else None,
        }
        for key, value in _LINK_TYPES.items():
            result[key] = int(connection.execute("SELECT COUNT(*) FROM Link WHERE type = ?", (value,)).fetchone()[0])
        return result
    finally:
        connection.close()
