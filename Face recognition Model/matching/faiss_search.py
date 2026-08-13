# FAISS IndexFlatIP-backed nearest-neighbour search over L2-normalized face embeddings for cosine similarity matching.

import os

import faiss
import numpy as np

import config


class FaissMatcher:
    def __init__(self, dim: int = None, index_path: str = None):
        self.dim = dim or config.EMBEDDING_DIM
        self.index_path = index_path or config.FAISS_INDEX_PATH
        self.index = faiss.IndexIDMap(faiss.IndexFlatIP(self.dim))
        if self.index_path and os.path.exists(self.index_path):
            self.load()

    @staticmethod
    def _normalize(vectors) -> np.ndarray:
        vectors = np.array(vectors, dtype=np.float32)
        if vectors.ndim == 1:
            vectors = vectors.reshape(1, -1)
        faiss.normalize_L2(vectors)
        return vectors

    def add(self, embedding_id: int, embedding: np.ndarray) -> None:
        vec = self._normalize(embedding)
        self.index.add_with_ids(vec, np.array([embedding_id], dtype=np.int64))

    def add_batch(self, embedding_ids: list, embeddings) -> None:
        vecs = self._normalize(np.asarray(embeddings))
        ids = np.asarray(embedding_ids, dtype=np.int64)
        self.index.add_with_ids(vecs, ids)

    def search(self, embedding: np.ndarray, top_k: int = None) -> list:
        if self.index.ntotal == 0:
            return []
        top_k = top_k or config.SEARCH_TOP_K
        top_k = min(top_k, self.index.ntotal)
        vec = self._normalize(embedding)
        similarities, ids = self.index.search(vec, top_k)
        return [(int(i), float(s)) for i, s in zip(ids[0], similarities[0]) if i != -1]

    def remove(self, embedding_ids: list) -> None:
        self.index.remove_ids(np.array(embedding_ids, dtype=np.int64))

    def save(self) -> None:
        if self.index_path:
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
            faiss.write_index(self.index, self.index_path)

    def load(self) -> None:
        self.index = faiss.read_index(self.index_path)

    def rebuild_from_store(self, store) -> int:
        self.index = faiss.IndexIDMap(faiss.IndexFlatIP(self.dim))
        rows = store.get_all_embeddings()
        if rows:
            ids = [r[0] for r in rows]
            vecs = np.stack([r[2] for r in rows])
            self.add_batch(ids, vecs)
        self.save()
        return len(rows)

    @property
    def size(self) -> int:
        return self.index.ntotal
