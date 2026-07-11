import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { database } from "./database";
import { sql } from "drizzle-orm";

type CloudflareBindings = Cloudflare.Env & {
  DB: D1Database;
  // Secret set via `wrangler secret put PROXY_API_KEY` (not in wrangler.jsonc, so absent from generated types)
  PROXY_API_KEY: string;
};

const app = new Hono<{ Bindings: CloudflareBindings }>();

const SESSION_COOKIE = "gc_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_SAVE_BYTES = 1_000_000; // 1 MB cap on calendar state

// ─── Crypto helpers ───────────────────────────────────────────────────────────
function genId(len = 24): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
}

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key, 256
  );
  const saltHex = Array.from(salt, b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(":");
    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(hashHex);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key, 256
    );
    const derived = new Uint8Array(bits);
    if (derived.byteLength !== expected.byteLength) return false;
    // timingSafeEqual is a Workers-runtime extension to SubtleCrypto
    return (crypto.subtle as any).timingSafeEqual(derived, expected);
  } catch { return false; }
}

// ─── Rate limiting (Workers ratelimit binding; no-op if binding is absent) ────
async function rateLimited(c: any, limiter: { limit(opts: { key: string }): Promise<{ success: boolean }> } | undefined): Promise<boolean> {
  if (!limiter) return false;
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  try {
    const { success } = await limiter.limit({ key: ip });
    return !success;
  } catch {
    return false;
  }
}

// ─── Auth middleware helper ────────────────────────────────────────────────────
async function getSessionUser(c: any): Promise<{ id: string; email: string; username: string | null } | null> {
  const db = database(c.env.DB);
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return null;
  const now = Math.floor(Date.now() / 1000);
  const rows = await db.run(sql`
    SELECT u.id, u.email, u.username FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId} AND s.expires_at > ${now}
  `);
  const row = (rows as any).results?.[0];
  if (!row) return null;
  return { id: row.id as string, email: row.email as string, username: (row.username as string | null) ?? null };
}

function setSessionCookie(c: any, sessionId: string) {
  setCookie(c, SESSION_COOKIE, sessionId, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function createSession(db: ReturnType<typeof database>, userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Opportunistically purge expired sessions
  await db.run(sql`DELETE FROM sessions WHERE expires_at <= ${now}`);
  const sessionId = genId(32);
  const expiresAt = now + SESSION_TTL_SECONDS;
  await db.run(sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sessionId}, ${userId}, ${expiresAt})`);
  return sessionId;
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (c) => {
  if (await rateLimited(c, c.env.RATE_LIMITER_AUTH)) {
    return c.json({ error: "Too many attempts. Try again in a minute." }, 429);
  }

  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (
    !email || typeof email !== "string" || email.length > 255 || !/^\S+@\S+\.\S+$/.test(email) ||
    !password || typeof password !== "string" || password.length > 256
  ) {
    return c.json({ error: "Valid email and password required" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  const db = database(c.env.DB);

  // Check existing
  const existing = await c.env.DB
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first();

  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const userId = crypto.randomUUID();
  const hash = await hashPassword(password);

  await c.env.DB
    .prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)")
    .bind(userId, email.toLowerCase(), hash)
    .run();

  const sessionId = await createSession(db, userId);
  setSessionCookie(c, sessionId);

  return c.json({ user: { id: userId, email: email.toLowerCase(), username: null } });
});

app.post("/api/auth/login", async (c) => {
  if (await rateLimited(c, c.env.RATE_LIMITER_AUTH)) {
    return c.json({ error: "Too many attempts. Try again in a minute." }, 429);
  }

  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || typeof email !== "string" || email.length > 255 || !password || typeof password !== "string" || password.length > 256) {
    return c.json({ error: "Email and password required" }, 400);
  }

  const db = database(c.env.DB);
  const rows = await db.run(sql`SELECT id, email, username, password_hash FROM users WHERE email = ${email.toLowerCase()}`);
  const user = (rows as any).results?.[0];
  if (!user) return c.json({ error: "Invalid email or password" }, 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return c.json({ error: "Invalid email or password" }, 401);

  const sessionId = await createSession(db, user.id);
  setSessionCookie(c, sessionId);

  return c.json({ user: { id: user.id, email: user.email, username: user.username ?? null } });
});

app.post("/api/auth/logout", async (c) => {
  const db = database(c.env.DB);
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    await db.run(sql`DELETE FROM sessions WHERE id = ${sessionId}`);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/", httpOnly: true, secure: true, sameSite: "Lax" });
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ user: null });
  return c.json({ user });
});

// ─── Account management ─────────────────────────────────────────────────────────
const MAX_USERNAME_LEN = 40;

// Update display name (not a login credential, so no password required).
app.patch("/api/auth/profile", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const { username } = await c.req.json<{ username: string | null }>();
  if (username !== null && typeof username !== "string") {
    return c.json({ error: "Invalid display name" }, 400);
  }
  // Empty string clears the display name back to null.
  const trimmed = typeof username === "string" ? username.trim() : "";
  if (trimmed.length > MAX_USERNAME_LEN) {
    return c.json({ error: `Display name must be ${MAX_USERNAME_LEN} characters or fewer` }, 400);
  }
  const next = trimmed.length === 0 ? null : trimmed;

  const db = database(c.env.DB);
  await db.run(sql`UPDATE users SET username = ${next} WHERE id = ${user.id}`);

  return c.json({ user: { ...user, username: next } });
});

// Change password. Requires the current password, and revokes all other sessions.
app.post("/api/auth/password", async (c) => {
  if (await rateLimited(c, c.env.RATE_LIMITER_AUTH)) {
    return c.json({ error: "Too many attempts. Try again in a minute." }, 429);
  }

  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (
    !currentPassword || typeof currentPassword !== "string" || currentPassword.length > 256 ||
    !newPassword || typeof newPassword !== "string" || newPassword.length > 256
  ) {
    return c.json({ error: "Current and new password required" }, 400);
  }
  if (newPassword.length < 8) {
    return c.json({ error: "New password must be at least 8 characters" }, 400);
  }

  const db = database(c.env.DB);
  const rows = await db.run(sql`SELECT password_hash FROM users WHERE id = ${user.id}`);
  const row = (rows as any).results?.[0];
  if (!row) return c.json({ error: "Not authenticated" }, 401);

  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) return c.json({ error: "Current password is incorrect" }, 403);

  const hash = await hashPassword(newPassword);
  const currentSessionId = getCookie(c, SESSION_COOKIE);
  await db.run(sql`UPDATE users SET password_hash = ${hash} WHERE id = ${user.id}`);
  // Revoke every other session; keep the one making this request signed in.
  await db.run(sql`DELETE FROM sessions WHERE user_id = ${user.id} AND id != ${currentSessionId ?? ""}`);

  return c.json({ ok: true });
});

// Permanently delete the account and all associated data. Requires the password.
app.post("/api/auth/delete", async (c) => {
  if (await rateLimited(c, c.env.RATE_LIMITER_AUTH)) {
    return c.json({ error: "Too many attempts. Try again in a minute." }, 429);
  }

  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const { password } = await c.req.json<{ password: string }>();
  if (!password || typeof password !== "string" || password.length > 256) {
    return c.json({ error: "Password required" }, 400);
  }

  const db = database(c.env.DB);
  const rows = await db.run(sql`SELECT password_hash FROM users WHERE id = ${user.id}`);
  const row = (rows as any).results?.[0];
  if (!row) return c.json({ error: "Not authenticated" }, 401);

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return c.json({ error: "Password is incorrect" }, 403);

  // ON DELETE CASCADE removes the user's sessions and calendar_saves.
  await db.run(sql`DELETE FROM users WHERE id = ${user.id}`);
  deleteCookie(c, SESSION_COOKIE, { path: "/", httpOnly: true, secure: true, sameSite: "Lax" });

  return c.json({ ok: true });
});

// ─── Calendar save/load ───────────────────────────────────────────────────────
app.post("/api/calendar/save", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (contentLength > MAX_SAVE_BYTES) {
    return c.json({ error: "Saved data too large" }, 413);
  }

  const { state } = await c.req.json<{ state: any }>();
  const stateJson = JSON.stringify(state);
  if (stateJson.length > MAX_SAVE_BYTES) {
    return c.json({ error: "Saved data too large" }, 413);
  }

  const db = database(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  await db.run(sql`
    INSERT INTO calendar_saves (user_id, state_json, updated_at)
    VALUES (${user.id}, ${stateJson}, ${now})
    ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
  `);
  return c.json({ ok: true, savedAt: now });
});

app.get("/api/calendar/load", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const db = database(c.env.DB);
  const rows = await db.run(sql`SELECT state_json FROM calendar_saves WHERE user_id = ${user.id}`);
  const row = (rows as any).results?.[0];
  if (!row) return c.json({ state: null });
  return c.json({ state: JSON.parse(row.state_json) });
});

// ─── HLTB proxy ───────────────────────────────────────────────────────────────
async function getHLTBToken(env: CloudflareBindings): Promise<{
  token: string;
  hpKey: string;
  hpVal: string;
} | null> {
  const res = await fetch(
    `${env.PROXY_BASE_URL}/api/find/init?t=${Date.now()}`,
    {
      headers: {
        "x-proxy-api-key": env.PROXY_API_KEY,
        "Accept": "*"
      },
    }
  );

  if (!res.ok) {
    console.error(`Failed to obtain HLTB token (status ${res.status})`);
    return null;
  }

  return await res.json<{
    token: string;
    hpKey: string;
    hpVal: string;
  }>();
}

app.post("/api/hltb/search", async (c) => {
  if (await rateLimited(c, c.env.RATE_LIMITER_HLTB)) {
    return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  const { query } = await c.req.json<{ query: string }>();
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return c.json({ error: "Query too short" }, 400);
  }
  if (!c.env.PROXY_BASE_URL) {
    return c.json({ error: "PROXY_BASE_URL is not configured" }, 500);
  }
  if (query.length > 100) {
    return c.json({ error: "Query too long" }, 400);
  }

  try {
    const tokenData = await getHLTBToken(c.env);

    if (!tokenData) {
      return c.json({ error: "Search is temporarily unavailable" }, 502);
    }
    const proxyUrl = new URL(c.env.PROXY_BASE_URL + "/search");
    proxyUrl.searchParams.append("query", query.trim());

    const res = await fetch(proxyUrl.toString(), {
      method: "GET",
      headers: {
        "x-proxy-api-key": c.env.PROXY_API_KEY,
        "Accept": "application/json",
        "x-auth-token": tokenData.token,
        "x-hp-key": tokenData.hpKey,
        "x-hp-val": tokenData.hpVal
      },
    });

    if (!res.ok) {
      console.error(`Proxy search failed (status ${res.status})`);
      return c.json({ error: "Search failed. Try again later." }, 502);
    }

    const data = await res.json<any>();
    const raw: any[] = Array.isArray(data?.data) ? data.data : (data?.data?.game ?? []);
    const secToHours = (s: number) => (s > 0 ? Math.round((s / 3600) * 10) / 10 : null);

    return c.json({
      games: raw.map((g: any) => ({
        id: String(g.game_id),
        title: g.game_name,
        imageUrl: g.game_image ? `https://howlongtobeat.com/games/${g.game_image}` : null,
        platforms: g.profile_platform ? g.profile_platform.split(", ").map((p: string) => p.trim()) : [],
        developer: g.profile_dev || null,
        genres: g.profile_genre ? g.profile_genre.split(", ").map((x: string) => x.trim()) : [],
        main: secToHours(g.comp_main),
        main_sides: secToHours(g.comp_plus),
        completionist: secToHours(g.comp_100),
        average: secToHours(g.comp_all),
      })),
    });
  } catch (err) {
    console.error("HLTB search error:", err);
    return c.json({ error: "Search failed" }, 500);
  }
});

app.post("/api/hltb/fetch", async (c) => {
  if (await rateLimited(c, c.env.RATE_LIMITER_HLTB)) {
    return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  const { url } = await c.req.json<{ url: string }>();
  let parsed: URL;
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    parsed = new URL(withScheme);
  } catch {
    return c.json({ error: "Provide a valid HowLongToBeat game URL" }, 400);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "howlongtobeat.com" && hostname !== "www.howlongtobeat.com") {
    return c.json({ error: "Provide a valid HowLongToBeat game URL" }, 400);
  }
  const match = parsed.pathname.match(/^\/game\/(\d+)/);
  if (!match) return c.json({ error: "Could not extract game ID from URL" }, 400);
  const gameId = match[1];
  if (!c.env.PROXY_BASE_URL) {
    return c.json({ error: "PROXY_BASE_URL is not configured" }, 500);
  }

  try {
    const tokenData = await getHLTBToken(c.env);

    if (!tokenData) {
      return c.json({ error: "Game lookup is temporarily unavailable" }, 502);
    }

    const proxyUrl = new URL(c.env.PROXY_BASE_URL + `/game/${gameId}`);

    const res = await fetch(proxyUrl.toString(), {
      method: "GET",
      headers: {
        "x-proxy-api-key": c.env.PROXY_API_KEY,
        "Accept": "application/json",
        "x-auth-token": tokenData.token,
        "x-hp-key": tokenData.hpKey,
        "x-hp-val": tokenData.hpVal
      },
    });

    if (!res.ok) {
      console.error(`Proxy fetch failed (status ${res.status})`);
      return c.json({ error: "Failed to fetch game data. Try again later." }, 502);
    }

    const data = await res.json<any>();
    const g = data.pageProps?.game?.data?.game?.[0];
    if (!g) return c.json({ error: "Game data not found in page" }, 422);
    const secToHours = (s: number) => (s > 0 ? Math.round((s / 3600) * 10) / 10 : null);

    return c.json({
      game: {
        id: String(g.game_id),
        title: g.game_name,
        imageUrl: g.game_image ? `https://howlongtobeat.com/games/${g.game_image}` : null,
        platforms: g.profile_platform ? g.profile_platform.split(", ").map((p: string) => p.trim()) : [],
        developer: g.profile_dev || null, publisher: g.profile_pub || null,
        genres: g.profile_genre ? g.profile_genre.split(", ").map((x: string) => x.trim()) : [],
        main: secToHours(g.comp_main),
        main_sides: secToHours(g.comp_plus),
        completionist: secToHours(g.comp_100),
        average: secToHours(g.comp_all),
      },
    });
  } catch (err) {
    console.error("HLTB fetch error:", err);
    return c.json({ error: "Failed to fetch game data" }, 500);
  }
});

export default app;
