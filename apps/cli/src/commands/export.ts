export interface ExportOptions {
  scanId: string;
  api: string;
  token: string | undefined;
  format: string;
}

export async function cmdExport(opts: ExportOptions): Promise<void> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${opts.api.replace(/\/$/, "")}/v1/scans/${opts.scanId}/components`, {
    headers,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  process.stdout.write(JSON.stringify(body, null, 2) + "\n");
}
