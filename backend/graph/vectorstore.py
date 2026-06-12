"""Per-session in-memory vector store using Chroma.

We isolate chunks by session_id via a per-session Chroma collection name.
Chroma is launched in 'ephemeral' (in-memory) mode — there is no on-disk
persistence and the store is rebuilt every time the process restarts. That
is fine because chunks are re-derived deterministically from source_text on
each session, and the LangGraph checkpointer is the durable layer.
"""
import hashlib
from typing import Iterable

import chromadb

from graph.llm import get_client, has_api_key

_client = chromadb.EphemeralClient()
_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIM = 1536  # text-embedding-3-small dimension


def _stub_embedding(text: str) -> list[float]:
    """Deterministic, low-dim-ish embedding for offline testing.

    Hash the text to fill a 1536-float vector. Not semantically useful — but
    it lets the rest of the pipeline run (and retrieval will fall back to
    'top-K by insertion order' since all distances will be ~equal).
    """
    h = hashlib.sha256(text.encode("utf-8")).digest()
    # Tile the 32-byte digest out to the expected dimension as floats in [-1, 1].
    vec = []
    for i in range(_EMBED_DIM):
        b = h[i % len(h)]
        vec.append((b / 127.5) - 1.0)
    return vec


def _embed_one(text: str) -> list[float]:
    client = get_client()
    if client is None:
        return _stub_embedding(text)
    resp = client.embeddings.create(model=_EMBED_MODEL, input=text)
    return resp.data[0].embedding


def _embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = get_client()
    if client is None:
        return [_stub_embedding(t) for t in texts]
    resp = client.embeddings.create(model=_EMBED_MODEL, input=texts)
    # OpenAI returns data in input order.
    return [d.embedding for d in resp.data]


def _collection_name(session_id: str) -> str:
    # Chroma collection names must satisfy a regex; use a safe hex slug.
    safe = hashlib.sha1(session_id.encode("utf-8")).hexdigest()[:24]
    return f"brd_{safe}"


def reset_session(session_id: str) -> None:
    try:
        _client.delete_collection(_collection_name(session_id))
    except Exception:
        pass


def add_chunks(session_id: str, chunks: list[dict]) -> dict:
    """Embed and store chunks. Returns summary stats."""
    reset_session(session_id)
    col = _client.get_or_create_collection(name=_collection_name(session_id))
    if not chunks:
        return {"count": 0, "stub": not has_api_key()}
    texts = [c["text"] for c in chunks]
    embeddings = _embed_batch(texts)
    col.add(
        ids=[c["id"] for c in chunks],
        documents=texts,
        embeddings=embeddings,
        metadatas=[{"char_start": c["char_start"], "char_end": c["char_end"]} for c in chunks],
    )
    return {"count": len(chunks), "stub": not has_api_key()}


def query(session_id: str, text: str, k: int = 5) -> list[str]:
    col = _client.get_or_create_collection(name=_collection_name(session_id))
    if col.count() == 0:
        return []
    emb = _embed_one(text)
    res = col.query(query_embeddings=[emb], n_results=min(k, col.count()))
    ids: list[str] = res.get("ids", [[]])[0]
    return ids
