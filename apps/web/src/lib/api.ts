import { browser } from "$app/environment";

const API_BASE = (import.meta.env.VITE_PUBLIC_API_URL as string | undefined) ??
  (browser ? "http://localhost:4000" : "http://api:4000");

const WS_BASE = (import.meta.env.VITE_PUBLIC_WS_URL as string | undefined) ??
  (browser ? "ws://localhost:4000/ws" : "ws://api:4000/ws");

let _token: string | null = null;

export function setToken(t: string | null): void {
  _token = t;
  if (browser) {
    if (t) localStorage.setItem("sentinel.token", t);
    else localStorage.removeItem("sentinel.token");
  }
}

export function getToken(): string | null {
  if (_token) return _token;
  if (browser) _token = localStorage.getItem("sentinel.token");
  return _token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  async devLogin(username: string, role: "admin" | "analyst" | "viewer" = "analyst") {
    const res = await fetch(`${API_BASE}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "dev", role }),
    });
    if (!res.ok) throw new Error(`login failed: ${res.status}`);
    const body = (await res.json()) as { token: string };
    setToken(body.token);
    return body.token;
  },

  summary: () => request<{
    overall: Record<string, number | string | null>;
    topRisks: Array<Record<string, unknown>>;
    byEcosystem: Array<{ ecosystem: string; components: number; vulnerabilities: number }>;
  }>(`/v1/metrics/summary`),

  listProjects: () => request<{ projects: Array<{ id: string; slug: string; name: string; description?: string; createdAt: string }> }>(`/v1/projects`),

  getProject: (slug: string) => request<{ project: Record<string, unknown> }>(`/v1/projects/${slug}`),

  listScans: (slug: string) => request<{ scans: Array<Record<string, unknown>> }>(`/v1/projects/${slug}/scans`),

  getScan: (id: string) => request<{ scan: Record<string, unknown> }>(`/v1/scans/${id}`),

  getVulns: (id: string) => request<{ vulnerabilities: Array<Record<string, unknown>> }>(`/v1/scans/${id}/vulnerabilities`),

  getComponents: (id: string) => request<{ components: Array<Record<string, unknown>> }>(`/v1/scans/${id}/components`),

  triggerScan: (body: { projectSlug: string; workDir: string; gitRef?: string; commitSha?: string }) =>
    request<{ scan: Record<string, unknown> }>(`/v1/scans`, {
      method: "POST",
      body: JSON.stringify({ ...body, kind: "full", triggeredBy: "web" }),
    }),

  listRemediations: () => request<{ remediations: Array<Record<string, unknown>> }>(`/v1/remediations`),

  approveRemediation: (id: string, approvedBy: string) =>
    request<{ remediation: Record<string, unknown> }>(`/v1/remediations/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approvedBy }),
    }),

  similaritySearch: (query: string, topK = 20, ecosystem?: string) =>
    request<{ results: Array<Record<string, unknown>> }>(`/v1/search/similar`, {
      method: "POST",
      body: JSON.stringify({ query, topK, ecosystem }),
    }),
};

export interface WsMessage {
  topic: string;
  message: { kind: string; payload?: Record<string, unknown>; scanId?: string; scan?: Record<string, unknown> };
}

export function openWs(topics: string[], onMessage: (m: WsMessage) => void): { close(): void } {
  if (!browser) return { close() {} };
  const token = getToken();
  if (!token) return { close() {} };
  const url = `${WS_BASE}?token=${encodeURIComponent(token)}&topics=${encodeURIComponent(topics.join(","))}`;
  let ws: WebSocket | null = null;
  let retries = 0;
  let closed = false;

  const connect = () => {
    ws = new WebSocket(url);
    ws.onmessage = (evt) => {
      try {
        onMessage(JSON.parse(evt.data as string) as WsMessage);
      } catch {
        // ignore malformed
      }
    };
    ws.onclose = () => {
      if (closed) return;
      retries += 1;
      const delay = Math.min(30_000, 1000 * 2 ** retries);
      setTimeout(connect, delay);
    };
  };

  connect();
  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}
