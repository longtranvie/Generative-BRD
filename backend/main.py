"""FastAPI entry point. Run with:
    .venv/bin/uvicorn main:app --reload --port 8000
"""
import hmac
import io
import json
import os
import re
import sqlite3
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Load backend/.env before anything reads the environment: graph.builder
# reads CHECKPOINT_DB_PATH at import time and APP_PASSWORD is read below.
# The .env file is gitignored; this is a no-op when it doesn't exist.
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from pypdf import PdfReader

from graph.builder import GRAPH, BASE_TEMPLATE, CHECKPOINT_DB
from graph.llm import get_client
from graph.vectorstore import reset_session
from export_docx import build_brd_docx

# Repo root = parent of backend/. Used to safely serve source files to the
# frontend's "Code" tab.
REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_ALLOWED_DIRS = ("backend", "frontend/app", "frontend/components", "frontend/lib", "samples")
SOURCE_ALLOWED_EXTS = {".py", ".txt", ".md", ".ts", ".tsx", ".js", ".jsx", ".json", ".css"}
SOURCE_DENY_SUBSTRINGS = ("node_modules", ".venv", ".next", "checkpoints.db", "__pycache__")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    yield
    # graph.builder enters the SqliteSaver context manager at import time and
    # stashes it on the compiled graph; close it so the checkpoint DB releases
    # its connection on shutdown instead of relying on process teardown.
    cm = getattr(GRAPH, "_checkpointer_cm", None)
    if cm is not None:
        try:
            cm.__exit__(None, None, None)
        except Exception:
            pass


app = FastAPI(title="BRD Agent", lifespan=_lifespan)

# ─── Access gate + rate limit ───────────────────────────────────────
# APP_PASSWORD moves the demo's password check server-side: when set, every
# /api route (except health and the auth check itself) requires a matching
# X-App-Token header. When unset (local dev / stub mode) the API stays open
# and the frontend gate auto-unlocks. The previous client-only gate shipped
# its password in the JS bundle and left the API itself wide open.

APP_PASSWORD = os.environ.get("APP_PASSWORD", "")

_AUTH_EXEMPT_PATHS = {"/api/health", "/api/auth/check"}

# Naive in-process sliding window per client IP, mutating methods only.
# Enough to stop a key-burning loop; swap for slowapi/redis if this ever
# runs more than one process.
_RATE_WINDOW_SECONDS = 60.0
_RATE_MAX_MUTATIONS = 30
_rate_buckets: dict[str, deque] = defaultdict(deque)


def _token_ok(request: Request) -> bool:
    token = request.headers.get("x-app-token", "")
    return hmac.compare_digest(token.encode(), APP_PASSWORD.encode())


# Registered BEFORE CORSMiddleware is added so CORS wraps it — 401/429
# responses still get CORS headers and stay readable by the browser.
@app.middleware("http")
async def _gate(request: Request, call_next):
    path = request.url.path
    # CORS preflights carry no custom headers; let CORSMiddleware answer them.
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in _AUTH_EXEMPT_PATHS:
        return await call_next(request)

    if APP_PASSWORD and not _token_ok(request):
        return JSONResponse(
            {"detail": "Invalid or missing X-App-Token."}, status_code=401
        )

    if request.method in ("POST", "DELETE"):
        ip = request.client.host if request.client else "unknown"
        bucket = _rate_buckets[ip]
        now = time.monotonic()
        while bucket and now - bucket[0] > _RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= _RATE_MAX_MUTATIONS:
            return JSONResponse(
                {"detail": "Too many requests — please slow down."},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        bucket.append(now)

    return await call_next(request)


# CORS_ORIGINS is a comma-separated list of allowed origins. If unset, falls
# back to "*" so local dev works without configuration. In production, set it
# explicitly to your frontend URL (e.g. "https://brd-frontend.up.railway.app").
_CORS_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets the browser read the download filename on the docx export.
    expose_headers=["Content-Disposition"],
)


@app.get("/api/auth/check")
def auth_check(request: Request):
    """Tell the frontend gate whether a password is required and, if a token
    was sent, whether it is valid. Exempt from the gate middleware so the
    gate UI can probe before the user is authenticated."""
    if not APP_PASSWORD:
        return {"auth_required": False, "ok": True}
    return {"auth_required": True, "ok": _token_ok(request)}


# ─── Input validation ──────────────────────────────────────────────
# Two-stage gate at the /upload endpoint:
#   1. Cheap deterministic preflight (length, word count). Catches "text",
#      "hello", and similar trivially-short inputs in <1ms.
#   2. LLM topic gate. One gpt-4o call with a permissive rubric — only
#      rejects clearly-non-business content (recipes, lyrics, code dumps).
#      Skipped in stub mode (no OPENAI_API_KEY) and fails open on any
#      transport/parse error, so legit users never get blocked by a hiccup.

_MIN_CHARS = 120
_MIN_WORDS = 25

_VALIDATE_PROMPT = """You gate uploads to a Business Requirements Document agent.

The agent reads discovery material — meeting notes, interview transcripts, briefs,
project goals, requirements lists, problem statements — and produces a structured BRD.

Decide whether the following input is plausibly that kind of material. Be PERMISSIVE.
Only reject if the input is clearly NOT business content: a recipe, song lyrics, source
code, fiction, random characters, a single phrase with no context, or test text. Anything
that mentions a business problem, product, team, customer, workflow, goal, or process
should pass.

Return STRICT JSON only:
{{
  "looks_like_business_material": <bool>,
  "reason": "<one short sentence — what the content is and why it does or does not qualify>"
}}

Input (first 1500 chars):
\"\"\"
{sample}
\"\"\""""


def _preflight_validate(text: str) -> Optional[str]:
    """Cheap deterministic check. Returns error message if input is too short."""
    text = (text or "").strip()
    if not text:
        return "Could not extract any text from the input."
    if len(text) < _MIN_CHARS:
        return (
            f"This input is only {len(text)} characters. BRD generation needs at least "
            f"{_MIN_CHARS} characters of discovery material — try meeting notes, an "
            "interview transcript, or a brief."
        )
    words = text.split()
    if len(words) < _MIN_WORDS:
        return (
            f"This input has only {len(words)} words. BRD generation needs at least "
            f"{_MIN_WORDS} words to have something to work with."
        )
    return None


def _llm_topic_gate(text: str) -> Optional[str]:
    """LLM-based check. Returns rejection reason if input doesn't look like business material."""
    client = get_client()
    if client is None:
        return None  # stub mode: no LLM available, skip the gate
    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": _VALIDATE_PROMPT.format(sample=text[:1500])}
            ],
            response_format={"type": "json_object"},
        )
        verdict = json.loads(resp.choices[0].message.content or "{}")
    except Exception:
        return None  # fail open — never block legit users on a transport hiccup
    if verdict.get("looks_like_business_material", True):
        return None
    reason = (verdict.get("reason") or "").strip().rstrip(".")
    return (
        f"This doesn't look like business discovery material — {reason}. "
        "Try meeting notes, an interview transcript, or a brief."
        if reason
        else "This doesn't look like business discovery material. Try meeting notes, an interview transcript, or a brief."
    )


def _extract_text(file: UploadFile, data: bytes) -> str:
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)
    # md / txt / anything else — try utf-8
    try:
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _initial_state(session_id: str, source_text: str, filename: Optional[str]) -> dict:
    return {
        "session_id": session_id,
        "attempt_number": 1,
        "status": "DRAFT_1",
        "source_text": source_text,
        "source_filename": filename,
        "chunks": [],
        "embeddings_written": False,
        "retrieved_by_section": {},
        "emphasis": {},
        "base_template": BASE_TEMPLATE,
        "mutated_template": [],
        "draft_1_json": None,
        "draft_1_markdown": None,
        "draft_2_json": None,
        "draft_2_markdown": None,
        "draft_1_evaluation": None,
        "draft_2_evaluation": None,
        "feedback_1_raw": None,
        "feedback_1_deltas": None,
        "feedback_2_raw": None,
        "feedback_2_deltas": None,
        "trace_log": [],
        "current_node": None,
    }


def _snapshot(session_id: str) -> dict:
    config = {"configurable": {"thread_id": session_id}}
    snap = GRAPH.get_state(config)
    vals = snap.values or {}
    return {
        "session_id": session_id,
        "current_node": vals.get("current_node"),
        "status": vals.get("status"),
        "attempt_number": vals.get("attempt_number"),
        "next_nodes": list(snap.next),
        "draft_1_markdown": vals.get("draft_1_markdown"),
        "draft_2_markdown": vals.get("draft_2_markdown"),
        "trace_log": vals.get("trace_log", []),
        "base_template": vals.get("base_template", BASE_TEMPLATE),
        "mutated_template": vals.get("mutated_template", []),
        "emphasis": vals.get("emphasis", {}),
        "source_filename": vals.get("source_filename"),
    }


class CreateSessionResp(BaseModel):
    session_id: str


@app.post("/api/sessions", response_model=CreateSessionResp)
def create_session() -> CreateSessionResp:
    return CreateSessionResp(session_id=str(uuid.uuid4()))


@app.get("/api/sessions")
def list_sessions(limit: int = 50):
    """List persisted sessions, newest-first. Powers the history sidebar.

    Sessions are persisted by the SqliteSaver checkpointer. We query for
    distinct thread_ids, ordered by the latest checkpoint ROWID, then
    re-hydrate the most recent state of each via GRAPH.get_state().
    """
    try:
        conn = sqlite3.connect(CHECKPOINT_DB)
    except sqlite3.OperationalError:
        return {"sessions": []}
    try:
        cur = conn.execute(
            "SELECT thread_id FROM checkpoints "
            "GROUP BY thread_id "
            "ORDER BY MAX(ROWID) DESC "
            "LIMIT ?",
            (limit,),
        )
        thread_ids = [r[0] for r in cur.fetchall()]
    except sqlite3.OperationalError:
        thread_ids = []
    finally:
        conn.close()

    out: list[dict] = []
    for tid in thread_ids:
        config = {"configurable": {"thread_id": tid}}
        try:
            snap = GRAPH.get_state(config)
        except Exception:
            continue
        vals = snap.values or {}
        # Title: prefer filename, fall back to first ~80 chars of source text.
        title = vals.get("source_filename")
        if not title:
            text = (vals.get("source_text") or "").strip().replace("\n", " ")
            if not text:
                title = "(empty session)"
            elif len(text) > 80:
                title = text[:80] + "…"
            else:
                title = text
        draft = vals.get("draft_2_markdown") or vals.get("draft_1_markdown") or ""
        out.append({
            "session_id": tid,
            "title": title,
            "status": vals.get("status"),
            "attempt_number": vals.get("attempt_number"),
            "source_filename": vals.get("source_filename"),
            "draft_preview": draft[:240],
        })
    return {"sessions": out}


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    """Remove every checkpoint for this thread plus its vector collection.

    Without this, checkpoints.db grows unboundedly — there was no way to
    drop a session once created.
    """
    try:
        GRAPH.checkpointer.delete_thread(session_id)
    except Exception as e:
        raise HTTPException(500, f"Could not delete session: {e}")
    reset_session(session_id)
    return {"deleted": session_id}


@app.get("/api/sessions/{session_id}/export/docx")
def export_docx_endpoint(session_id: str):
    """Download the latest draft as a Word document."""
    config = {"configurable": {"thread_id": session_id}}
    vals = GRAPH.get_state(config).values or {}
    try:
        data = build_brd_docx(vals)
    except ValueError as e:
        raise HTTPException(404, str(e))
    stem = Path(vals.get("source_filename") or "").stem
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-.") or session_id[:8]
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="BRD-{slug}.docx"'},
    )


@app.post("/api/sessions/{session_id}/upload")
def upload(
    session_id: str,
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
):
    # Must stay a sync `def`: the body blocks on GRAPH.invoke and an LLM call,
    # so it has to run in the threadpool to keep the event loop (and /state
    # polling for the live loader) responsive.
    if file is None and not text:
        raise HTTPException(400, "Provide either a file or a text body.")

    if file is not None:
        data = file.file.read()
        source_text = _extract_text(file, data)
        filename = file.filename
    else:
        source_text = text or ""
        filename = None

    preflight_err = _preflight_validate(source_text)
    if preflight_err:
        raise HTTPException(400, preflight_err)

    topic_err = _llm_topic_gate(source_text)
    if topic_err:
        raise HTTPException(400, topic_err)

    config = {"configurable": {"thread_id": session_id}}
    GRAPH.invoke(_initial_state(session_id, source_text, filename), config)
    snap = _snapshot(session_id)
    snap["awaiting"] = "emphasis"
    return snap


class EmphasisReq(BaseModel):
    emphasis: dict[str, str]


@app.post("/api/sessions/{session_id}/emphasis")
def submit_emphasis(session_id: str, req: EmphasisReq):
    config = {"configurable": {"thread_id": session_id}}
    GRAPH.update_state(config, {"emphasis": req.emphasis})
    GRAPH.invoke(None, config)
    snap = _snapshot(session_id)
    snap["awaiting"] = "feedback" if snap["status"] in ("FEEDBACK_1", "FEEDBACK_2") else None
    return snap


class FeedbackReq(BaseModel):
    feedback: str


@app.post("/api/sessions/{session_id}/feedback")
def submit_feedback(session_id: str, req: FeedbackReq):
    config = {"configurable": {"thread_id": session_id}}
    snap_pre = GRAPH.get_state(config)
    attempt = snap_pre.values.get("attempt_number", 1)
    GRAPH.update_state(config, {f"feedback_{attempt}_raw": req.feedback})
    GRAPH.invoke(None, config)
    snap = _snapshot(session_id)
    if snap["status"] == "FINAL":
        snap["awaiting"] = None
    elif snap["status"] in ("FEEDBACK_1", "FEEDBACK_2"):
        snap["awaiting"] = "feedback"
    return snap


@app.post("/api/sessions/{session_id}/finalize")
def finalize_now(session_id: str):
    config = {"configurable": {"thread_id": session_id}}
    snap_pre = GRAPH.get_state(config)
    attempt = snap_pre.values.get("attempt_number", 1)
    GRAPH.update_state(config, {
        "finalize_requested": True,
        f"feedback_{attempt}_raw": "(user finalized without further changes)",
    })
    GRAPH.invoke(None, config)
    snap = _snapshot(session_id)
    if snap["status"] == "FINAL":
        snap["awaiting"] = None
    return snap


@app.get("/api/sessions/{session_id}/state")
def get_state(session_id: str):
    return _snapshot(session_id)


@app.get("/api/sessions/{session_id}/trace")
def get_trace(session_id: str):
    snap = _snapshot(session_id)
    return {"trace_log": snap.get("trace_log", [])}


@app.get("/api/sessions/{session_id}/history")
def get_history(session_id: str):
    """Time-travel: every checkpoint LangGraph has recorded for this thread."""
    config = {"configurable": {"thread_id": session_id}}
    history = list(GRAPH.get_state_history(config))
    return {
        "checkpoints": [
            {
                "checkpoint_id": h.config.get("configurable", {}).get("checkpoint_id"),
                "next_nodes": list(h.next),
                "current_node": (h.values or {}).get("current_node"),
                "status": (h.values or {}).get("status"),
                "attempt_number": (h.values or {}).get("attempt_number"),
                "created_at": getattr(h, "created_at", None),
            }
            for h in history
        ]
    }


@app.get("/api/source")
def get_source(path: str):
    """Serve a single source file by repo-relative path.

    Security: path is resolved against REPO_ROOT, must stay inside it after
    resolution (no symlink escape, no `..` traversal), must live under a
    whitelisted top-level directory, must have a whitelisted extension, and
    must not contain any deny-listed substring. The endpoint is read-only.
    """
    # Cheap deny first
    if any(bad in path for bad in SOURCE_DENY_SUBSTRINGS):
        raise HTTPException(404, "not found")
    if not any(path == d or path.startswith(d + "/") for d in SOURCE_ALLOWED_DIRS):
        raise HTTPException(404, "not found")

    try:
        target = (REPO_ROOT / path).resolve()
    except (OSError, RuntimeError):
        raise HTTPException(404, "not found")

    if not str(target).startswith(str(REPO_ROOT) + "/") and target != REPO_ROOT:
        raise HTTPException(404, "not found")
    if not target.is_file():
        raise HTTPException(404, "not found")
    if target.suffix not in SOURCE_ALLOWED_EXTS:
        raise HTTPException(415, "unsupported file type")

    # Cap size to 256 KB to avoid serving anything pathological.
    if target.stat().st_size > 256 * 1024:
        raise HTTPException(413, "file too large")

    content = target.read_text(encoding="utf-8", errors="replace")
    lang = {
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".js": "javascript",
        ".jsx": "jsx",
        ".json": "json",
        ".css": "css",
        ".md": "markdown",
        ".txt": "text",
    }.get(target.suffix, "text")
    return {
        "path": path,
        "language": lang,
        "lines": content.count("\n") + 1,
        "content": content,
    }


@app.get("/api/health")
def health():
    return {"ok": True}
