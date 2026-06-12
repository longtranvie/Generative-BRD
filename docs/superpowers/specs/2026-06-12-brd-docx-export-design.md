# Complete BRD output: real LLM content + Word export

**Date:** 2026-06-12
**Status:** Approved

## Goal

A finished session should yield a complete BRD the user can take away:
prose written by the real LLM (not `[STUB]` placeholders) and a
downloadable `.docx` file.

## Context

- Drafter/Critic/Evaluator already call GPT-4o when `OPENAI_API_KEY` is
  set; without it they degrade to deterministic stubs. The user has a
  key — the content half is configuration, not code.
- The rendered BRD currently lives only in `DraftView` (screen) and the
  `/state` payload. There is no export of any kind.
- The API sits behind the `X-App-Token` gate middleware when
  `APP_PASSWORD` is set, and mutating calls are rate-limited.

## Design

### 1. Real content (configuration only)

- The user sets `OPENAI_API_KEY` themselves (never pasted into chat or
  committed).
- Convenience: `main.py` loads `backend/.env` at startup via
  `python-dotenv` (`load_dotenv()` before reading any env). `.env` is
  already gitignored.
- No model, prompt, or node changes.

### 2. Backend: `GET /api/sessions/{session_id}/export/docx`

- Draft selection mirrors the finalizer: `draft_2_json` if present,
  else `draft_1_json`; neither → `404 {"detail": "No draft to export yet."}`.
- New module `backend/export_docx.py` exposing
  `build_brd_docx(values: dict) -> bytes` built on **python-docx**:
  - Title paragraph "Business Requirements Document" + a small meta
    line: source filename, export date, attempt, status.
  - Per section (from the draft JSON's `sections` list):
    - Heading 1: section `name`
    - Small italic line: emphasis level (when present)
    - `content` rendered line by line: `- ` / `* ` prefixes → bullet
      list items, `1. `-style prefixes → numbered list items, blank
      lines separate paragraphs, everything else → body paragraphs.
      Inline `**bold**` / `*italic*` split into styled runs with a
      simple regex tokenizer (no nesting support — good enough for
      GPT-4o prose).
    - Small italic line: `Sources: chunk_a, chunk_b` (when present)
- Endpoint returns the bytes with the docx media type and
  `Content-Disposition: attachment; filename="BRD-<slug>.docx"` where
  slug = sanitized source filename stem, falling back to the first 8
  chars of the session id.
- Sits behind the existing auth gate middleware automatically (GET is
  not rate-limited; the gate still applies when `APP_PASSWORD` is set).
- `requirements.txt` gains `python-docx` and `python-dotenv`.

### 3. Frontend

- `lib/api.ts`: `exportDocx(sessionId)` — fetches the endpoint with
  `authHeaders()` as a blob (a bare `<a href>` cannot carry the token
  and would 401 when the password gate is on), reads the filename from
  `Content-Disposition` (fallback `BRD.docx`), triggers a download via
  a temporary object URL.
- Download button ("Download .docx") in the DraftView area, visible
  whenever a draft exists, disabled while the download is in flight;
  errors surface through the existing error-display pattern.

### 4. Testing

- `http_smoke.py`: after the session reaches FINAL, call the export
  endpoint — assert HTTP 200, the docx content type, and that the body
  starts with `PK` (docx = zip). Works in stub mode, so it runs keyless
  in CI and on dev machines.
- Manual verification with the real key: run one full session and open
  the generated file.

## Edge cases

- Unknown session id → empty snapshot → no draft JSON → 404.
- Sections with empty `content` still render their heading (empty body).
- Vietnamese / non-ASCII text: python-docx is unicode-native; the
  default font handles it.
- Filename slug strips characters outside `[A-Za-z0-9._-]`.

## Out of scope (deliberate)

- PDF / Markdown export
- Output-language selection
- Embedding evaluator scores in the document
- Custom templates
