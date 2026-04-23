import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { jwtVerify, SignJWT } from "jose";

export interface JwtClaims {
  sub: string;
  role: "admin" | "analyst" | "viewer" | "service";
  tenant?: string;
}

export interface AuthedVars {
  user: JwtClaims;
}

export function createAuthMiddleware(secret: string) {
  const key = new TextEncoder().encode(secret);

  return createMiddleware<{ Variables: AuthedVars }>(async (c: Context, next: Next) => {
    // Allow unauthenticated health probes and WebSocket upgrades under /ws
    // (WS has its own JWT-in-query handshake).
    const path = c.req.path;
    if (path === "/healthz" || path === "/" || path === "/readyz") {
      return next();
    }

    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const token = header.slice("Bearer ".length);

    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
      c.set("user", payload as unknown as JwtClaims);
      return next();
    } catch {
      return c.json({ error: "invalid_token" }, 401);
    }
  });
}

export async function signToken(
  secret: string,
  claims: JwtClaims,
  expiry = "24h",
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return await new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("sentinel")
    .setExpirationTime(expiry)
    .sign(key);
}

export function requireRole(allowed: JwtClaims["role"][]) {
  return createMiddleware<{ Variables: AuthedVars }>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (!allowed.includes(user.role)) return c.json({ error: "forbidden" }, 403);
    return next();
  });
}
