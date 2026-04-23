import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { signToken, type JwtClaims } from "../middleware/auth";

// Minimal auth surface for demo / local use. In production this integrates
// with OIDC / SAML — the endpoints here just mint dev tokens.
export function createAuthRoute(secret: string) {
  const route = new Hono();

  const LoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    role: z.enum(["admin", "analyst", "viewer", "service"]).default("analyst"),
  });

  route.post("/token", zValidator("json", LoginSchema), async (c) => {
    // NEVER DO THIS IN PROD. We shove a password-less dev-login behind an env
    // guard. The API refuses to mint tokens when NODE_ENV=production unless
    // SENTINEL_DEV_TOKEN_MINTER=1 is set (see below).
    const env = process.env.NODE_ENV ?? "development";
    if (env === "production" && process.env.SENTINEL_DEV_TOKEN_MINTER !== "1") {
      return c.json({ error: "dev_token_disabled" }, 403);
    }
    const { username, role } = c.req.valid("json");
    const claims: JwtClaims = { sub: username, role };
    const token = await signToken(secret, claims);
    return c.json({ token, claims });
  });

  return route;
}
