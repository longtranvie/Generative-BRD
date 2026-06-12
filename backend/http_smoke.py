"""End-to-end smoke against a running FastAPI server."""
import json
import urllib.error
import urllib.request
import urllib.parse


BASE = "http://127.0.0.1:8765"


def _post(path: str, payload=None, raw_form: dict | None = None) -> dict:
    url = BASE + path
    if raw_form is not None:
        data = urllib.parse.urlencode(raw_form).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    else:
        body = json.dumps(payload or {}).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path) as resp:
        return json.loads(resp.read())


def _get_bytes(path: str) -> tuple[bytes, str, str]:
    with urllib.request.urlopen(BASE + path) as resp:
        return (
            resp.read(),
            resp.headers.get("Content-Type", ""),
            resp.headers.get("Content-Disposition", ""),
        )


def main() -> None:
    s = _post("/api/sessions")
    sid = s["session_id"]
    print(f"session: {sid}")

    # Must clear the upload preflight gate: >= 120 chars AND >= 25 words.
    text = (
        "ACME Corp needs an internal expense portal. Employees submit expenses, "
        "approvers review them, and finance audits the trail every month. SSO is "
        "required for login. Reporting dashboards refresh monthly for finance "
        "leadership. The portal must be mobile-friendly and accessible."
    )
    up = _post(f"/api/sessions/{sid}/upload", raw_form={"text": text})
    print(f"upload: status={up['status']} current_node={up['current_node']} awaiting={up.get('awaiting')}")

    emph = _post(f"/api/sessions/{sid}/emphasis", {
        "emphasis": {
            "exec_summary": "must_have",
            "objectives": "must_have",
            "scope": "good_to_have",
            "stakeholders": "good_to_have",
            "functional": "must_have",
            "nonfunctional": "can_live_with",
            "assumptions": "can_live_with",
            "metrics": "dont_need",
        }
    })
    print(f"emphasis: status={emph['status']} draft1_chars={len(emph.get('draft_1_markdown') or '')}")

    fb1 = _post(f"/api/sessions/{sid}/feedback", {"feedback": "Make exec summary punchier; add rollout phasing."})
    print(f"feedback_1: status={fb1['status']} draft2_chars={len(fb1.get('draft_2_markdown') or '')}")

    fb2 = _post(f"/api/sessions/{sid}/feedback", {"feedback": "Looks good, ship it."})
    print(f"feedback_2: status={fb2['status']}")

    hist = _get(f"/api/sessions/{sid}/history")
    print(f"history: {len(hist['checkpoints'])} checkpoints")

    trace = _get(f"/api/sessions/{sid}/trace")
    print(f"trace entries: {len(trace['trace_log'])}")

    data, ctype, dispo = _get_bytes(f"/api/sessions/{sid}/export/docx")
    assert data[:2] == b"PK", "export must be a zip container (docx)"
    assert "wordprocessingml" in ctype, ctype
    assert dispo.startswith("attachment"), dispo
    print(f"export: {len(data)} bytes docx ({dispo})")

    s2 = _post("/api/sessions")
    try:
        _get_bytes(f"/api/sessions/{s2['session_id']}/export/docx")
        raise AssertionError("expected 404 for a draftless session")
    except urllib.error.HTTPError as e:
        assert e.code == 404, e.code
    print("export 404 on draftless session: OK")
    print("HTTP SMOKE PASSED")


if __name__ == "__main__":
    main()
