export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8765";

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
  return json(await fetch(`${API_BASE}/api/sessions`));
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
  return json(await fetch(`${API_BASE}/api/sessions`, { method: "POST" }));
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
    }),
  );
}

export async function getState(sessionId: string): Promise<SessionSnapshot> {
  return json(await fetch(`${API_BASE}/api/sessions/${sessionId}/state`));
}

export async function getTrace(
  sessionId: string,
): Promise<{ trace_log: TraceEntry[] }> {
  return json(await fetch(`${API_BASE}/api/sessions/${sessionId}/trace`));
}

export async function getHistory(
  sessionId: string,
): Promise<{ checkpoints: CheckpointMeta[] }> {
  return json(await fetch(`${API_BASE}/api/sessions/${sessionId}/history`));
}

export interface SourceFile {
  path: string;
  language: string;
  lines: number;
  content: string;
}

export async function getSource(path: string): Promise<SourceFile> {
  const url = `${API_BASE}/api/source?path=${encodeURIComponent(path)}`;
  return json(await fetch(url));
}
