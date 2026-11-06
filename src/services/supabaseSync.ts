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

const STATIC_PRODUCT_IMAGE_MAP: Record<string, string> = {
  prd_kuru_incir: "/uploads/kuru-incir.jpg",
  prd_sele_zeytin: "/uploads/sele-siyah-zeytin.jpg",
  prd_cennet_hurmasi: "/uploads/cennet-hurmasi-kurusu.jpg",
  prd_incir_receli: "/uploads/incir-receli.jpg",
  prd_icli_kofte: "/uploads/icli-kofte.jpg",
};

let lastPullTime = 0;
let hasCompletedInitialPull = false;
let inFlightPull: Promise<void> | null = null;
const PULL_TTL_MS = 15000;

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

const PUSH_TIERS = [
  [
    { name: "users", pk: "id" },
    { name: "products", pk: "id" },
    { name: "audit_logs", pk: "id" },
  ],
  [
    { name: "sessions", pk: "token_hash" },
    { name: "orders", pk: "id" },
    { name: "email_outbox", pk: "id" },
  ],
  [
    { name: "order_items", pk: "id" },
    { name: "refunds", pk: "id" },
  ],
] as const;

/**
 * Yerel SQLite tablolarındaki güncel verileri yabancı anahtar (FK) sırasını koruyarak
 * 3 paralel dalga halinde Supabase (PostgreSQL) tablolarına yazar (Upsert).
 */
export async function pushAllToSupabase(db: DatabaseSync): Promise<boolean> {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return false;

  try {
    for (const tier of PUSH_TIERS) {
      const results = await Promise.all(
        tier.map(async (t) => {
          const rows = db.prepare(`SELECT * FROM ${t.name}`).all() as Array<Record<string, unknown>>;
          if (rows.length === 0) return true;

          const cleanRows = rows.map((r) => {
            const copy = { ...r };
            if (
              t.name === "products" &&
              typeof copy.id === "string" &&
              STATIC_PRODUCT_IMAGE_MAP[copy.id]
            ) {
              if (typeof copy.image_url === "string" && copy.image_url.startsWith("data:image/")) {
                copy.image_url = STATIC_PRODUCT_IMAGE_MAP[copy.id];
              }
            }
            return copy;
          });

          const res = await supabaseFetch(`${t.name}?on_conflict=${t.pk}`, {
            method: "POST",
            headers: {
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(cleanRows),
          });

          return Boolean(
            res && (res.ok || res.status === 201 || res.status === 200 || res.status === 204),
          );
        }),
      );
      if (!results.every(Boolean)) {
        return false;
      }
    }

    lastPullTime = Date.now();
    hasCompletedInitialPull = true;
    return true;
  } catch {
    return false;
  }
}

async function executePullFromSupabase(db: DatabaseSync): Promise<void> {
  try {
    // Tüm tabloları tek seferde paralel çek (Waterfall gecikmesini önler)
    const responses = await Promise.all(
      TABLES_IN_ORDER.map((t) => supabaseFetch(`${t.name}?select=*`)),
    );

    const usersRes = responses[0];
    if (!usersRes || !usersRes.ok) {
      return;
    }

    const remoteUsers = (await usersRes.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(remoteUsers)) return;

    if (remoteUsers.length === 0) {
      await pushAllToSupabase(db);
      return;
    }

    const tableDataMap = new Map<string, Array<Record<string, unknown>>>();
    tableDataMap.set("users", remoteUsers);

    for (let i = 1; i < TABLES_IN_ORDER.length; i++) {
      const r = responses[i];
      if (!r || !r.ok) return;
      const rows = (await r.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) return;
      tableDataMap.set(TABLES_IN_ORDER[i].name, rows);
    }

    // Varsayılan 5 ürünün görselleri eski Base64 formatındaysa hızlı CDN yoluna (/uploads/*.jpg) dönüştür
    let needsProductImageCleanupPush = false;
    const productRows = tableDataMap.get("products") ?? [];
    for (const pRow of productRows) {
      const pid = String(pRow.id ?? "");
      if (STATIC_PRODUCT_IMAGE_MAP[pid] && typeof pRow.image_url === "string" && pRow.image_url.startsWith("data:image/")) {
        pRow.image_url = STATIC_PRODUCT_IMAGE_MAP[pid];
        needsProductImageCleanupPush = true;
      }
    }

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
      hasCompletedInitialPull = true;
    } catch {
      try {
        db.exec("ROLLBACK; PRAGMA foreign_keys = ON;");
      } catch {
        // Ignore
      }
    }

    if (needsProductImageCleanupPush) {
      pushAllToSupabase(db).catch(() => {});
    }
  } catch {
    // Ağ hatası durumunda yerel veritabanı kesintisiz çalışmaya devam eder
  }
}

/**
 * Supabase (PostgreSQL) tablolarındaki kalıcı verileri çekip yerel SQLite motoruna senkronize eder.
 * Single-flight kilidi ve Stale-While-Revalidate (arka plan yenileme) ile sayfa açılışlarını bloklamaz.
 */
export async function pullFromSupabaseIfNeeded(
  db: DatabaseSync,
  force = false,
): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return;

  const isFresh = Date.now() - lastPullTime < PULL_TTL_MS;
  if (!force && isFresh) {
    return;
  }

  if (!inFlightPull) {
    inFlightPull = executePullFromSupabase(db).finally(() => {
      inFlightPull = null;
    });
  }

  // Yazma (POST/PUT/DELETE) işlemlerinde veya ilk soğuk başlangıçta senkron bekle,
  // sonraki GET isteklerinde ise yanıtı anında (0ms) döndürüp arka planda güncelle (Stale-While-Revalidate).
  if (force || !hasCompletedInitialPull) {
    await inFlightPull;
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
