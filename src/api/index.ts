import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { database } from "./database";
import { sql } from "drizzle-orm";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", cors({ origin: "*", credentials: true }));

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Referer": "https://howlongtobeat.com/",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://howlongtobeat.com",
};

// ─── Crypto helpers ───────────────────────────────────────────────────────────
function genId(len = 24): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
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
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key, 256
    );
    const derived = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
    return derived === hashHex;
  } catch { return false; }
}

// ─── Auth middleware helper ────────────────────────────────────────────────────
async function getSessionUser(c: any): Promise<{ id: string; email: string } | null> {
  const db = database(c.env.DB);
  const sessionId = getCookie(c, "gc_session");
  if (!sessionId) return null;
  const now = Math.floor(Date.now() / 1000);
  const rows = await db.run(sql`
    SELECT u.id, u.email FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId} AND s.expires_at > ${now}
  `);
  const row = (rows as any).results?.[0];
  if (!row) return null;
  return { id: row.id as string, email: row.email as string };
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password || password.length < 6) {
    return c.json({ error: "Email and password (min 6 chars) required" }, 400);
  }
  const db = database(c.env.DB);

  // Check existing
  const existing = await db.run(sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`);
  if ((existing as any).results?.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const userId = genId();
  const hash = await hashPassword(password);
  await db.run(sql`INSERT INTO users (id, email, password_hash) VALUES (${userId}, ${email.toLowerCase()}, ${hash})`);

  // Create session
  const sessionId = genId(32);
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  await db.run(sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sessionId}, ${userId}, ${expiresAt})`);

  setCookie(c, "gc_session", sessionId, {
    path: "/", httpOnly: true, sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return c.json({ user: { id: userId, email: email.toLowerCase() } });
});

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: "Email and password required" }, 400);

  const db = database(c.env.DB);
  const rows = await db.run(sql`SELECT id, email, password_hash FROM users WHERE email = ${email.toLowerCase()}`);
  const user = (rows as any).results?.[0];
  if (!user) return c.json({ error: "Invalid email or password" }, 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return c.json({ error: "Invalid email or password" }, 401);

  const sessionId = genId(32);
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  await db.run(sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sessionId}, ${user.id}, ${expiresAt})`);

  setCookie(c, "gc_session", sessionId, {
    path: "/", httpOnly: true, sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return c.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/logout", async (c) => {
  const db = database(c.env.DB);
  const sessionId = getCookie(c, "gc_session");
  if (sessionId) {
    await db.run(sql`DELETE FROM sessions WHERE id = ${sessionId}`);
  }
  deleteCookie(c, "gc_session", { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ user: null });
  return c.json({ user });
});

// ─── Calendar save/load ───────────────────────────────────────────────────────
app.post("/api/calendar/save", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Not authenticated" }, 401);

  const { state } = await c.req.json<{ state: any }>();
  const db = database(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  await db.run(sql`
    INSERT INTO calendar_saves (user_id, state_json, updated_at)
    VALUES (${user.id}, ${JSON.stringify(state)}, ${now})
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
async function getHLTBToken(PROXY_API_KEY: string): Promise<{
  token: string;
  hpKey: string;
  hpVal: string;
} | null> {
  const res = await fetch(
    `https://proxy.howlongtobeatcalendar.com/api/find/init?t=${Date.now()}`,
    {
      headers: {
        "x-proxy-api-key": PROXY_API_KEY,
        "Accept": "*"
      },
    }
  );

  if (!res.ok) {
    console.log(res.status);
    console.log(await res.text());
    console.error("Failed to obtain HLTB token");
    return null;
  }

  return await res.json<{
    token: string;
    hpKey: string;
    hpVal: string;
  }>();
}

app.post("/api/hltb/search", async (c) => {
  const { query } = await c.req.json<{ query: string }>();
  if (!query || query.trim().length < 2) {
    return c.json({ error: "Query too short" }, 400);
  }

  try {
    const tokenData = await getHLTBToken(c.env.PROXY_API_KEY);

    if (!tokenData) {
      return c.json({ error: "Failed to obtain HLTB token" }, 500);
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
      const errText = await res.text();
      return c.json({ error: `Proxy search failed (${res.status}): ${errText.slice(0, 100)}` }, 502);
    }

    const data = await res.json<any>();
    console.log("Data from proxy:", data);
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
  } catch (err: any) {
    return c.json({ error: err.message ?? "Search failed" }, 500);
  }
});

app.post("/api/hltb/fetch", async (c) => {
  const { url } = await c.req.json<{ url: string }>();
  if (!url || !url.includes("howlongtobeat.com/game/")) {
    return c.json({ error: "Provide a valid HowLongToBeat game URL" }, 400);
  }
  const match = url.match(/howlongtobeat\.com\/game\/(\d+)/);
  if (!match) return c.json({ error: "Could not extract game ID from URL" }, 400);
  const gameId = match[1];

  try {
    const tokenData = await getHLTBToken(c.env.PROXY_API_KEY);

    if (!tokenData) {
      return c.json({ error: "Failed to obtain HLTB token" }, 500);
    }

    const proxyUrl = new URL(c.env.PROXY_BASE_URL + `/game/${gameId}`);
    
    // Debug log
    console.log("PROXY_BASE_URL:", c.env.PROXY_BASE_URL);
    console.log("PROXY_API_KEY:", c.env.PROXY_API_KEY ? "✓ set" : "✗ not set");
    console.log("Full URL:", proxyUrl.toString());

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
      const errText = await res.text();
      return c.json({ error: `Proxy fetch failed (${res.status}): ${errText.slice(0, 100)}` }, 502);
    }

    const data = await res.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch game" }, 500);
  }
});

export default app;
