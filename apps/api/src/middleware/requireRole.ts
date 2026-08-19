import type { Context, Next } from "hono";
import type { AuthedEnv } from "./requireAuth";
import type { Role } from "../db/schema";

/** Must run after requireAuth. Checks the session's *effective* role
 * (activeRole override if a demo reviewer switched roles, else the
 * account's real role) - this is the real, server-side access boundary
 * the legacy prototype's CSS-only role gate never had. */
export function requireRole(...allowed: Role[]) {
  return async (c: Context<AuthedEnv>, next: Next) => {
    const user = c.get("user");
    if (!allowed.includes(user.effectiveRole)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}
