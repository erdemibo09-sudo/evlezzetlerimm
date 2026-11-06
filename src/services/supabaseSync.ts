import { DatabaseSync } from "node:sqlite";
import { getEnv } from "./cryptoUtils.ts";

const DEFAULT_SUPABASE_URL = "https://tociikxbqycmfvsdllwx.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_cnNDiLzf4pY1K1Z30shrZw_CmRbavTI";

export function getSupabaseConfig() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") ?? getEnv("SUPABASE_URL") ?? DEFAULT_SUPABASE_URL;
  const key =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ??
    getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
    getEnv("SUPABASE_ANON_KEY") ??
    DEFAULT_SUPABASE_KEY;
  const disabled = getEnv("DISABLE_SUPABASE_SYNC") === "1";
  return { url: url.replace(/\/+$/, ""), key, enabled: Boolean(url && key && !disabled) };
}

const TABLES_IN_ORDER = [
  { name: "users", pk: "id" },
  { name: "sessions", pk: "token_hash" },
  { name: "products", pk: "id" },
  { name: "orders", pk: "id" },
  { name: "order_items", pk: "id" },
  { name: "refunds", pk: "id" },
  { name: "email_outbox", pk: "id" },
  { name: "audit_logs", pk: "id" },
] as const;

let lastPullTime = 0;
const PULL_TTL_MS = 3500;

async function supabaseFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response | null> {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return null;

  const headers = new Headers(options.headers || {});
  headers.set("apikey", cfg.key);
  if (cfg.key.startsWith("eyJ")) {
    headers.set("Authorization", `Bearer ${cfg.key}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...options,
      headers,
    });
  } catch {
    return null;
  }
}

/**
 * Yerel SQLite tablolarındaki güncel verileri Supabase (PostgreSQL) tablolarına yazar (Upsert).
 */
export async function pushAllToSupabase(db: DatabaseSync): Promise<boolean> {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return false;

  try {
    for (const t of TABLES_IN_ORDER) {
      const rows = db.prepare(`SELECT * FROM ${t.name}`).all() as Array<Record<string, unknown>>;
      if (rows.length === 0) continue;

      const cleanRows = rows.map((r) => ({ ...r }));
      const res = await supabaseFetch(`${t.name}?on_conflict=${t.pk}`, {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(cleanRows),
      });

      if (!res || (!res.ok && res.status !== 201 && res.status !== 200 && res.status !== 204)) {
        return false;
      }
    }
    lastPullTime = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * Supabase (PostgreSQL) tablolarındaki kalıcı verileri çekip yerel SQLite motoruna senkronize eder.
 * Eğer Supabase tabloları yeni oluşturulmuş ve boşsa, başlangıç verilerini otomatik olarak Supabase'e yükler.
 */
export async function pullFromSupabaseIfNeeded(
  db: DatabaseSync,
  force = false,
): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return;

  if (!force && Date.now() - lastPullTime < PULL_TTL_MS) {
    return;
  }

  try {
    // Önce users tablosunu kontrol et
    const usersRes = await supabaseFetch("users?select=*");
    if (!usersRes || !usersRes.ok) {
      // Tablolar henüz oluşturulmamış veya ağ erişimi yok -> yerel veritabanı ile devam et
      return;
    }

    const remoteUsers = (await usersRes.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(remoteUsers)) return;

    // Eğer Supabase'de tablo yeni açılmış ve henüz hiç kullanıcı yoksa: yerel başlangıç verisini Supabase'e yükle!
    if (remoteUsers.length === 0) {
      await pushAllToSupabase(db);
      return;
    }

    // Diğer tüm tabloları paralel olarak Supabase'den çek
    const otherTables = TABLES_IN_ORDER.slice(1);
    const responses = await Promise.all(
      otherTables.map((t) => supabaseFetch(`${t.name}?select=*`)),
    );

    const tableDataMap = new Map<string, Array<Record<string, unknown>>>();
    tableDataMap.set("users", remoteUsers);

    for (let i = 0; i < otherTables.length; i++) {
      const r = responses[i];
      if (!r || !r.ok) return;
      const rows = (await r.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) return;
      tableDataMap.set(otherTables[i].name, rows);
    }

    // Atomik olarak yerel SQLite tablolarını Supabase verileriyle güncelle
    db.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE TRANSACTION;");
    try {
      for (const t of TABLES_IN_ORDER) {
        const rows = tableDataMap.get(t.name) ?? [];
        db.exec(`DELETE FROM ${t.name}`);
        if (rows.length === 0) continue;

        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => "?").join(", ");
        const stmt = db.prepare(
          `INSERT OR REPLACE INTO ${t.name} (${cols.join(", ")}) VALUES (${placeholders})`,
        );

        for (const row of rows) {
          const vals = cols.map((c) => (row[c] === undefined ? null : (row[c] as string | number | null)));
          stmt.run(...vals);
        }
      }
      db.exec("COMMIT; PRAGMA foreign_keys = ON;");
      lastPullTime = Date.now();
    } catch {
      try {
        db.exec("ROLLBACK; PRAGMA foreign_keys = ON;");
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ağ hatası durumunda yerel veritabanı kesintisiz çalışmaya devam eder
  }
}

export async function deleteRowInSupabase(
  table: string,
  pkCol: string,
  pkVal: string,
): Promise<void> {
  await supabaseFetch(`${table}?${pkCol}=eq.${encodeURIComponent(pkVal)}`, {
    method: "DELETE",
  });
}
