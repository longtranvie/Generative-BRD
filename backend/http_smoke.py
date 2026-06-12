"""End-to-end smoke against a running FastAPI server."""
import json
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


def main() -> None:
    s = _post("/api/sessions")
    sid = s["session_id"]
    print(f"session: {sid}")

    text = (
        "ACME Corp needs an internal expense portal. Employees submit, approvers review, "
        "finance audits. SSO required. Reporting dashboards monthly. Mobile-friendly."
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
    print("HTTP SMOKE PASSED")


if __name__ == "__main__":
    main()
