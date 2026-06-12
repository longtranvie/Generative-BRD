from graph.nodes._helpers import now_iso, make_trace


def input_handler(state: dict) -> dict:
    started = now_iso()
    src = state.get("source_text") or ""
    fname = state.get("source_filename")
    trace = make_trace(
        "input_handler",
        started,
        input_summary=f"file={fname!r}, raw_len={len(src)}",
        output_summary=f"normalized {len(src)} chars",
        payload={"chars": len(src), "filename": fname},
    )
    return {
        "source_text": src,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "input_handler",
    }
