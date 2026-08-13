# SQLite-backed store for person metadata and face embedding blobs, serving as the source of truth for FAISS index rebuilds.

import datetime
import sqlite3

import numpy as np

import config


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class EmbeddingStore:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or config.SQLITE_DB_PATH
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS persons (
                person_id     TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                registered_at TEXT NOT NULL,
                num_samples   INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS embeddings (
                embedding_id  INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id     TEXT NOT NULL,
                embedding     BLOB NOT NULL,
                source_image  TEXT,
                created_at    TEXT NOT NULL,
                FOREIGN KEY (person_id) REFERENCES persons(person_id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_embeddings_person ON embeddings(person_id);
            """
        )
        self._conn.commit()

    def person_exists(self, person_id: str) -> bool:
        cur = self._conn.execute("SELECT 1 FROM persons WHERE person_id = ?", (person_id,))
        return cur.fetchone() is not None

    def add_person(self, person_id: str, name: str) -> None:
        if self.person_exists(person_id):
            return
        self._conn.execute(
            "INSERT INTO persons (person_id, name, registered_at, num_samples) VALUES (?, ?, ?, 0)",
            (person_id, name, _utcnow_iso()),
        )
        self._conn.commit()

    def get_person(self, person_id: str) -> dict:
        cur = self._conn.execute("SELECT * FROM persons WHERE person_id = ?", (person_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def list_persons(self) -> list:
        cur = self._conn.execute("SELECT * FROM persons ORDER BY registered_at")
        return [dict(r) for r in cur.fetchall()]

    def delete_person(self, person_id: str) -> None:
        self._conn.execute("DELETE FROM persons WHERE person_id = ?", (person_id,))
        self._conn.commit()

    def add_embedding(self, person_id: str, embedding: np.ndarray, source_image: str = None) -> int:
        blob = np.asarray(embedding, dtype=np.float32).tobytes()
        cur = self._conn.execute(
            "INSERT INTO embeddings (person_id, embedding, source_image, created_at) VALUES (?, ?, ?, ?)",
            (person_id, blob, source_image, _utcnow_iso()),
        )
        self._conn.execute(
            "UPDATE persons SET num_samples = num_samples + 1 WHERE person_id = ?", (person_id,)
        )
        self._conn.commit()
        return cur.lastrowid

    def get_embedding(self, embedding_id: int) -> np.ndarray:
        cur = self._conn.execute(
            "SELECT embedding FROM embeddings WHERE embedding_id = ?", (embedding_id,)
        )
        row = cur.fetchone()
        if row is None:
            return None
        return np.frombuffer(row["embedding"], dtype=np.float32)

    def get_person_by_embedding_id(self, embedding_id: int) -> str:
        cur = self._conn.execute(
            "SELECT person_id FROM embeddings WHERE embedding_id = ?", (embedding_id,)
        )
        row = cur.fetchone()
        return row["person_id"] if row else None

    def get_all_embeddings(self) -> list:
        cur = self._conn.execute("SELECT embedding_id, person_id, embedding FROM embeddings")
        return [
            (row["embedding_id"], row["person_id"], np.frombuffer(row["embedding"], dtype=np.float32))
            for row in cur.fetchall()
        ]

    def count_embeddings(self) -> int:
        cur = self._conn.execute("SELECT COUNT(*) AS c FROM embeddings")
        return cur.fetchone()["c"]

    def close(self) -> None:
        self._conn.close()
