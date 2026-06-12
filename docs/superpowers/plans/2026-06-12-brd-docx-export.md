# BRD .docx Export + Real-Content Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A session's BRD can be downloaded as a complete Word (.docx) document, and the backend auto-loads `backend/.env` so the user's `OPENAI_API_KEY` produces real (non-stub) content.

**Architecture:** A new `backend/export_docx.py` module renders the structured draft JSON (`draft_2_json`, else `draft_1_json`) to docx bytes with python-docx; a new `GET /api/sessions/{id}/export/docx` endpoint streams it as an attachment behind the existing auth gate. The frontend fetches it as a blob (so the `X-App-Token` header can ride along) and triggers a download from the draft header in ChatPane.

**Tech Stack:** FastAPI, python-docx, python-dotenv, Next.js 14 / TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-12-brd-docx-export-design.md`

**Machine quirk (this dev machine):** TLS interception breaks pip's cert check — every `pip install` needs `--trusted-host pypi.org --trusted-host files.pythonhosted.org`. All backend commands run from `backend/` using `.venv/Scripts/python` (Windows venv layout).

---

### Task 1: Dependencies + .env auto-load

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/main.py` (imports block, top of file)
- Modify: `README.md` (Run it locally section)

- [ ] **Step 1: Add the two dependencies**

Append to `backend/requirements.txt`:

```
python-docx
python-dotenv
```

- [ ] **Step 2: Install them**

Run (from `backend/`):
```bash
.venv/Scripts/pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org python-docx python-dotenv
```
Expected: both install without error.

Verify:
```bash
.venv/Scripts/python -c "import docx, dotenv; print('deps OK')"
```
Expected: `deps OK`

- [ ] **Step 3: Auto-load backend/.env in main.py**

In `backend/main.py`, the imports currently end the stdlib block with `from typing import Optional`, followed by the FastAPI imports. Insert between them:

```python
from dotenv import load_dotenv

# Load backend/.env before anything reads the environment: graph.builder
# reads CHECKPOINT_DB_PATH at import time and APP_PASSWORD is read below.
# The .env file is gitignored; this is a no-op when it doesn't exist.
load_dotenv(Path(__file__).resolve().parent / ".env")
```

(`Path` is already imported from `pathlib` in the stdlib block above. The `load_dotenv` call sitting between import groups violates E402 by design — it must run before `from graph.builder import ...`.)

- [ ] **Step 4: Verify nothing broke**

Run (from `backend/`):
```bash
.venv/Scripts/python -c "import main; print('main imports OK')"
.venv/Scripts/python smoke_test.py
```
Expected: `main imports OK`, then `SMOKE TEST PASSED` as the last line.

- [ ] **Step 5: Document .env in README**

In `README.md`, the backend run block currently shows `export OPENAI_API_KEY=...` and `export APP_PASSWORD=...` lines. Add immediately after the `export APP_PASSWORD` lines (before the uvicorn line):

```bash
# Tip: put these in backend/.env (gitignored) — main.py auto-loads it,
# which is friendlier than session env vars on Windows.
```

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/main.py README.md
git commit -m "Auto-load backend/.env and add docx/dotenv dependencies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `export_docx.py` (TDD via `docx_smoke.py`)

**Files:**
- Test: `backend/docx_smoke.py` (new — runs directly like the other smokes; no pytest in this repo)
- Create: `backend/export_docx.py`

- [ ] **Step 1: Write the failing smoke**

Create `backend/docx_smoke.py`:

```python
"""Smoke for export_docx.build_brd_docx — run directly, no server needed."""
import io

from docx import Document

from export_docx import build_brd_docx

FIXTURE = {
    "source_filename": "discovery.md",
    "attempt_number": 2,
    "status": "FINAL",
    "draft_2_json": {
        "sections": [
            {
                "name": "Executive Summary",
                "emphasis": "must_have",
                "content": (
                    "The portal cuts onboarding from **6 weeks** to *3 days*.\n"
                    "\n"
                    "- SSO self-serve\n"
                    "- First dashboard wizard\n"
                    "1. Numbered point"
                ),
                "sources": ["chunk_1", "chunk_7"],
            },
            {"name": "Empty Section", "content": ""},
        ]
    },
}


def main() -> None:
    data = build_brd_docx(FIXTURE)
    assert data[:2] == b"PK", "docx must be a zip (PK magic)"

    doc = Document(io.BytesIO(data))
    texts = [p.text for p in doc.paragraphs]
    styles = [p.style.name for p in doc.paragraphs]

    assert "Business Requirements Document" in texts
    assert "Executive Summary" in texts
    assert "Empty Section" in texts, "empty sections keep their heading"
    assert any("Sources: chunk_1, chunk_7" in t for t in texts)
    assert "List Bullet" in styles, "bullet lines must use the bullet style"
    assert "List Number" in styles, "numbered lines must use the number style"

    bold_runs = [r.text for p in doc.paragraphs for r in p.runs if r.bold]
    italic_runs = [r.text for p in doc.paragraphs for r in p.runs if r.italic]
    assert "6 weeks" in bold_runs, f"**bold** must become a bold run, got {bold_runs}"
    assert "3 days" in italic_runs, f"*italic* must become an italic run, got {italic_runs}"

    # A draftless session must raise — the endpoint turns this into a 404.
    try:
        build_brd_docx({"draft_1_json": None, "draft_2_json": None})
        raise AssertionError("expected ValueError for missing draft")
    except ValueError:
        pass

    print("DOCX SMOKE PASSED")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it — must fail on the missing module**

Run (from `backend/`):
```bash
.venv/Scripts/python docx_smoke.py
```
Expected: `ModuleNotFoundError: No module named 'export_docx'`

- [ ] **Step 3: Implement `backend/export_docx.py`**

```python
"""Build a .docx version of the BRD from the structured draft JSON.

Works from draft_N_json rather than the rendered markdown so no markdown
parsing is needed — the draft's sections carry name/content/sources/emphasis
directly (same shape the renderer node consumes).
"""
import io
import re
from datetime import datetime, timezone

from docx import Document
from docx.shared import Pt

_BULLET_RE = re.compile(r"^[-*]\s+")
_NUMBER_RE = re.compile(r"^\d+[.)]\s+")
# **bold** or *italic* tokens; no nesting support — good enough for LLM prose.
_INLINE_RE = re.compile(r"(\*\*.+?\*\*|\*[^*\s][^*]*\*)")


def _add_runs(paragraph, text: str) -> None:
    for token in _INLINE_RE.split(text):
        if not token:
            continue
        if token.startswith("**") and token.endswith("**") and len(token) > 4:
            paragraph.add_run(token[2:-2]).bold = True
        elif token.startswith("*") and token.endswith("*") and len(token) > 2:
            paragraph.add_run(token[1:-1]).italic = True
        else:
            paragraph.add_run(token)


def _add_meta_line(doc, text: str) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.italic = True
    run.font.size = Pt(9)


def build_brd_docx(values: dict) -> bytes:
    """Render the latest draft (draft_2_json, else draft_1_json) to docx bytes.

    Raises ValueError when the session has no draft yet — callers map this
    to an HTTP 404.
    """
    draft = values.get("draft_2_json") or values.get("draft_1_json")
    if not draft or not draft.get("sections"):
        raise ValueError("No draft to export yet.")

    doc = Document()
    doc.add_heading("Business Requirements Document", level=0)

    meta_bits = []
    if values.get("source_filename"):
        meta_bits.append(f"Source: {values['source_filename']}")
    if values.get("attempt_number"):
        meta_bits.append(f"Attempt {values['attempt_number']}")
    if values.get("status"):
        meta_bits.append(str(values["status"]))
    meta_bits.append(datetime.now(timezone.utc).strftime("Exported %Y-%m-%d %H:%M UTC"))
    _add_meta_line(doc, " · ".join(meta_bits))

    for section in draft.get("sections", []):
        doc.add_heading(section.get("name") or "Untitled section", level=1)
        emphasis = section.get("emphasis")
        if emphasis:
            _add_meta_line(doc, f"Emphasis: {str(emphasis).replace('_', ' ').upper()}")
        for line in (section.get("content") or "").splitlines():
            line = line.strip()
            if not line:
                continue
            if _BULLET_RE.match(line):
                p = doc.add_paragraph(style="List Bullet")
                _add_runs(p, _BULLET_RE.sub("", line))
            elif _NUMBER_RE.match(line):
                p = doc.add_paragraph(style="List Number")
                _add_runs(p, _NUMBER_RE.sub("", line))
            else:
                p = doc.add_paragraph()
                _add_runs(p, line)
        sources = section.get("sources") or []
        if sources:
            _add_meta_line(doc, "Sources: " + ", ".join(sources))

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

- [ ] **Step 4: Run the smoke — must pass**

Run (from `backend/`):
```bash
.venv/Scripts/python docx_smoke.py
```
Expected: `DOCX SMOKE PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/export_docx.py backend/docx_smoke.py
git commit -m "Add export_docx: render structured draft JSON to a Word document

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Export endpoint + CORS header exposure + http_smoke coverage

**Files:**
- Modify: `backend/main.py` (imports, CORS block, new endpoint after `delete_session`)
- Modify: `backend/http_smoke.py` (new helper + export assertions)

- [ ] **Step 1: Imports in main.py**

Add `re` to the stdlib import block (it is not imported yet):

```python
import re
```

Add to the local imports (next to `from graph.vectorstore import reset_session`):

```python
from export_docx import build_brd_docx
```

- [ ] **Step 2: Expose Content-Disposition through CORS**

The browser cannot read the download filename cross-origin unless it is exposed. In the `app.add_middleware(CORSMiddleware, ...)` call, add one argument:

```python
    expose_headers=["Content-Disposition"],
```

- [ ] **Step 3: Add the endpoint**

In `backend/main.py`, directly after the `delete_session` function, add:

```python
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
```

(`Response` must be added to the existing `from fastapi.responses import JSONResponse` line: `from fastapi.responses import JSONResponse, Response`.)

- [ ] **Step 4: Extend http_smoke.py**

Add `urllib.error` to the imports at the top of `backend/http_smoke.py`:

```python
import urllib.error
```

Add a bytes-fetching helper next to `_get`:

```python
def _get_bytes(path: str) -> tuple[bytes, str, str]:
    with urllib.request.urlopen(BASE + path) as resp:
        return (
            resp.read(),
            resp.headers.get("Content-Type", ""),
            resp.headers.get("Content-Disposition", ""),
        )
```

In `main()`, after the `trace entries:` print and before `print("HTTP SMOKE PASSED")`, add:

```python
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
```

- [ ] **Step 5: Restart the backend so the new endpoint loads**

Stop the running uvicorn, then (from `backend/`):
```bash
.venv/Scripts/python -m uvicorn main:app --port 8765
```
(run in background; wait for "Application startup complete")

- [ ] **Step 6: Run the HTTP smoke — must pass**

Run (from `backend/`):
```bash
.venv/Scripts/python http_smoke.py
```
Expected output ends with:
```
export: <N> bytes docx (attachment; filename="BRD-....docx")
export 404 on draftless session: OK
HTTP SMOKE PASSED
```

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/http_smoke.py
git commit -m "Add GET /api/sessions/{id}/export/docx behind the auth gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — `exportDocx` API helper + download button

**Files:**
- Modify: `frontend/lib/api.ts` (new function, after `getSource`)
- Modify: `frontend/components/ChatPane.tsx` (import, state, handler, header button, error line)

- [ ] **Step 1: Add `exportDocx` to api.ts**

Append to `frontend/lib/api.ts`:

```typescript
/** Download the latest draft as .docx. Fetched as a blob (not a bare link)
 *  so the X-App-Token header can ride along when the password gate is on. */
export async function exportDocx(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/export/docx`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `${res.status} ${res.statusText}: ${body}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      // not JSON; keep the default
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const dispo = res.headers.get("Content-Disposition") || "";
  const match = dispo.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : "BRD.docx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Wire the button into ChatPane**

In `frontend/components/ChatPane.tsx`:

(a) Add the value import after the existing type-only import (line 4):

```typescript
import { exportDocx } from "@/lib/api";
```

(b) Add two state hooks directly after the existing `feedback` useState (line 27):

```typescript
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
```

(c) Add the handler just after the `const isFinal = status === "FINAL";` line:

```typescript
  async function handleExport() {
    if (!snapshot) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportDocx(snapshot.session_id);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }
```

(d) In the draft header row, replace the lone finalized chip line:

```tsx
          {isFinal && <span className="chip chip-good">✓ finalized</span>}
```

with a right-side group containing the chip and the download button:

```tsx
          <div className="flex items-center gap-2">
            {isFinal && <span className="chip chip-good">✓ finalized</span>}
            {draftMd && (
              <button
                type="button"
                className="chip hover:text-accent hover:border-accent transition disabled:opacity-50"
                disabled={exporting}
                onClick={handleExport}
              >
                {exporting ? "Exporting…" : "⬇ Download .docx"}
              </button>
            )}
          </div>
```

(e) Add the error line between the header row's closing `</div>` and the `max-h-[58vh]` scroll container:

```tsx
        {exportError && (
          <div className="text-xs text-danger mb-3">{exportError}</div>
        )}
```

- [ ] **Step 3: Type-check**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: exit 0, no output.

- [ ] **Step 4: Verify in the running app**

The Next dev server hot-reloads. Drive a session to FEEDBACK_1 (upload `samples/customer_onboarding_discovery.md`, submit emphasis), then click "⬇ Download .docx" — a `BRD-customer_onboarding_discovery.docx` file downloads and opens in Word/LibreOffice with title, headings, bullets, and Sources lines.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/components/ChatPane.tsx
git commit -m "Add Download .docx button to the draft header

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: README API table + final verification + push

**Files:**
- Modify: `README.md` (API surface table)

- [ ] **Step 1: Document the endpoint**

In `README.md`'s API surface table, add after the `/history` row:

```markdown
| GET  | `/api/sessions/{id}/export/docx` | Download the latest draft as a Word document |
```

- [ ] **Step 2: Full verification sweep**

Run (from `backend/`):
```bash
.venv/Scripts/python smoke_test.py
.venv/Scripts/python docx_smoke.py
.venv/Scripts/python http_smoke.py
```
Expected: `SMOKE TEST PASSED`, `DOCX SMOKE PASSED`, `HTTP SMOKE PASSED`.

Run (from `frontend/`):
```bash
npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "Document the docx export endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

### Task 6 (manual, user-driven): Real-content verification

No code. The user creates `backend/.env` themselves (never share the key in chat):

```
OPENAI_API_KEY=sk-...
```

Then restart the backend and run one full session in the UI: the drafts should contain real GPT-4o prose (no `[STUB]` markers), and the exported .docx should read as a finished document. The trace panel's drafter entry shows the exact prompt that produced it.
