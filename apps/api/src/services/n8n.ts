import { logger } from "../logger";

// Minimal n8n client. Only what the remediation flow needs.
export interface N8nConfig {
  baseUrl: string;
  apiKey?: string;
  webhookBase?: string;
}

export class N8nClient {
  constructor(private readonly cfg: N8nConfig) {}

  async triggerWebhook(workflow: string, payload: unknown): Promise<{ executionId: string }> {
    // Treat empty string as "not configured" — `??` would keep "" and break
    // the URL builder. Fall through to baseUrl/webhook in that case.
    const configured = this.cfg.webhookBase && this.cfg.webhookBase.length > 0
      ? this.cfg.webhookBase
      : `${this.cfg.baseUrl.replace(/\/$/, "")}/webhook`;
    const url = `${configured.replace(/\/$/, "")}/${workflow}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.cfg.apiKey ? { "X-N8N-API-KEY": this.cfg.apiKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`n8n webhook ${res.status}: ${text}`);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { executionId: String(body.executionId ?? "") };
  }

  async listWorkflows(): Promise<Array<{ id: string; name: string; active: boolean }>> {
    if (!this.cfg.apiKey) {
      logger.warn("no n8n api key configured; returning empty list");
      return [];
    }
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}/api/v1/workflows`;
    const res = await fetch(url, { headers: { "X-N8N-API-KEY": this.cfg.apiKey } });
    if (!res.ok) {
      throw new Error(`n8n workflows ${res.status}`);
    }
    const body = (await res.json()) as { data: Array<{ id: string; name: string; active: boolean }> };
    return body.data ?? [];
  }
}
