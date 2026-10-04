import { neon } from "@neondatabase/serverless";

export type Watch = {
  id: number;
  url: string;
  title: string | null;
  target_price: number | null;
  current_price: number | null;
  best_price: number | null;
  best_store: string | null;
  best_url: string | null;
  currency: string;
  last_checked: string | null;
  created_at: string;
};

export type Check = {
  id: number;
  watch_id: number;
  source: string;
  store: string | null;
  url: string;
  price: number;
  checked_at: string;
};

// Neon when DATABASE_URL is set, otherwise an in-memory store so the app runs before the DB is provisioned.
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

type Mem = { watches: Watch[]; checks: Check[]; seq: number };
const g = globalThis as unknown as { __sniperMem?: Mem; __sniperSchema?: Promise<void> };
const mem: Mem = (g.__sniperMem ??= { watches: [], checks: [], seq: 1 });

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toWatch = (r: Record<string, unknown>): Watch => ({
  ...(r as Watch),
  target_price: num(r.target_price),
  current_price: num(r.current_price),
  best_price: num(r.best_price),
});

function ensureSchema() {
  if (!sql) return Promise.resolve();
  g.__sniperSchema ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS watches (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      target_price NUMERIC,
      current_price NUMERIC,
      best_price NUMERIC,
      best_store TEXT,
      best_url TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      last_checked TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS checks (
      id SERIAL PRIMARY KEY,
      watch_id INT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      store TEXT,
      url TEXT NOT NULL,
      price NUMERIC NOT NULL,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  })();
  return g.__sniperSchema;
}

export async function addWatch(url: string, targetPrice: number | null): Promise<Watch> {
  await ensureSchema();
  // Re-sniping the same link or product updates the existing watch instead of duplicating it.
  const existing = (await listWatches()).find((w) => w.url.toLowerCase() === url.toLowerCase());
  if (existing) {
    if (targetPrice !== null) {
      if (sql) await sql`UPDATE watches SET target_price = ${targetPrice} WHERE id = ${existing.id}`;
      else existing.target_price = targetPrice;
    }
    return { ...existing, target_price: targetPrice ?? existing.target_price };
  }
  if (sql) {
    const rows = await sql`INSERT INTO watches (url, target_price) VALUES (${url}, ${targetPrice}) RETURNING *`;
    return toWatch(rows[0]);
  }
  const w: Watch = {
    id: mem.seq++, url, title: null, target_price: targetPrice, current_price: null, best_price: null,
    best_store: null, best_url: null, currency: "USD", last_checked: null, created_at: new Date().toISOString(),
  };
  mem.watches.push(w);
  return w;
}

export async function listWatches(): Promise<Watch[]> {
  await ensureSchema();
  if (sql) return (await sql`SELECT * FROM watches ORDER BY created_at DESC`).map(toWatch);
  return [...mem.watches].reverse();
}

export async function getWatch(id: number): Promise<Watch | null> {
  await ensureSchema();
  if (sql) {
    const rows = await sql`SELECT * FROM watches WHERE id = ${id}`;
    return rows[0] ? toWatch(rows[0]) : null;
  }
  return mem.watches.find((w) => w.id === id) ?? null;
}

export async function updateWatch(id: number, p: Partial<Watch>): Promise<void> {
  await ensureSchema();
  if (sql) {
    await sql`UPDATE watches SET
      title = COALESCE(${p.title ?? null}, title),
      target_price = COALESCE(${p.target_price ?? null}, target_price),
      current_price = COALESCE(${p.current_price ?? null}, current_price),
      best_price = ${p.best_price ?? null},
      best_store = ${p.best_store ?? null},
      best_url = ${p.best_url ?? null},
      currency = COALESCE(${p.currency ?? null}, currency),
      last_checked = now()
      WHERE id = ${id}`;
    return;
  }
  const w = mem.watches.find((x) => x.id === id);
  if (w) Object.assign(w, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)), { last_checked: new Date().toISOString() });
}

export async function deleteWatch(id: number): Promise<void> {
  await ensureSchema();
  if (sql) await sql`DELETE FROM watches WHERE id = ${id}`;
  else mem.watches = mem.watches.filter((w) => w.id !== id);
}

export async function addChecks(watchId: number, rows: Omit<Check, "id" | "watch_id" | "checked_at">[]): Promise<void> {
  await ensureSchema();
  for (const r of rows) {
    if (sql) await sql`INSERT INTO checks (watch_id, source, store, url, price) VALUES (${watchId}, ${r.source}, ${r.store}, ${r.url}, ${r.price})`;
    else mem.checks.push({ ...r, id: mem.seq++, watch_id: watchId, checked_at: new Date().toISOString() });
  }
}

export async function listChecks(watchId: number): Promise<Check[]> {
  await ensureSchema();
  if (sql) return (await sql`SELECT * FROM checks WHERE watch_id = ${watchId} ORDER BY checked_at DESC LIMIT 50`).map((r) => ({ ...(r as Check), price: Number(r.price) }));
  return mem.checks.filter((c) => c.watch_id === watchId).reverse();
}
