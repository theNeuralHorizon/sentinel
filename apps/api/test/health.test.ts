import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

// Basic smoke test: confirm Hono app can be constructed with our shape.
// Integration tests against real Postgres live under /e2e.
describe("api smoke", () => {
  it("returns JSON on /", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ ok: true }));
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
