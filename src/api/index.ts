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
async function getHLTBToken(): Promise<{ token: string; hpKey: string; hpVal: string } | null> {
  await fetch("https://howlongtobeat.com/", { headers: BASE_HEADERS });
  const res = await fetch(`https://howlongtobeat.com/api/find/init?t=${Date.now()}`, {
    headers: BASE_HEADERS,
  });
  if (!res.ok) return null;
  const data = await res.json<{ token: string; hpKey: string; hpVal: string }>();
  return data;
}

app.post("/api/hltb/search", async (c) => {
  const { query } = await c.req.json<{ query: string }>();
  if (!query || query.trim().length < 2) {
    return c.json({ error: "Query too short" }, 400);
  }

  try {
    const auth = await getHLTBToken();
    if (!auth) return c.json({ error: "Failed to initialize HLTB session" }, 502);

    const { token, hpKey, hpVal } = auth;
    const payload: Record<string, any> = {
      searchType: "games",
      searchTerms: query.trim().split(/\s+/),
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0, platform: "", sortCategory: "popular", rangeCategory: "main",
          rangeTime: { min: null, max: null },
          gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
          rangeYear: { min: "", max: "" }, modifier: "",
        },
        users: { sortCategory: "postcount" },
        lists: { sortCategory: "follows" },
        filter: "", sort: 0, randomizer: 0,
      },
      useCache: true,
    };
    payload[hpKey] = hpVal;

    const res = await fetch("https://howlongtobeat.com/api/find", {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json",
        "x-auth-token": token,
        "x-hp-key": hpKey,
        "x-hp-val": hpVal,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `HLTB search failed (${res.status}): ${errText.slice(0, 100)}` }, 502);
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
    const res = await fetch(`https://howlongtobeat.com/game/${gameId}`, {
      headers: { ...BASE_HEADERS, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    if (!res.ok) return c.json({ error: `Failed to fetch page (${res.status})` }, 502);
    const html = await res.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return c.json({ error: "Could not find game data on this page." }, 422);
    const nextData = JSON.parse(nextDataMatch[1]);
    const g = nextData?.props?.pageProps?.game?.data?.game?.[0];
    if (!g) return c.json({ error: "Game data not found in page" }, 422);
    const secToHours = (s: number) => (s > 0 ? Math.round((s / 3600) * 10) / 10 : null);
    return c.json({
      game: {
        id: String(g.game_id), title: g.game_name,
        imageUrl: g.game_image ? `https://howlongtobeat.com/games/${g.game_image}` : null,
        platforms: g.profile_platform ? g.profile_platform.split(", ").map((p: string) => p.trim()) : [],
        developer: g.profile_dev || null, publisher: g.profile_pub || null,
        genres: g.profile_genre ? g.profile_genre.split(", ").map((x: string) => x.trim()) : [],
        main: secToHours(g.comp_main), main_sides: secToHours(g.comp_plus),
        completionist: secToHours(g.comp_100), average: secToHours(g.comp_all),
        url: `https://howlongtobeat.com/game/${gameId}`,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch game" }, 500);
  }
});

export default app;
