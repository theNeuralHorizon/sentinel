// Svelte 5 rune-based stores. These are reactive singletons — no `writable`.
import { onDestroy } from "svelte";
import { api, openWs, type WsMessage } from "./api";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface LiveFeedEntry {
  id: string;
  ts: number;
  kind: string;
  label: string;
  severity: Severity | undefined;
}

// Live activity feed powered by the API's WebSocket bridge.
export function createLiveFeed(topics: string[] = ["global"]) {
  let entries = $state<LiveFeedEntry[]>([]);
  let connected = $state(false);

  const handle = (m: WsMessage) => {
    connected = true;
    const id = crypto.randomUUID();
    const ts = Date.now();
    const kind = m.message.kind;
    let label = kind;
    let severity: Severity | undefined = undefined;

    if (kind === "sentinel.scan.completed") {
      const p = m.message.payload as { componentCount?: number; vulnCount?: number };
      label = `scan completed — ${p?.componentCount ?? "?"} components, ${p?.vulnCount ?? 0} vulns`;
    } else if (kind === "sentinel.scan.started" || kind === "scan:started") {
      label = "scan started";
    } else if (kind === "sentinel.vulnerability.discovered") {
      const p = m.message.payload as { severity?: Severity; advisoryId?: string };
      severity = p?.severity;
      label = `${p?.advisoryId} discovered`;
    } else if (kind === "sentinel.remediation.proposed") {
      label = "remediation proposed";
    } else if (kind === "sentinel.remediation.dispatched") {
      label = "remediation dispatched";
    }

    entries = [{ id, ts, kind, label, severity }, ...entries].slice(0, 50);
  };

  const sub = openWs(topics, handle);
  onDestroy(() => sub.close());

  return {
    get entries() { return entries; },
    get connected() { return connected; },
  };
}

// Global auth store.
export function createAuthStore() {
  let token = $state<string | null>(null);
  let username = $state<string | null>(null);

  async function devLogin(user: string, role: "admin" | "analyst" | "viewer" = "analyst") {
    const t = await api.devLogin(user, role);
    token = t;
    username = user;
  }

  function logout() {
    token = null;
    username = null;
  }

  return {
    get token() { return token; },
    get username() { return username; },
    devLogin,
    logout,
  };
}
