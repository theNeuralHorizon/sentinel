// Adapter is selected at build time via the ADAPTER env var:
//   ADAPTER=vercel  — zero-config Vercel deploy (default when $VERCEL is set)
//   ADAPTER=node    — adapter-node for Docker / Render
// Local `vite build` falls back to adapter-node.

import adapterNode from "@sveltejs/adapter-node";
import adapterVercel from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const target = process.env.ADAPTER ?? (process.env.VERCEL ? "vercel" : "node");

const adapter =
  target === "vercel"
    ? adapterVercel({
        // jose + nats both hit Node builtins — Edge runtime won't work.
        runtime: "nodejs22.x",
        regions: ["iad1"],
      })
    : adapterNode({ out: "build", precompress: true });

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter,
    alias: { "$lib/*": "src/lib/*" },
    // CSP on every rendered page — Vercel + Render both respect these headers.
    csp: {
      mode: "auto",
      directives: {
        "default-src": ["self"],
        "script-src": ["self"],
        "style-src": ["self", "unsafe-inline"],
        "img-src": ["self", "data:"],
        "connect-src": ["self", "https:", "wss:"],
        "frame-ancestors": ["none"],
        "base-uri": ["self"],
      },
    },
  },
};
