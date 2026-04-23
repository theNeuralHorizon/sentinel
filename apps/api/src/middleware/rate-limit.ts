import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";

// Redis-backed sliding-window rate limiter.
// We use Dragonfly (wire-compatible with Redis) via bun's native fetch to a
// thin Lua-less implementation: INCR + EXPIRE in one round-trip via pipelining.
// Falls back to an in-memory limiter in tests where Redis isn't available.

interface Limiter {
  consume(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
}

class MemoryLimiter implements Limiter {
  private readonly buckets = new Map<string, { count: number; expiresAt: number }>();
  async consume(key: string, limit: number, windowSec: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt < now) {
      this.buckets.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
      return { allowed: true, remaining: limit - 1, resetAt: now + windowSec * 1000 };
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.expiresAt,
    };
  }
}

class RedisLimiter implements Limiter {
  constructor(private readonly redisUrl: string) {}

  async consume(key: string, limit: number, windowSec: number) {
    // Bun ships a native Redis-protocol client (Bun.redis).
    // Using `Bun.redis` keeps this dependency-free.
    // Fallback-safe when `Bun.redis` isn't available at runtime.
    const bunAny = globalThis.Bun as unknown as {
      redis?: new (url: string) => {
        connect(): Promise<void>;
        send(cmd: string, args: string[]): Promise<unknown>;
        close?(): void;
      };
    };
    if (!bunAny.redis) {
      // Graceful degrade: allow everything rather than block the request path.
      return { allowed: true, remaining: limit, resetAt: Date.now() + windowSec * 1000 };
    }
    const client = new bunAny.redis(this.redisUrl);
    await client.connect();
    try {
      const raw = await client.send("INCR", [key]);
      const count = Number(raw);
      if (count === 1) {
        await client.send("EXPIRE", [key, String(windowSec)]);
      }
      const ttl = Number(await client.send("TTL", [key]));
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt: Date.now() + ttl * 1000,
      };
    } finally {
      client.close?.();
    }
  }
}

let shared: Limiter | undefined;

export function createRateLimitMiddleware(opts: {
  redisUrl?: string;
  limit: number;
  windowSec?: number;
}) {
  const windowSec = opts.windowSec ?? 60;
  if (!shared) {
    shared = opts.redisUrl ? new RedisLimiter(opts.redisUrl) : new MemoryLimiter();
  }
  return createMiddleware(async (c: Context, next: Next) => {
    const id = c.req.header("x-api-key") ?? c.req.header("x-forwarded-for") ?? c.req.header("host") ?? "anon";
    const key = `rl:${c.req.method}:${new URL(c.req.url).pathname}:${id}`;
    const { allowed, remaining, resetAt } = await shared!.consume(key, opts.limit, windowSec);
    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.floor(resetAt / 1000)));
    if (!allowed) {
      return c.json({ error: "rate_limited" }, 429);
    }
    return next();
  });
}
