from graph.nodes._helpers import now_iso, make_trace
from graph.vectorstore import query


def retriever(state: dict) -> dict:
    started = now_iso()
    mutated = state.get("mutated_template") or []
    chunks = state.get("chunks") or []
    session_id = state.get("session_id") or "default"

    retrieved: dict[str, list[str]] = {}
    per_section_k = 5
    for s in mutated:
        rq = s.get("retrieval_query") or s.get("name", "")
        ids = query(session_id, rq, k=per_section_k)
        if not ids:
            # Defensive: if the vector store returned nothing (e.g. zero chunks),
            # fall back to all chunk IDs so the Drafter still has something.
            ids = [c["id"] for c in chunks[:per_section_k]]
        retrieved[s["id"]] = ids

    total_chunk_refs = sum(len(v) for v in retrieved.values())
    trace = make_trace(
        "retriever",
        started,
        input_summary=f"{len(mutated)} sections, {len(chunks)} chunks indexed",
        output_summary=f"{total_chunk_refs} chunk references across {len(retrieved)} sections (k={per_section_k})",
        payload={
            "retrieved_by_section": retrieved,
            "k": per_section_k,
            "queries": {s["id"]: s.get("retrieval_query") for s in mutated},
        },
    )
    return {
        "retrieved_by_section": retrieved,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "retriever",
    }
