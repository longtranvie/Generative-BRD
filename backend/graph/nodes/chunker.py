import re

from graph.nodes._helpers import now_iso, make_trace

_MD_HEADER_RE = re.compile(r"(?m)^#{1,6}\s+\S")


def _looks_like_markdown(text: str, filename: str | None) -> bool:
    if filename and filename.lower().endswith(".md"):
        return True
    return bool(_MD_HEADER_RE.search(text or ""))


def _heading_path(meta: dict) -> str | None:
    parts = [meta.get(k) for k in ("h1", "h2", "h3")]
    parts = [p for p in parts if p]
    return " > ".join(parts) if parts else None


def _locate(text: str, piece: str, cursor: int) -> int:
    """Best-effort offset recovery: find `piece` in `text` at or after `cursor`."""
    if not piece:
        return cursor
    loc = text.find(piece, cursor)
    if loc != -1:
        return loc
    loc = text.find(piece)
    return loc if loc != -1 else cursor


def _chunk_markdown(text: str, size: int, overlap: int) -> list[dict]:
    from langchain_text_splitters import (
        MarkdownHeaderTextSplitter,
        RecursiveCharacterTextSplitter,
    )

    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")],
        strip_headers=False,
    )
    header_docs = header_splitter.split_text(text)

    recursive = RecursiveCharacterTextSplitter(
        chunk_size=size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    docs = recursive.split_documents(header_docs)

    chunks: list[dict] = []
    cursor = 0
    for i, d in enumerate(docs):
        piece = (d.page_content or "").strip()
        if not piece:
            continue
        char_start = _locate(text, piece, cursor)
        char_end = char_start + len(piece)
        cursor = char_start + max(1, len(piece) - overlap)
        chunk: dict = {
            "id": f"chunk_{i}",
            "text": piece,
            "char_start": char_start,
            "char_end": char_end,
        }
        hp = _heading_path(d.metadata or {})
        if hp:
            chunk["heading_path"] = hp
        chunks.append(chunk)
    return chunks


def _recursive_split(text: str, size: int = 800, overlap: int = 100) -> list[dict]:
    if not text:
        return []
    chunks: list[dict] = []
    i = 0
    idx = 0
    n = len(text)
    while i < n:
        end = min(i + size, n)
        # try to break on a paragraph or sentence near the end
        if end < n:
            window = text[i:end]
            br = max(window.rfind("\n\n"), window.rfind("\n"), window.rfind(". "))
            if br > size // 2:
                end = i + br + 1
        piece = text[i:end].strip()
        if piece:
            chunks.append({
                "id": f"chunk_{idx}",
                "text": piece,
                "char_start": i,
                "char_end": end,
            })
            idx += 1
        if end == n:
            break
        i = max(end - overlap, i + 1)
    return chunks


def chunker(state: dict) -> dict:
    started = now_iso()
    text = state.get("source_text") or ""
    filename = state.get("source_filename")
    size, overlap = 800, 100

    if _looks_like_markdown(text, filename):
        chunks = _chunk_markdown(text, size=size, overlap=overlap)
        strategy = "markdown_header+recursive"
    else:
        chunks = _recursive_split(text, size=size, overlap=overlap)
        strategy = "recursive_char"

    with_headings = sum(1 for c in chunks if c.get("heading_path"))
    trace = make_trace(
        "chunker",
        started,
        input_summary=f"{len(text)} chars of source text",
        output_summary=(
            f"{len(chunks)} chunks produced via {strategy}"
            + (f" ({with_headings} with heading_path)" if with_headings else "")
        ),
        payload={
            "chunk_size": size,
            "overlap": overlap,
            "total_chunks": len(chunks),
            "strategy": strategy,
            "chunks_with_heading_path": with_headings,
        },
    )
    return {
        "chunks": chunks,
        "trace_log": state.get("trace_log", []) + [trace],
        "current_node": "chunker",
    }
