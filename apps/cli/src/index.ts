#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { cmdScan } from "./commands/scan";
import { cmdDiff } from "./commands/diff";
import { cmdExport } from "./commands/export";

const USAGE = `sentinel-cli — Sentinel command-line interface

Usage:
  sentinel-cli scan <path> [--out <file>] [--format cdx|spdx|json] [--api <url>] [--token <jwt>]
  sentinel-cli diff <base.cdx.json> <head.cdx.json>
  sentinel-cli export <scanId> --api <url> --token <jwt> [--format cdx|spdx]

Global flags:
  --help      Show this help
  --version   Print version`;

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: "boolean" },
      version: { type: "boolean" },
      out: { type: "string" },
      format: { type: "string" },
      api: { type: "string" },
      token: { type: "string" },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }
  if (values.version) {
    console.log(VERSION);
    process.exit(0);
  }

  const [command, ...rest] = positionals;
  try {
    switch (command) {
      case "scan": {
        const path = rest[0];
        if (!path) {
          console.error("scan: path required");
          process.exit(2);
        }
        const resolved = resolve(path);
        if (!existsSync(resolved)) {
          console.error(`scan: path does not exist: ${resolved}`);
          process.exit(2);
        }
        await cmdScan({
          path: resolved,
          out: values.out as string | undefined,
          format: (values.format as string | undefined) ?? "cdx",
          api: (values.api as string | undefined) ?? "http://localhost:4000",
          token: values.token as string | undefined,
        });
        return;
      }
      case "diff": {
        const base = rest[0];
        const head = rest[1];
        if (!base || !head) {
          console.error("diff: base and head SBOM files required");
          process.exit(2);
        }
        await cmdDiff({ base: resolve(base), head: resolve(head) });
        return;
      }
      case "export": {
        const scanId = rest[0];
        if (!scanId) {
          console.error("export: scan id required");
          process.exit(2);
        }
        await cmdExport({
          scanId,
          api: (values.api as string | undefined) ?? "http://localhost:4000",
          token: values.token as string | undefined,
          format: (values.format as string | undefined) ?? "cdx",
        });
        return;
      }
      default:
        console.error(`unknown command: ${command}`);
        console.log(USAGE);
        process.exit(2);
    }
  } catch (err) {
    console.error("error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

await main();
