import type { Context, Next } from "hono";
import type { Env } from "../index";
import { resolveSession, readSessionCookie, type AuthedUser } from "../auth/session";

export type AuthedEnv = {
  Bindings: Env;
  Variables: { user: AuthedUser };
};

export async function requireAuth(c: Context<AuthedEnv>, next: Next) {
  const token = readSessionCookie(c.req.header("cookie"));
  const user = token ? await resolveSession(c.env.DB, token) : null;
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
}
