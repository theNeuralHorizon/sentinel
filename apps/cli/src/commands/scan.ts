import { writeFileSync } from "node:fs";

export interface ScanOptions {
  path: string;
  out: string | undefined;
  format: string;
  api: string;
  token: string | undefined;
}

// Drives a scan via the Sentinel API. The API relays to the scanner service,
// so the CLI doesn't need Go tooling locally.
export async function cmdScan(opts: ScanOptions): Promise<void> {
  console.log(`Sentinel scan → ${opts.path}`);
  const payload = {
    projectSlug: "cli-adhoc",
    workDir: opts.path,
    triggeredBy: "cli",
    kind: "full",
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${opts.api.replace(/\/$/, "")}/v1/scans`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const { scan } = (await res.json()) as { scan: { id: string; status: string } };
  console.log(`scan queued → id=${scan.id} status=${scan.status}`);

  // Poll for completion.
  const deadline = Date.now() + 120_000;
  let finalStatus = scan.status;
  while (Date.now() < deadline && finalStatus !== "completed" && finalStatus !== "failed") {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${opts.api.replace(/\/$/, "")}/v1/scans/${scan.id}`, { headers });
    if (!poll.ok) continue;
    const body = (await poll.json()) as { scan: { status: string } };
    finalStatus = body.scan.status;
    process.stdout.write(".");
  }
  console.log();
  console.log(`status=${finalStatus}`);

  if (opts.out) {
    const body = await (
      await fetch(`${opts.api.replace(/\/$/, "")}/v1/scans/${scan.id}/components`, { headers })
    ).json();
    writeFileSync(opts.out, JSON.stringify(body, null, 2));
    console.log(`wrote ${opts.out}`);
  }
}
