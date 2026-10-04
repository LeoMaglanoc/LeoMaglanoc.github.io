import sqlite3

from slam_pipeline.rtabmap.database import inspect_database


def test_rtabmap_database_diagnostics_counts_links(tmp_path) -> None:
    database = tmp_path / "rtabmap.db"
    connection = sqlite3.connect(database)
    connection.execute("CREATE TABLE Node (id INTEGER PRIMARY KEY, stamp FLOAT, pose BLOB)")
    connection.execute("CREATE TABLE Link (from_id INTEGER, to_id INTEGER, type INTEGER, information_matrix BLOB, transform BLOB, user_data BLOB)")
    connection.executemany("INSERT INTO Node(id, stamp) VALUES (?, ?)", [(1, 1.0), (2, 2.0)])
    connection.executemany("INSERT INTO Link(from_id, to_id, type) VALUES (?, ?, ?)", [(1, 2, 0), (1, 2, 1), (1, 2, 2), (1, 2, 3)])
    connection.commit(); connection.close()
    stats = inspect_database(database)
    assert stats["node_count"] == 2
    assert stats["link_count"] == 4
    assert stats["neighbor_link_count"] == 1
    assert stats["global_loop_closure_count"] == 1
    assert stats["local_space_closure_count"] == 1
    assert stats["local_time_closure_count"] == 1
