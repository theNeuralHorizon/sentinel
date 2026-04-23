import { logger } from "../logger";
import type { ScanRequest, ScanResult } from "@sentinel/shared";

export class ScannerClient {
  constructor(private readonly baseUrl: string) {}

  async scan(req: ScanRequest & { scanId: string }): Promise<ScanResult> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/scan`;
    const started = performance.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`scanner ${res.status}: ${text}`);
    }
    const body = (await res.json()) as ScanResult;
    logger.info(
      { scanId: req.scanId, components: body.componentCount, ms: Math.round(performance.now() - started) },
      "scanner returned result",
    );
    return body;
  }
}
