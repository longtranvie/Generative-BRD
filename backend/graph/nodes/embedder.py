from graph.nodes._helpers import now_iso, make_trace
from graph.vectorstore import add_chunks


def embedder(state: dict) -> dict:
    started = now_iso()
    chunks = state.get("chunks") or []
    session_id = state.get("session_id") or "default"
    stats = add_chunks(session_id, chunks)
    trace = make_trace(
        "embedder",
        started,
        input_summary=f"{len(chunks)} chunks",
        output_summary=(
            f"{stats['count']} embeddings written"
            + (" (stub mode — no OPENAI_API_KEY)" if stats["stub"] else " via text-embedding-3-small")
        ),
        payload={
            "model": "text-embedding-3-small",
            "count": stats["count"],
            "stub_mode": stats["stub"],
            "session_id": session_id,
        },
    )
    return {
        "embeddings_written": True,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "embedder",
    }
