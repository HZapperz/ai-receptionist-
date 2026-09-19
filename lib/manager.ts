export type ManagerRuntimeStatus = "idle" | "running" | "unavailable";
export type ManagerEventStatus = "queued" | "running" | "completed" | "failed" | "interrupted";
export type ManagerEventSource = "chat" | "twilio" | "approval" | "worker";
export type ManagerApprovalKind = "send_sms" | "book";
export type ManagerApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "failed"
  | "interrupted";
export type ManagerTaskStatus = "working" | "waiting" | "needs_approval" | "done";

export type ManagerSession = {
  id: string;
  session_file: string | null;
};

export type ManagerMessage = {
  id: string;
  session_id: string;
  event_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export type ManagerEvent = {
  id: string;
  session_id: string;
  source: ManagerEventSource;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  status: ManagerEventStatus;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type ManagerTask = {
  id: string;
  session_id: string;
  title: string;
  status: ManagerTaskStatus;
  detail: string;
  created_at: string;
  updated_at: string;
};

export type ManagerApproval = {
  id: string;
  session_id: string;
  kind: ManagerApprovalKind;
  payload: Record<string, unknown>;
  status: ManagerApprovalStatus;
  result: Record<string, unknown> | null;
  created_at: string;
};

export type ManagerRuntime = {
  status: ManagerRuntimeStatus;
  error?: string;
};

export type ManagerState = {
  session: ManagerSession;
  messages: ManagerMessage[];
  events: ManagerEvent[];
  tasks: ManagerTask[];
  approvals: ManagerApproval[];
  runtime: ManagerRuntime;
};

export type EnqueuedManagerEvent = {
  event_id: string;
  status: ManagerEventStatus;
};

async function managerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/agents${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let detail = "The manager service did not accept the request.";
    try {
      const body = (await response.json()) as { detail?: string; error?: string };
      detail = body.detail || body.error || detail;
    } catch {
      const text = await response.text();
      if (text) detail = text;
    }
    throw new Error(`${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

export function getManagerState(): Promise<ManagerState> {
  return managerRequest<ManagerState>("/manager", { method: "GET" });
}

export function enqueueManagerMessage(message: string, clientId: string): Promise<EnqueuedManagerEvent> {
  return managerRequest<EnqueuedManagerEvent>("/manager", {
    method: "POST",
    body: JSON.stringify({ message, client_id: clientId }),
  });
}

export function decideManagerApproval(
  approvalId: string,
  decision: "approve" | "reject",
): Promise<ManagerApproval> {
  return managerRequest<ManagerApproval>(`/manager/approvals/${encodeURIComponent(approvalId)}`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function createClientId(): string {
  return crypto.randomUUID();
}
