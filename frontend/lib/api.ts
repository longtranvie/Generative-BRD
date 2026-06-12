export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8765";

// ─── Auth token ──────────────────────────────────────────────────────
// The backend enforces the demo password (APP_PASSWORD env) server-side;
// every request carries the token the user entered at the gate.

const TOKEN_KEY = "brd_app_token";

export function getStoredToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function storeToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked — token lives for this page load only */
  }
}

function authHeaders(): Record<string, string> {
  const t = getStoredToken();
  return t ? { "X-App-Token": t } : {};
}

export interface AuthCheck {
  auth_required: boolean;
  ok: boolean;
}

/** Probe the gate. With an explicit token, validates that token;
 *  otherwise validates the stored one (if any). */
export async function checkAuth(token?: string): Promise<AuthCheck> {
  const headers: Record<string, string> = {};
  const t = token !== undefined ? token : getStoredToken();
  if (t) headers["X-App-Token"] = t;
  return json(await fetch(`${API_BASE}/api/auth/check`, { headers }));
}

export type Emphasis = "must_have" | "good_to_have" | "can_live_with" | "dont_need";
export type SessionStatus = "DRAFT_1" | "FEEDBACK_1" | "DRAFT_2" | "FEEDBACK_2" | "FINAL";

export interface TraceEntry {
  node_name: string;
  started_at: string;
  completed_at: string | null;
  input_summary: string;
  output_summary: string;
  payload: Record<string, unknown>;
  status: "running" | "done" | "error";
}

export interface SessionSnapshot {
  session_id: string;
  current_node: string | null;
  status: SessionStatus | null;
  attempt_number: number | null;
  next_nodes: string[];
  draft_1_markdown: string | null;
  draft_2_markdown: string | null;
  trace_log: TraceEntry[];
  base_template: TemplateSection[];
  mutated_template: TemplateSection[];
  emphasis: Record<string, Emphasis>;
  source_filename: string | null;
  awaiting?: "emphasis" | "feedback" | null;
}

export interface TemplateSection {
  id: string;
  name: string;
  description: string;
  retrieval_query: string;
  emphasis?: Emphasis;
}

export interface SessionListItem {
  session_id: string;
  title: string;
  status: SessionStatus | null;
  attempt_number: number | null;
  source_filename: string | null;
  draft_preview: string;
}

export async function listSessions(): Promise<{ sessions: SessionListItem[] }> {
  return json(await fetch(`${API_BASE}/api/sessions`, { headers: authHeaders() }));
}

export interface CheckpointMeta {
  checkpoint_id: string;
  next_nodes: string[];
  current_node: string | null;
  status: SessionStatus | null;
  attempt_number: number | null;
  created_at: string | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    // FastAPI HTTPException puts the human-readable message in `detail`.
    // Pull it out so the UI shows "input too short" instead of
    // `Error: 400 Bad Request: {"detail":"input too short"}`.
    let message = `${res.status} ${res.statusText}: ${body}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.detail === "string") {
        message = parsed.detail;
      }
    } catch {
      // not JSON; keep the default
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function createSession(): Promise<{ session_id: string }> {
  return json(
    await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: authHeaders(),
    }),
  );
}

export async function deleteSession(
  sessionId: string,
): Promise<{ deleted: string }> {
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: authHeaders(),
    }),
  );
}

export async function uploadText(
  sessionId: string,
  text: string,
): Promise<SessionSnapshot> {
  const form = new FormData();
  form.append("text", text);
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      body: form,
      headers: authHeaders(),
    }),
  );
}

export async function uploadFile(
  sessionId: string,
  file: File,
): Promise<SessionSnapshot> {
  const form = new FormData();
  form.append("file", file);
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      body: form,
      headers: authHeaders(),
    }),
  );
}

export async function submitEmphasis(
  sessionId: string,
  emphasis: Record<string, Emphasis>,
): Promise<SessionSnapshot> {
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/emphasis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ emphasis }),
    }),
  );
}

export async function submitFeedback(
  sessionId: string,
  feedback: string,
): Promise<SessionSnapshot> {
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ feedback }),
    }),
  );
}

export async function finalizeSession(
  sessionId: string,
): Promise<SessionSnapshot> {
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/finalize`, {
      method: "POST",
      headers: authHeaders(),
    }),
  );
}

export async function getState(sessionId: string): Promise<SessionSnapshot> {
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/state`, {
      headers: authHeaders(),
    }),
  );
}

export async function getTrace(
  sessionId: string,
): Promise<{ trace_log: TraceEntry[] }> {
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/trace`, {
      headers: authHeaders(),
    }),
  );
}

export async function getHistory(
  sessionId: string,
): Promise<{ checkpoints: CheckpointMeta[] }> {
  return json(
    await fetch(`${API_BASE}/api/sessions/${sessionId}/history`, {
      headers: authHeaders(),
    }),
  );
}

export interface SourceFile {
  path: string;
  language: string;
  lines: number;
  content: string;
}

export async function getSource(path: string): Promise<SourceFile> {
  const url = `${API_BASE}/api/source?path=${encodeURIComponent(path)}`;
  return json(await fetch(url, { headers: authHeaders() }));
}

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
