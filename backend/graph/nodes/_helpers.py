from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_trace(node_name: str, started: str, input_summary: str = "", output_summary: str = "", payload: dict | None = None, status: str = "done") -> dict:
    return {
        "node_name": node_name,
        "started_at": started,
        "completed_at": now_iso(),
        "input_summary": input_summary,
        "output_summary": output_summary,
        "payload": payload or {},
        "status": status,
    }
