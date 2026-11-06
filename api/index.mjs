import { DatabaseSync } from "node:sqlite";
import { Buffer } from "node:buffer";
import process from "node:process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";


// --- src/domain/money.ts ---
/**
 * Parasal Değer (Kuruş) Modülü
 * Yuvarlama hatalarını (IEEE 754 float) tamamen önlemek için
 * tüm parasal tutarlar veritabanında ve hesaplamalarda tam sayı (kuruş) olarak tutulur.
 * Örn: 245,00 TL -> 24500 kuruş.
 */ function assertValidKurus(amountKurus, fieldName = "Tutar") {
  if (!Number.isInteger(amountKurus) || !Number.isSafeInteger(amountKurus) || amountKurus < 0) {
    throw new Error(`${fieldName} negatif olmayan bir tam sayı (kuruş) olmalıdır. Alınan: ${amountKurus}`);
  }
}
function assertPositiveKurus(amountKurus, fieldName = "Fiyat") {
  if (!Number.isInteger(amountKurus) || !Number.isSafeInteger(amountKurus) || amountKurus <= 0) {
    throw new Error(`${fieldName} sıfırdan büyük bir tam sayı (kuruş) olmalıdır. Alınan: ${amountKurus}`);
  }
}
/**
 * Kuruş tam sayısını Türkçe para birimi formatına çevirir.
 * Örn: 24500 -> "245,00 ₺"
 */ function formatKurus(amountKurus) {
  const safe = Math.round(amountKurus);
  const sign = safe < 0 ? "-" : "";
  const abs = Math.abs(safe);
  const lira = Math.floor(abs / 100);
  const kurus = abs % 100;
  const liraFormatted = lira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const kurusFormatted = kurus.toString().padStart(2, "0");
  return `${sign}${liraFormatted},${kurusFormatted} ₺`;
}
/**
 * TL cinsinden girilen metin veya sayıyı güvenli şekilde kuruş tam sayısına dönüştürür.
 * Örn: "245.50" veya "245,50" veya 245.5 -> 24550
 */ function parseTlToKurus(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error("Geçersiz TL tutarı.");
    }
    return Math.round(input * 100);
  }
  const cleaned = input.trim().replace(/\s/g, "").replace("₺", "");
  if (!cleaned) {
    throw new Error("Tutar boş olamaz.");
  }
  // Türkçe format (örn. "1.250,50") veya standart ondalık ("245.50" / "245,50")
  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Geçersiz para formatı: ${input}`);
  }
  return Math.round(num * 100);
}

// --- src/domain/orderFsm.ts ---
/**
 * Sipariş ve İade Yaşam Döngüsü — Deterministik Sonlu Durum Makinesi (FSM)
 * Durumlar: PAID -> PREPARING -> DELIVERED -> REFUND_REQUESTED -> REFUNDED
 */ const ORDER_STATUS_LABELS = {
  PAID: "Sipariş Alındı (Ödendi)",
  PREPARING: "Mutfakta Hazırlanıyor",
  DELIVERED: "Teslim Edildi",
  REFUND_REQUESTED: "İade Talebi Oluşturuldu",
  REFUNDED: "İade Edildi"
};
const TRANSITION_MATRIX = [
  // Normal Operasyonel Akış (PAID -> PREPARING -> DELIVERED)
  {
    from: "PAID",
    to: "PREPARING",
    allowedRoles: [
      "ADMIN"
    ],
    defaultRestoreStock: false,
    description: "Sipariş mutfakta hazırlanmaya başlandı."
  },
  {
    from: "PREPARING",
    to: "DELIVERED",
    allowedRoles: [
      "ADMIN"
    ],
    defaultRestoreStock: false,
    description: "Sipariş müşteriye teslim edildi."
  },
  // İade Talebi Akışı (-> REFUND_REQUESTED)
  {
    from: "PAID",
    to: "REFUND_REQUESTED",
    allowedRoles: [
      "CUSTOMER",
      "ADMIN"
    ],
    defaultRestoreStock: false,
    description: "Ödenmiş sipariş için iade talebi açıldı."
  },
  {
    from: "PREPARING",
    to: "REFUND_REQUESTED",
    allowedRoles: [
      "CUSTOMER",
      "ADMIN"
    ],
    defaultRestoreStock: false,
    description: "Hazırlanmakta olan sipariş için iade talebi açıldı."
  },
  {
    from: "DELIVERED",
    to: "REFUND_REQUESTED",
    allowedRoles: [
      "CUSTOMER",
      "ADMIN"
    ],
    defaultRestoreStock: false,
    description: "Teslim edilmiş sipariş için iade talebi açıldı."
  },
  // İade Onayı ve Doğrudan İade Akışı (-> REFUNDED)
  {
    from: "REFUND_REQUESTED",
    to: "REFUNDED",
    allowedRoles: [
      "ADMIN",
      "CUSTOMER"
    ],
    defaultRestoreStock: true,
    description: "İade talebi onaylandı ve tutar müşteriye iade edildi."
  },
  {
    from: "PAID",
    to: "REFUNDED",
    allowedRoles: [
      "CUSTOMER",
      "ADMIN"
    ],
    defaultRestoreStock: true,
    description: "Mutfağa girmeden iptal/iade edildi, stok geri yüklendi."
  },
  {
    from: "PREPARING",
    to: "REFUNDED",
    allowedRoles: [
      "ADMIN"
    ],
    defaultRestoreStock: false,
    description: "Hazırlık aşamasındaki sipariş yönetici tarafından iade edildi."
  },
  {
    from: "DELIVERED",
    to: "REFUNDED",
    allowedRoles: [
      "CUSTOMER",
      "ADMIN"
    ],
    defaultRestoreStock: true,
    description: "Teslim edilen sipariş iade edildi."
  }
];
class OrderFsmError extends Error {
  statusCode;
  code;
  constructor(message, statusCode = 409, code = "INVALID_STATE_TRANSITION"){
    super(message);
    this.name = "OrderFsmError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
/**
 * Verilen mevcut durumdan hedef duruma geçişin geçerli olup olmadığını doğrular.
 * Geçersizse deterministik OrderFsmError fırlatır.
 */ function validateOrderTransition(currentStatus, targetStatus, actorRole) {
  // Çift iade (Double-Refund) kontrolü
  if (currentStatus === "REFUNDED" && (targetStatus === "REFUNDED" || targetStatus === "REFUND_REQUESTED")) {
    throw new OrderFsmError("Bu sipariş zaten iade edilmiştir. Çift iade (double-refund) işlemi engellendi.", 409, "DOUBLE_REFUND_PREVENTED");
  }
  if (currentStatus === targetStatus) {
    throw new OrderFsmError(`Sipariş zaten '${ORDER_STATUS_LABELS[currentStatus]}' (${currentStatus}) durumunda.`, 409, "ALREADY_IN_STATE");
  }
  const rule = TRANSITION_MATRIX.find((r)=>r.from === currentStatus && r.to === targetStatus);
  if (!rule) {
    throw new OrderFsmError(`Geçersiz sipariş durum geçişi: '${currentStatus}' durumundan '${targetStatus}' durumuna geçiş yapılamaz.`, 409, "INVALID_STATE_TRANSITION");
  }
  if (!rule.allowedRoles.includes(actorRole)) {
    throw new OrderFsmError(`'${actorRole}' rolü '${currentStatus}' -> '${targetStatus}' durum geçişini yapmaya yetkili değildir.`, 403, "FORBIDDEN_STATE_TRANSITION");
  }
  return rule;
}
/**
 * Belirli bir durum ve rol için izin verilen sonraki durumları döndürür.
 */ function getAllowedNextStatuses(currentStatus, actorRole) {
  return TRANSITION_MATRIX.filter((r)=>r.from === currentStatus && r.allowedRoles.includes(actorRole)).map((r)=>r.to);
}

// --- src/domain/validation.ts ---
class ValidationError extends Error {
  statusCode = 400;
  field;
  constructor(message, field){
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}
function asString(val, field, minLen = 1, maxLen = 2000) {
  if (typeof val !== "string") {
    throw new ValidationError(`${field} metin (string) olmalıdır.`, field);
  }
  const trimmed = val.trim();
  if (trimmed.length < minLen) {
    throw new ValidationError(`${field} en az ${minLen} karakter olmalıdır.`, field);
  }
  if (trimmed.length > maxLen) {
    throw new ValidationError(`${field} en fazla ${maxLen} karakter olabilir.`, field);
  }
  return trimmed;
}
function validateRegisterInput(body) {
  const fullName = asString(body.fullName, "Ad Soyad", 2, 120);
  const email = asString(body.email, "E-posta", 5, 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Geçerli bir e-posta adresi giriniz.", "email");
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 6 || password.length > 128) {
    throw new ValidationError("Şifre en az 6 karakter olmalıdır.", "password");
  }
  const phone = body.phone ? asString(body.phone, "Telefon", 5, 30) : "0500 000 00 00";
  const address = body.address ? asString(body.address, "Teslimat Adresi", 5, 500) : "Standart Teslimat Adresi, İstanbul";
  return {
    fullName,
    email,
    password,
    phone,
    address
  };
}
function validateLoginInput(body) {
  const email = asString(body.email, "E-posta", 3, 180).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    throw new ValidationError("Şifre gereklidir.", "password");
  }
  return {
    email,
    password
  };
}
function resolvePriceKurus(body) {
  if (body.priceKurus !== undefined && body.priceKurus !== null && body.priceKurus !== "") {
    const pk = Number(body.priceKurus);
    try {
      assertPositiveKurus(pk, "Fiyat (Kuruş)");
    } catch (e) {
      throw new ValidationError(e.message, "priceKurus");
    }
    return pk;
  }
  if (body.priceTl !== undefined && body.priceTl !== null && body.priceTl !== "") {
    try {
      const pk = parseTlToKurus(body.priceTl);
      assertPositiveKurus(pk, "Fiyat");
      return pk;
    } catch (e) {
      throw new ValidationError(e.message, "priceTl");
    }
  }
  throw new ValidationError("Ürün fiyatı (priceKurus veya priceTl) belirtilmelidir.", "priceKurus");
}
function parseAllergens(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x)=>String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(",").map((x)=>x.trim()).filter(Boolean);
  }
  return [];
}
function validateProductCreateInput(body) {
  const name = asString(body.name, "Ürün Adı", 2, 160);
  const description = asString(body.description, "Ürün Açıklaması", 5, 2000);
  const category = asString(body.category, "Kategori", 2, 80);
  const imageUrl = body.imageUrl ? asString(body.imageUrl, "Görsel URL", 3, 5_000_000) : "/default-food.svg";
  const portionInfo = asString(body.portionInfo ?? "1 Porsiyon (300g)", "Porsiyon/Gramaj Bilgisi", 2, 140);
  const allergens = parseAllergens(body.allergens);
  const prepTimeMinutes = body.prepTimeMinutes !== undefined ? Number(body.prepTimeMinutes) : 30;
  if (!Number.isInteger(prepTimeMinutes) || prepTimeMinutes < 1 || prepTimeMinutes > 1440) {
    throw new ValidationError("Hazırlanma süresi 1 ile 1440 dakika arasında tam sayı olmalıdır.", "prepTimeMinutes");
  }
  const dailyStock = body.dailyStock !== undefined ? Number(body.dailyStock) : 0;
  if (!Number.isInteger(dailyStock) || dailyStock < 0 || dailyStock > 100000) {
    throw new ValidationError("Günlük stok/kapasite negatif olmayan bir tam sayı olmalıdır.", "dailyStock");
  }
  const priceKurus = resolvePriceKurus(body);
  const isFeatured = Boolean(body.isFeatured);
  return {
    name,
    description,
    category,
    imageUrl,
    portionInfo,
    allergens,
    prepTimeMinutes,
    dailyStock,
    priceKurus,
    isFeatured
  };
}
function validateProductUpdateInput(body) {
  const update = {};
  if (body.name !== undefined) update.name = asString(body.name, "Ürün Adı", 2, 160);
  if (body.description !== undefined) update.description = asString(body.description, "Ürün Açıklaması", 5, 2000);
  if (body.category !== undefined) update.category = asString(body.category, "Kategori", 2, 80);
  if (body.imageUrl !== undefined) update.imageUrl = asString(body.imageUrl, "Görsel URL", 3, 5_000_000);
  if (body.portionInfo !== undefined) update.portionInfo = asString(body.portionInfo, "Porsiyon/Gramaj Bilgisi", 2, 140);
  if (body.allergens !== undefined) update.allergens = parseAllergens(body.allergens);
  if (body.prepTimeMinutes !== undefined) {
    const prep = Number(body.prepTimeMinutes);
    if (!Number.isInteger(prep) || prep < 1 || prep > 1440) {
      throw new ValidationError("Hazırlanma süresi 1 ile 1440 dakika arasında tam sayı olmalıdır.", "prepTimeMinutes");
    }
    update.prepTimeMinutes = prep;
  }
  if (body.dailyStock !== undefined) {
    const stock = Number(body.dailyStock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
      throw new ValidationError("Günlük stok negatif olmayan bir tam sayı olmalıdır.", "dailyStock");
    }
    update.dailyStock = stock;
  }
  if (body.priceKurus !== undefined || body.priceTl !== undefined) {
    update.priceKurus = resolvePriceKurus(body);
  }
  if (body.isFeatured !== undefined) {
    update.isFeatured = Boolean(body.isFeatured);
  }
  if (body.isArchived !== undefined) {
    update.isArchived = Boolean(body.isArchived);
  }
  return update;
}
function validateCheckoutInput(body) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("Sepetiniz boş. Sipariş vermek için en az bir ürün eklemelisiniz.", "items");
  }
  const mergedMap = new Map();
  for (const rawItem of body.items){
    if (!rawItem || typeof rawItem !== "object") {
      throw new ValidationError("Geçersiz sepet kalemi.", "items");
    }
    const itemObj = rawItem;
    const productId = asString(itemObj.productId, "Ürün ID", 1, 100);
    const quantity = Number(itemObj.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      throw new ValidationError("Ürün adedi 1 ile 500 arasında bir tam sayı olmalıdır.", "quantity");
    }
    mergedMap.set(productId, (mergedMap.get(productId) ?? 0) + quantity);
  }
  const items = Array.from(mergedMap.entries()).map(([productId, quantity])=>({
      productId,
      quantity
    }));
  const deliveryAddress = body.deliveryAddress ? asString(body.deliveryAddress, "Teslimat Adresi", 5, 500) : undefined;
  const customerNote = body.customerNote ? asString(body.customerNote, "Sipariş Notu", 1, 500) : undefined;
  const idempotencyKey = body.idempotencyKey ? asString(body.idempotencyKey, "Idempotency Key", 4, 150) : undefined;
  return {
    items,
    deliveryAddress,
    customerNote,
    idempotencyKey
  };
}
function validateRefundInput(body) {
  const reason = body.reason ? asString(body.reason, "İade Nedeni", 3, 500) : "Müşteri talebiyle sipariş iadesi";
  const idempotencyKey = body.idempotencyKey ? asString(body.idempotencyKey, "Idempotency Key", 4, 150) : undefined;
  const restoreStock = body.restoreStock !== undefined ? Boolean(body.restoreStock) : undefined;
  const mode = body.mode === "REQUEST" ? "REQUEST" : "EXECUTE";
  return {
    reason,
    idempotencyKey,
    restoreStock,
    mode
  };
}
const VALID_STATUSES = [
  "PAID",
  "PREPARING",
  "DELIVERED",
  "REFUND_REQUESTED",
  "REFUNDED"
];
function validateOrderStatus(val) {
  if (typeof val !== "string" || !VALID_STATUSES.includes(val)) {
    throw new ValidationError(`Geçersiz sipariş durumu: ${String(val)}`, "status");
  }
  return val;
}

// --- src/services/cryptoUtils.ts ---
function getEnv(key) {
  try {
    if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
      return Deno.env.get(key);
    }
  } catch  {
  // Ignore permission errors
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}
const SESSION_SECRET = getEnv("SESSION_SECRET") ?? "evyemeklerimm-super-secret-hmac-key-2026-production-grade";
/**
 * Parolayı scrypt + 16-bayt rastgele salt ile güvenli şekilde özetler (hash).
 */ function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
/**
 * Sabit zamanlı (timing-safe) parola doğrulaması yapar.
 */ function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return timingSafeEqual(derived, keyBuf);
}
/**
 * İmzalı oturum belirteci (signed token) üretir ve doğrular.
 */ function createSignedSessionToken() {
  const rawId = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", SESSION_SECRET).update(rawId).digest("hex");
  const rawToken = `${rawId}.${sig}`;
  const tokenHash = createHmac("sha256", SESSION_SECRET).update(rawToken).digest("hex");
  return {
    rawToken,
    tokenHash
  };
}
function verifyAndHashSessionToken(rawToken) {
  const parts = rawToken.split(".");
  if (parts.length !== 2) return null;
  const [rawId, providedSig] = parts;
  const expectedSig = createHmac("sha256", SESSION_SECRET).update(rawId).digest("hex");
  const a = Buffer.from(providedSig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return createHmac("sha256", SESSION_SECRET).update(rawToken).digest("hex");
}
function generateId(prefix) {
  const uuid = randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}
function generateOrderNumber() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `EVY-${y}${m}${d}-${rand}`;
}

// --- src/db/database.ts ---
let defaultDbInstance = null;
/**
 * Özel yemek illüstrasyonu SVG Data-URI üreticisi (Yedek görsel için)
 */ function createFoodSvgDataUri(title, emoji, bgStart, bgEnd) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgStart}" />
        <stop offset="100%" stop-color="${bgEnd}" />
      </linearGradient>
    </defs>
    <rect width="600" height="400" fill="url(#g)" rx="16"/>
    <circle cx="300" cy="175" r="105" fill="rgba(255,255,255,0.18)" />
    <circle cx="300" cy="175" r="85" fill="rgba(255,255,255,0.25)" />
    <text x="300" y="205" font-size="92" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif">${emoji}</text>
    <rect x="40" y="310" width="520" height="54" rx="27" fill="rgba(25,18,14,0.55)" />
    <text x="300" y="344" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
/**
 * public/uploads/ içindeki gerçek ürün fotoğrafını okuyup doğrudan Base64 Data-URI olarak döndürür.
 * Böylece sunucu yeniden başlatılmasa veya farklı dizinden çalıştırılsa bile görseller %100 garantili görünür.
 */ function loadUploadedPhotoDataUri(filename, fallbackTitle) {
  const candidatePaths = [
    new URL(`../../public/uploads/${filename}`, import.meta.url),
    new URL(`../public/uploads/${filename}`, import.meta.url),
    `./public/uploads/${filename}`
  ];
  for (const p of candidatePaths){
    try {
      const bytes = readFileSync(p);
      const b64 = Buffer.from(bytes).toString("base64");
      return `data:image/jpeg;base64,${b64}`;
    } catch  {
    // Sonraki aday yolu dene
    }
  }
  return `/uploads/${filename}`;
}
function initSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'ADMIN')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT NOT NULL,
      portion_info TEXT NOT NULL,
      allergens_json TEXT NOT NULL DEFAULT '[]',
      prep_time_minutes INTEGER NOT NULL CHECK (prep_time_minutes > 0),
      daily_stock INTEGER NOT NULL CHECK (daily_stock >= 0),
      price_kurus INTEGER NOT NULL CHECK (price_kurus > 0),
      is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
      is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      customer_name_snapshot TEXT NOT NULL,
      customer_email_snapshot TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      customer_note TEXT NOT NULL DEFAULT '',
      total_amount_kurus INTEGER NOT NULL CHECK (total_amount_kurus >= 0),
      status TEXT NOT NULL CHECK (status IN ('PAID', 'PREPARING', 'DELIVERED', 'REFUND_REQUESTED', 'REFUNDED')),
      idempotency_key TEXT UNIQUE,
      refund_reason TEXT,
      refunded_amount_kurus INTEGER DEFAULT 0 CHECK (refunded_amount_kurus >= 0),
      refunded_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      product_name_snapshot TEXT NOT NULL,
      portion_info_snapshot TEXT NOT NULL,
      allergens_snapshot_json TEXT NOT NULL DEFAULT '[]',
      unit_price_kurus_snapshot INTEGER NOT NULL CHECK (unit_price_kurus_snapshot > 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      line_total_kurus_snapshot INTEGER NOT NULL CHECK (line_total_kurus_snapshot > 0),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      processed_by_user_id TEXT NOT NULL,
      amount_kurus INTEGER NOT NULL CHECK (amount_kurus > 0),
      reason TEXT NOT NULL,
      stock_restored INTEGER NOT NULL DEFAULT 0 CHECK (stock_restored IN (0, 1)),
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (processed_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL CHECK (event_type IN ('ORDER_PURCHASED', 'ORDER_REFUND_REQUESTED', 'ORDER_REFUNDED')),
      order_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_role TEXT NOT NULL CHECK (recipient_role IN ('CUSTOMER', 'ADMIN')),
      subject TEXT NOT NULL,
      html_body TEXT NOT NULL,
      text_body TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      message_id TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_data_json TEXT,
      new_data_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, is_archived);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_email_outbox_order ON email_outbox(order_id);
    CREATE INDEX IF NOT EXISTS idx_email_outbox_recipient ON email_outbox(recipient_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);
}
function seedDatabase(db) {
  // Eski varsayılan demo ürünleri varsa temizle
  const legacyProduct = db.prepare("SELECT id FROM products WHERE id = 'prd_kayseri_manti'").get();
  if (legacyProduct) {
    db.exec("DELETE FROM products WHERE id IN ('prd_kayseri_manti','prd_yaprak_sarma','prd_hunkar_begendi','prd_su_boregi','prd_mercimek_corbasi','prd_firin_sutlac','prd_ev_acuka','prd_icli_kofte')");
  }
  // Mevcut ürünlerde /uploads/ yolu varsa doğrudan gömülü Base64 Data-URI'ye yükselt (kesintisiz görüntüleme için)
  const uploadPathRows = db.prepare("SELECT id, name, image_url FROM products WHERE image_url LIKE '/uploads/%'").all();
  if (uploadPathRows.length > 0) {
    const updateImgStmt = db.prepare("UPDATE products SET image_url = ? WHERE id = ?");
    for (const r of uploadPathRows){
      const fname = r.image_url.replace("/uploads/", "");
      const dataUri = loadUploadedPhotoDataUri(fname, r.name);
      updateImgStmt.run(dataUri, r.id);
    }
  }
  const existingUsers = db.prepare("SELECT COUNT(*) as cnt FROM users").get();
  const existingProducts = db.prepare("SELECT COUNT(*) as cnt FROM products").get();
  if (existingUsers.cnt > 0 && existingProducts.cnt > 0) {
    return;
  }
  const now = new Date().toISOString();
  // 1. Varsayılan Yönetici ve Müşteri Hesapları
  if (existingUsers.cnt === 0) {
    const adminId = generateId("usr");
    const customerId = generateId("usr");
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, full_name, phone, address, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertUser.run(adminId, "admin@evyemeklerim.com", "Mutfak Şefi & Yönetici (Elif Hanım)", "0532 100 20 30", "Ev Yemeklerim Merkez Mutfak, Kadıköy / İstanbul", hashPassword("Admin123!"), "ADMIN", now);
    insertUser.run(customerId, "ayse@ornek.com", "Ayşe Yılmaz", "0544 222 33 44", "Moda Caddesi No: 42 Daire: 5, Kadıköy / İstanbul", hashPassword("Musteri123!"), "CUSTOMER", now);
  }
  // 2. Kullanıcının Yüklediği 5 Gerçek Ev Yapımı & Doğal Ürün Kataloğu
  const initialProducts = [
    {
      id: "prd_kuru_incir",
      slug: "dogal-aydin-dag-inciri-kuru-incir",
      name: "Doğal Aydın Dağ İnciri (Dalında Kurutulmuş)",
      description: "Aydın dağlarının yüksek rakımlı bahçelerinde ilaçsız ve hidrojen peroksitsiz olarak dalında kurutulmuş, ince kabuklu ve içi bol ballı 1. sınıf doğal kuru incir. Üzerindeki beyazlık tamamen kendi doğal meyve şekerinin kristalleşmesidir.",
      category: "Kurutmalıklar & Doğal Meyveler",
      imageUrl: loadUploadedPhotoDataUri("kuru-incir.jpg", "Doğal Aydın Dağ İnciri"),
      portionInfo: "1 Paket (500g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 35,
      priceKurus: 26000,
      isFeatured: 1
    },
    {
      id: "prd_sele_zeytin",
      slug: "ev-yapimi-dogal-sele-siyah-zeytin",
      name: "Ev Yapımı Doğal Sele Siyah Zeytin",
      description: "Kasım-Aralık hasadı olgunlaşmış ince kabuklu zeytinlerin kostik veya boya kullanılmadan sadece kaya tuzu ile kendi suyunda aylarca çevrilerek tatlandırıldığı, etli ve küçük çekirdekli hakiki ev yapımı sele zeytin.",
      category: "Kahvaltılık & Zeytin",
      imageUrl: loadUploadedPhotoDataUri("sele-siyah-zeytin.jpg", "Ev Yapımı Sele Siyah Zeytin"),
      portionInfo: "1 Kavanoz / Paket (500g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 40,
      priceKurus: 21000,
      isFeatured: 1
    },
    {
      id: "prd_cennet_hurmasi",
      slug: "guneste-kurutulmus-cennet-hurmasi-kurusu",
      name: "Güneşte Kurutulmuş Cennet Hurması (Trabzon Hurması)",
      description: "Tam mevsiminde toplanan cennet hurmalarının kabukları soyularak iplere dizilip dağ esintisinde ve güneşte doğal olarak kurutulmasıyla hazırlanmıştır. Dışı kendi doğal pudrası ile kaplı, içi lokum gibi yumuşaktır.",
      category: "Kurutmalıklar & Doğal Meyveler",
      imageUrl: loadUploadedPhotoDataUri("cennet-hurmasi-kurusu.jpg", "Cennet Hurması Kurusu"),
      portionInfo: "1 Paket (500g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 30,
      priceKurus: 28000,
      isFeatured: 1
    },
    {
      id: "prd_incir_receli",
      slug: "ev-yapimi-citir-incir-receli-kavanoz",
      name: "Ev Yapımı Çıtır İncir Reçeli (Cam Kavanoz)",
      description: "Ege'nin seçme incirleriyle glikoz şurubu veya koruyucu kullanılmadan, geleneksel bakır tencerede ağır ateşte kıvamlandırılmış, çıtır çekirdekli ve yoğun aromalı ev yapımı incir reçeli.",
      category: "Ev Yapımı Reçeller",
      imageUrl: loadUploadedPhotoDataUri("incir-receli.jpg", "Ev Yapımı Çıtır İncir Reçeli"),
      portionInfo: "1 Cam Kavanoz (650g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 25,
      priceKurus: 19500,
      isFeatured: 1
    },
    {
      id: "prd_icli_kofte",
      slug: "el-yapimi-kizarmis-icli-kofte-kiymali-cevizli",
      name: "El Yapımı Kızarmış İçli Köfte (Kıymalı & Cevizli)",
      description: "İncecik açılmış çıtır bulgur dış kabuğu, içinde özel baharatlarla kavrulmuş %100 dana kıyması ve bol yerli ceviz içi ile tek tek elde kapatılıp nar gibi kızartılmış ev yapımı içli köfte.",
      category: "İçli Köfte & Ev Yemekleri",
      imageUrl: loadUploadedPhotoDataUri("icli-kofte.jpg", "El Yapımı Kızarmış İçli Köfte"),
      portionInfo: "1 Porsiyon (5 Adet / ~400g)",
      allergens: [
        "Gluten",
        "Ceviz",
        "Yumurta"
      ],
      prepTimeMinutes: 25,
      dailyStock: 20,
      priceKurus: 24500,
      isFeatured: 1
    }
  ];
  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, slug, name, description, category, image_url, portion_info,
      allergens_json, prep_time_minutes, daily_stock, price_kurus,
      is_featured, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  for (const p of initialProducts){
    insertProduct.run(p.id, p.slug, p.name, p.description, p.category, p.imageUrl, p.portionInfo, JSON.stringify(p.allergens), p.prepTimeMinutes, p.dailyStock, p.priceKurus, p.isFeatured, now, now);
  }
}
/**
 * ACID Transaction sarmalayıcısı (BEGIN IMMEDIATE ile yazma kilidini atomik olarak alır)
 */ function withTransaction(db, fn) {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch  {
    // Rollback zaten gerçekleşmiş olabilir
    }
    throw err;
  }
}
function getDatabase(dbPath) {
  if (dbPath) {
    const customDb = new DatabaseSync(dbPath);
    initSchema(customDb);
    seedDatabase(customDb);
    return customDb;
  }
  if (!defaultDbInstance) {
    const isVercel = Boolean(getEnv("VERCEL"));
    const path = getEnv("DATABASE_PATH") ?? (isVercel ? "/tmp/evyemeklerim.sqlite" : "./evyemeklerim.sqlite");
    if (isVercel && !existsSync(path)) {
      const candidates = [
        "./evyemeklerim.sqlite",
        new URL("../evyemeklerim.sqlite", import.meta.url),
        new URL("../../evyemeklerim.sqlite", import.meta.url)
      ];
      for (const src of candidates){
        try {
          if (existsSync(src)) {
            copyFileSync(src, path);
            break;
          }
        } catch  {
        // Devam et
        }
      }
    }
    defaultDbInstance = new DatabaseSync(path);
    initSchema(defaultDbInstance);
    seedDatabase(defaultDbInstance);
  }
  return defaultDbInstance;
}

// --- src/services/authService.ts ---
const SESSION_COOKIE_NAME = "evyemek_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
class AuthError extends Error {
  statusCode;
  constructor(message, statusCode = 401){
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}
function registerUser(db, input) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email);
  if (existing) {
    throw new ValidationError("Bu e-posta adresi ile kayıtlı bir hesap zaten mevcut.", "email");
  }
  const now = new Date().toISOString();
  const userId = generateId("usr");
  const passwordHash = hashPassword(input.password);
  const role = "CUSTOMER";
  db.prepare(`
    INSERT INTO users (id, email, full_name, phone, address, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, input.email, input.fullName, input.phone, input.address, passwordHash, role, now);
  const user = {
    id: userId,
    email: input.email,
    fullName: input.fullName,
    phone: input.phone,
    address: input.address,
    role,
    createdAt: now
  };
  const { rawToken, setCookieHeader } = issueSessionForUser(db, userId);
  return {
    user,
    sessionToken: rawToken,
    setCookieHeader
  };
}
function loginUser(db, input) {
  const row = db.prepare(`
      SELECT id, email, full_name, phone, address, password_hash, role, created_at
      FROM users WHERE email = ?
    `).get(input.email);
  if (!row || !verifyPassword(input.password, row.password_hash)) {
    throw new AuthError("E-posta adresi veya şifre hatalı.", 401);
  }
  const user = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address,
    role: row.role,
    createdAt: row.created_at
  };
  const { rawToken, setCookieHeader } = issueSessionForUser(db, user.id);
  return {
    user,
    sessionToken: rawToken,
    setCookieHeader
  };
}
function issueSessionForUser(db, userId) {
  const { rawToken, tokenHash } = createSignedSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt.toISOString(), now.toISOString());
  const maxAgeSec = Math.floor(SESSION_DURATION_MS / 1000);
  const setCookieHeader = `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`;
  return {
    rawToken,
    setCookieHeader
  };
}
function buildClearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
function extractRawTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts){
    const [k, ...vParts] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME) {
      return decodeURIComponent(vParts.join("="));
    }
  }
  return null;
}
function getAuthenticatedUser(db, req) {
  const rawToken = extractRawTokenFromRequest(req);
  if (!rawToken) return null;
  const tokenHash = verifyAndHashSessionToken(rawToken);
  if (!tokenHash) return null;
  const row = db.prepare(`
      SELECT
        s.expires_at,
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.address,
        u.role,
        u.created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(tokenHash);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address,
    role: row.role,
    createdAt: row.created_at
  };
}
function logoutSession(db, req) {
  const rawToken = extractRawTokenFromRequest(req);
  if (rawToken) {
    const tokenHash = verifyAndHashSessionToken(rawToken);
    if (tokenHash) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    }
  }
  return buildClearSessionCookie();
}
function requireAuth(db, req) {
  const user = getAuthenticatedUser(db, req);
  if (!user) {
    throw new AuthError("Bu işlemi gerçekleştirmek için giriş yapmalısınız.", 401);
  }
  return user;
}
function requireAdmin(db, req) {
  const user = requireAuth(db, req);
  if (user.role !== "ADMIN") {
    throw new AuthError("Yetkisiz erişim: Bu işlem yalnızca YÖNETİCİ (ADMIN) yetkisine sahip kullanıcılar içindir.", 403);
  }
  return user;
}
function updateUserProfile(db, user, body) {
  const fullName = typeof body.fullName === "string" && body.fullName.trim().length >= 2 ? body.fullName.trim() : user.fullName;
  const phone = typeof body.phone === "string" ? body.phone.trim() : user.phone;
  const address = typeof body.address === "string" ? body.address.trim() : user.address;
  if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
    if (body.newPassword.length < 6) {
      throw new ValidationError("Yeni şifre en az 6 karakter olmalıdır.", "newPassword");
    }
    const newHash = hashPassword(body.newPassword);
    db.prepare(`
      UPDATE users SET full_name = ?, phone = ?, address = ?, password_hash = ? WHERE id = ?
    `).run(fullName, phone, address, newHash, user.id);
  } else {
    db.prepare(`
      UPDATE users SET full_name = ?, phone = ?, address = ? WHERE id = ?
    `).run(fullName, phone, address, user.id);
  }
  return {
    ...user,
    fullName,
    phone,
    address
  };
}

// --- src/services/auditService.ts ---
function writeAuditLog(db, params) {
  const id = generateId("aud");
  const now = new Date().toISOString();
  const oldJson = params.oldData !== undefined ? JSON.stringify(params.oldData) : null;
  const newJson = params.newData !== undefined ? JSON.stringify(params.newData) : null;
  db.prepare(`
    INSERT INTO audit_logs (
      id, actor_user_id, actor_email, actor_role,
      action, entity_type, entity_id, old_data_json, new_data_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, params.actor.id, params.actor.email, params.actor.role, params.action, params.entityType, params.entityId, oldJson, newJson, now);
  return {
    id,
    actorUserId: params.actor.id,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldData: params.oldData ?? null,
    newData: params.newData ?? null,
    createdAt: now
  };
}
function listAuditLogs(db, limit = 100) {
  const rows = db.prepare(`
    SELECT
      id, actor_user_id, actor_email, actor_role,
      action, entity_type, entity_id, old_data_json, new_data_json, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
  return rows.map((r)=>({
      id: r.id,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_email,
      actorRole: r.actor_role,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      oldData: r.old_data_json ? JSON.parse(r.old_data_json) : null,
      newData: r.new_data_json ? JSON.parse(r.new_data_json) : null,
      createdAt: r.created_at
    }));
}

// --- src/services/productService.ts ---
function mapProductRow(row) {
  let allergens = [];
  try {
    allergens = JSON.parse(row.allergens_json);
  } catch  {
    allergens = [];
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    portionInfo: row.portion_info,
    allergens,
    prepTimeMinutes: row.prep_time_minutes,
    dailyStock: row.daily_stock,
    priceKurus: row.price_kurus,
    priceFormatted: formatKurus(row.price_kurus),
    isFeatured: row.is_featured === 1,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function slugifyTurkish(text) {
  const trMap = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u"
  };
  const replaced = text.split("").map((c)=>trMap[c] ?? c).join("").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${replaced || "urun"}-${Math.random().toString(36).slice(2, 6)}`;
}
function listProducts(db, options) {
  const includeArchived = options?.includeArchived ?? false;
  const conditions = [];
  const params = [];
  if (!includeArchived) {
    conditions.push("is_archived = 0");
  }
  if (options?.category && options.category !== "Tümü") {
    conditions.push("category = ?");
    params.push(options.category);
  }
  if (options?.search) {
    conditions.push("(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)");
    const q = `%${options.search.toLowerCase()}%`;
    params.push(q, q);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
      SELECT * FROM products
      ${whereClause}
      ORDER BY is_archived ASC, is_featured DESC, created_at DESC
    `).all(...params);
  return rows.map(mapProductRow);
}
function getProductById(db, id) {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  return row ? mapProductRow(row) : null;
}
function createProduct(db, actor, input) {
  return withTransaction(db, ()=>{
    const id = generateId("prd");
    const slug = slugifyTurkish(input.name);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO products (
        id, slug, name, description, category, image_url, portion_info,
        allergens_json, prep_time_minutes, daily_stock, price_kurus,
        is_featured, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, slug, input.name, input.description, input.category, input.imageUrl, input.portionInfo, JSON.stringify(input.allergens), input.prepTimeMinutes, input.dailyStock, input.priceKurus, input.isFeatured ? 1 : 0, now, now);
    const created = getProductById(db, id);
    writeAuditLog(db, {
      actor,
      action: "PRODUCT_CREATED",
      entityType: "PRODUCT",
      entityId: id,
      oldData: null,
      newData: created
    });
    return created;
  });
}
function updateProduct(db, actor, productId, input) {
  return withTransaction(db, ()=>{
    const existing = getProductById(db, productId);
    if (!existing) {
      throw new ValidationError("Güncellenecek ürün bulunamadı.", "id");
    }
    const updatedName = input.name ?? existing.name;
    const updatedDescription = input.description ?? existing.description;
    const updatedCategory = input.category ?? existing.category;
    const updatedImageUrl = input.imageUrl ?? existing.imageUrl;
    const updatedPortionInfo = input.portionInfo ?? existing.portionInfo;
    const updatedAllergens = input.allergens ?? existing.allergens;
    const updatedPrepTime = input.prepTimeMinutes ?? existing.prepTimeMinutes;
    const updatedDailyStock = input.dailyStock ?? existing.dailyStock;
    const updatedPriceKurus = input.priceKurus ?? existing.priceKurus;
    const updatedIsFeatured = input.isFeatured !== undefined ? input.isFeatured : existing.isFeatured;
    const updatedIsArchived = input.isArchived !== undefined ? input.isArchived : existing.isArchived;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE products
      SET
        name = ?,
        description = ?,
        category = ?,
        image_url = ?,
        portion_info = ?,
        allergens_json = ?,
        prep_time_minutes = ?,
        daily_stock = ?,
        price_kurus = ?,
        is_featured = ?,
        is_archived = ?,
        updated_at = ?
      WHERE id = ?
    `).run(updatedName, updatedDescription, updatedCategory, updatedImageUrl, updatedPortionInfo, JSON.stringify(updatedAllergens), updatedPrepTime, updatedDailyStock, updatedPriceKurus, updatedIsFeatured ? 1 : 0, updatedIsArchived ? 1 : 0, now, productId);
    const updated = getProductById(db, productId);
    writeAuditLog(db, {
      actor,
      action: "PRODUCT_UPDATED",
      entityType: "PRODUCT",
      entityId: productId,
      oldData: existing,
      newData: updated
    });
    return updated;
  });
}
/**
 * Ürünü vitrinden kaldırır / siler (Soft-delete / Arşivleme + opsiyonel kalıcı silme).
 * Geçmiş siparişlerin (order_items snapshot) tutar ve veri bütünlüğü asla bozulmaz.
 */ function deleteOrArchiveProduct(db, actor, productId, hardDelete = false) {
  return withTransaction(db, ()=>{
    const existing = getProductById(db, productId);
    if (!existing) {
      throw new ValidationError("Silinecek ürün bulunamadı.", "id");
    }
    const now = new Date().toISOString();
    if (hardDelete) {
      db.prepare("DELETE FROM products WHERE id = ?").run(productId);
      writeAuditLog(db, {
        actor,
        action: "PRODUCT_DELETED",
        entityType: "PRODUCT",
        entityId: productId,
        oldData: existing,
        newData: {
          deleted: true
        }
      });
      return {
        archived: true,
        deleted: true,
        product: {
          ...existing,
          isArchived: true
        }
      };
    }
    db.prepare(`
      UPDATE products
      SET is_archived = 1, daily_stock = 0, updated_at = ?
      WHERE id = ?
    `).run(now, productId);
    const updated = getProductById(db, productId);
    writeAuditLog(db, {
      actor,
      action: "PRODUCT_ARCHIVED",
      entityType: "PRODUCT",
      entityId: productId,
      oldData: existing,
      newData: updated
    });
    return {
      archived: true,
      deleted: false,
      product: updated
    };
  });
}

// --- src/services/emailService.ts ---
const ADMIN_NOTIFICATION_EMAIL = getEnv("ADMIN_EMAIL") ?? "admin@evyemeklerim.com";
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function buildItemsHtmlTable(items) {
  const rows = items.map((item)=>`
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1f2937;">
          ${escapeHtml(item.productNameSnapshot)}
          <div style="font-size:12px;color:#6b7280;font-weight:400;">${escapeHtml(item.portionInfoSnapshot)}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:#374151;">
          ${item.quantity} Adet
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#374151;">
          ${formatKurus(item.unitPriceKurusSnapshot)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#111827;">
          ${formatKurus(item.lineTotalKurusSnapshot)}
        </td>
      </tr>`).join("");
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;color:#4b5563;font-size:12px;text-transform:uppercase;">
          <th style="padding:10px 12px;text-align:left;">Yemek / Ürün</th>
          <th style="padding:10px 12px;text-align:center;">Adet</th>
          <th style="padding:10px 12px;text-align:right;">Birim Fiyat</th>
          <th style="padding:10px 12px;text-align:right;">Ara Toplam</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}
function buildPurchaseHtml(order, isForAdmin) {
  const headline = isForAdmin ? `Yeni Sipariş Geldi! (#${escapeHtml(order.orderNumber)})` : `Siparişiniz Alındı! Afiyet Olsun (#${escapeHtml(order.orderNumber)})`;
  const subtext = isForAdmin ? `${escapeHtml(order.customerNameSnapshot)} (${escapeHtml(order.customerEmailSnapshot)}) tarafından yeni bir sipariş oluşturuldu.` : `Sayın ${escapeHtml(order.customerNameSnapshot)}, ev yemekleri siparişiniz mutfağımıza başarıyla iletilmiştir.`;
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>${headline}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f3ef;padding:24px;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.06);border:1px solid #e7e2da;">
    <div style="background:linear-gradient(135deg,#9a3412,#c2410c);color:#ffffff;padding:24px;">
      <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Ev Yemeklerim — Günlük Taze Mutfak</div>
      <h1 style="margin:8px 0 0;font-size:22px;">${headline}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${subtext}</p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px;margin-bottom:16px;font-size:14px;">
        <div><strong>Sipariş Numarası:</strong> ${escapeHtml(order.orderNumber)}</div>
        <div><strong>Sipariş Zamanı:</strong> ${escapeHtml(order.createdAt)}</div>
        <div><strong>Teslimat Adresi:</strong> ${escapeHtml(order.deliveryAddress)}</div>
        ${order.customerNote ? `<div><strong>Müşteri Notu:</strong> ${escapeHtml(order.customerNote)}</div>` : ""}
      </div>
      ${buildItemsHtmlTable(order.items)}
      <div style="text-align:right;font-size:18px;font-weight:800;color:#9a3412;padding:12px 0;border-top:2px solid #f3f4f6;">
        Genel Toplam: ${formatKurus(order.totalAmountKurus)}
      </div>
    </div>
    <div style="background:#f9fafb;padding:14px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">
      Bu e-posta Ev Yemeklerim Transactional Outbox sistemi tarafından otomatik olarak oluşturulmuştur.
    </div>
  </div>
</body>
</html>`;
}
function buildRefundHtml(order, refund, isForAdmin, eventType) {
  const isCompleted = eventType === "ORDER_REFUNDED";
  const badgeColor = isCompleted ? "#15803d" : "#b45309";
  const headline = isCompleted ? `Sipariş İadesi Onaylandı ve Tamamlandı (#${escapeHtml(order.orderNumber)})` : `İade Talebi Oluşturuldu (#${escapeHtml(order.orderNumber)})`;
  const intro = isForAdmin ? `${escapeHtml(order.customerNameSnapshot)} (${escapeHtml(order.customerEmailSnapshot)}) adlı müşterinin <strong>#${escapeHtml(order.orderNumber)}</strong> numaralı siparişi için iade işlemi gerçekleşti.` : `Sayın ${escapeHtml(order.customerNameSnapshot)}, <strong>#${escapeHtml(order.orderNumber)}</strong> numaralı siparişinize ait iade işleminiz aşağıda detaylandırılmıştır.`;
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>${headline}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f3ef;padding:24px;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.06);border:1px solid #e7e2da;">
    <div style="background:${badgeColor};color:#ffffff;padding:24px;">
      <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Ev Yemeklerim — İade & Müşteri Güvencesi</div>
      <h1 style="margin:8px 0 0;font-size:22px;">${headline}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${intro}</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:16px;font-size:14px;">
        <div><strong>Sipariş Numarası:</strong> ${escapeHtml(order.orderNumber)}</div>
        <div><strong>İade Referans No:</strong> ${escapeHtml(refund.refundId)}</div>
        <div><strong>İade Edilen Tutar:</strong> <span style="font-weight:700;color:#15803d;">${formatKurus(refund.refundAmountKurus)}</span></div>
        <div><strong>İade Nedeni:</strong> ${escapeHtml(refund.reason)}</div>
        <div><strong>Zaman Damgası:</strong> ${escapeHtml(refund.refundedAt)}</div>
        <div><strong>Stok Durumu:</strong> ${refund.stockRestored ? "Günlük porsiyon stoğuna geri eklendi" : "Stok değişmedi"}</div>
      </div>
      <h3 style="font-size:14px;color:#374151;margin-bottom:8px;">İade Kapsamındaki Sipariş Kalemleri (Satın Alma Anı Dondurulmuş Fiyatlar):</h3>
      ${buildItemsHtmlTable(order.items)}
      <div style="text-align:right;font-size:18px;font-weight:800;color:#15803d;padding:12px 0;border-top:2px solid #f3f4f6;">
        Toplam İade Tutarı: ${formatKurus(refund.refundAmountKurus)}
      </div>
    </div>
    <div style="background:#f9fafb;padding:14px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">
      Bu e-posta Ev Yemeklerim Transactional Outbox sistemi tarafından otomatik olarak oluşturulmuştur.
    </div>
  </div>
</body>
</html>`;
}
/**
 * Satın alma gerçekleştiğinde AYNI VERİTABANI TRANSACTION'I içinde
 * hem Müşteri hem Yönetici için e-postaları email_outbox tablosuna yazar.
 */ function enqueuePurchaseEmailsInTx(db, order) {
  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO email_outbox (
      id, event_type, order_id, recipient_email, recipient_role,
      subject, html_body, text_body, payload_json, status, attempts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)
  `);
  const payload = {
    eventType: "ORDER_PURCHASED",
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerNameSnapshot,
    customerEmail: order.customerEmailSnapshot,
    deliveryAddress: order.deliveryAddress,
    totalAmountKurus: order.totalAmountKurus,
    totalAmountFormatted: formatKurus(order.totalAmountKurus),
    items: order.items,
    timestamp: order.createdAt
  };
  const itemsText = order.items.map((i)=>`- ${i.productNameSnapshot} (${i.portionInfoSnapshot}) x${i.quantity} = ${formatKurus(i.lineTotalKurusSnapshot)}`).join("\n");
  // 1. Müşteri Onay E-postası
  const custEmailId = generateId("eml");
  const custSubject = `Siparişiniz Alındı (#${order.orderNumber}) - ${formatKurus(order.totalAmountKurus)}`;
  const custText = `Sayın ${order.customerNameSnapshot},\n#${order.orderNumber} numaralı siparişiniz alınmıştır.\n\nKalemler:\n${itemsText}\n\nToplam Tutar: ${formatKurus(order.totalAmountKurus)}\nTeslimat Adresi: ${order.deliveryAddress}`;
  insertStmt.run(custEmailId, "ORDER_PURCHASED", order.id, order.customerEmailSnapshot, "CUSTOMER", custSubject, buildPurchaseHtml(order, false), custText, JSON.stringify(payload), now);
  // 2. Yönetici Bildirim E-postası
  const adminEmailId = generateId("eml");
  const adminSubject = `[YENİ SİPARİŞ] #${order.orderNumber} - ${order.customerNameSnapshot} (${formatKurus(order.totalAmountKurus)})`;
  const adminText = `Yeni Sipariş (#${order.orderNumber})\nMüşteri: ${order.customerNameSnapshot} (${order.customerEmailSnapshot})\nToplam: ${formatKurus(order.totalAmountKurus)}\n\nKalemler:\n${itemsText}`;
  insertStmt.run(adminEmailId, "ORDER_PURCHASED", order.id, ADMIN_NOTIFICATION_EMAIL, "ADMIN", adminSubject, buildPurchaseHtml(order, true), adminText, JSON.stringify(payload), now);
  return [
    custEmailId,
    adminEmailId
  ];
}
/**
 * İade veya iade talebi gerçekleştiğinde AYNI VERİTABANI TRANSACTION'I içinde
 * hem Müşteri hem Yönetici için e-postaları email_outbox tablosuna yazar.
 */ function enqueueRefundEmailsInTx(db, order, refund, eventType = "ORDER_REFUNDED") {
  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO email_outbox (
      id, event_type, order_id, recipient_email, recipient_role,
      subject, html_body, text_body, payload_json, status, attempts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)
  `);
  const payload = {
    eventType,
    orderId: order.id,
    orderNumber: order.orderNumber,
    refundId: refund.refundId,
    customerName: order.customerNameSnapshot,
    customerEmail: order.customerEmailSnapshot,
    refundAmountKurus: refund.refundAmountKurus,
    refundAmountFormatted: formatKurus(refund.refundAmountKurus),
    reason: refund.reason,
    stockRestored: refund.stockRestored,
    items: order.items,
    timestamp: refund.refundedAt
  };
  const itemsText = order.items.map((i)=>`- ${i.productNameSnapshot} x${i.quantity} = ${formatKurus(i.lineTotalKurusSnapshot)}`).join("\n");
  const statusTitle = eventType === "ORDER_REFUNDED" ? "İade Onayı" : "İade Talebi Alındı";
  // 1. Müşteri İade E-postası
  const custEmailId = generateId("eml");
  const custSubject = `${statusTitle} (#${order.orderNumber}) - İade Tutarı: ${formatKurus(refund.refundAmountKurus)}`;
  const custText = `Sayın ${order.customerNameSnapshot},\n#${order.orderNumber} numaralı siparişiniz için ${statusTitle} işlemi gerçekleştirilmiştir.\nİade Tutarı: ${formatKurus(refund.refundAmountKurus)}\nNeden: ${refund.reason}\nZaman: ${refund.refundedAt}\n\nKalemler:\n${itemsText}`;
  insertStmt.run(custEmailId, eventType, order.id, order.customerEmailSnapshot, "CUSTOMER", custSubject, buildRefundHtml(order, refund, false, eventType), custText, JSON.stringify(payload), now);
  // 2. Yönetici İade E-postası
  const adminEmailId = generateId("eml");
  const adminSubject = `[İADE BİLDİRİMİ] #${order.orderNumber} - ${formatKurus(refund.refundAmountKurus)} (${order.customerNameSnapshot})`;
  const adminText = `Sipariş İade Bildirimi (#${order.orderNumber})\nMüşteri: ${order.customerNameSnapshot} (${order.customerEmailSnapshot})\nİade Tutarı: ${formatKurus(refund.refundAmountKurus)}\nNeden: ${refund.reason}\nZaman: ${refund.refundedAt}`;
  insertStmt.run(adminEmailId, eventType, order.id, ADMIN_NOTIFICATION_EMAIL, "ADMIN", adminSubject, buildRefundHtml(order, refund, true, eventType), adminText, JSON.stringify(payload), now);
  return [
    custEmailId,
    adminEmailId
  ];
}
/**
 * Outbox kuyruğundaki PENDING e-postaları işler, RFC-2822 Message-ID üretir ve SENT olarak işaretler.
 */ function processEmailOutbox(db) {
  const pendingRows = db.prepare("SELECT id, order_id, recipient_email FROM email_outbox WHERE status = 'PENDING' ORDER BY created_at ASC").all();
  if (pendingRows.length === 0) return 0;
  const updateStmt = db.prepare(`
    UPDATE email_outbox
    SET status = 'SENT', attempts = attempts + 1, message_id = ?, sent_at = ?
    WHERE id = ?
  `);
  const now = new Date().toISOString();
  for (const row of pendingRows){
    const messageId = `<${row.id}.${Date.now()}@evyemeklerim.com>`;
    updateStmt.run(messageId, now, row.id);
  }
  return pendingRows.length;
}
function mapOutboxRow(r) {
  return {
    id: r.id,
    eventType: r.event_type,
    orderId: r.order_id,
    recipientEmail: r.recipient_email,
    recipientRole: r.recipient_role,
    subject: r.subject,
    htmlBody: r.html_body,
    textBody: r.text_body,
    payload: JSON.parse(r.payload_json),
    status: r.status,
    attempts: r.attempts,
    messageId: r.message_id,
    sentAt: r.sent_at,
    createdAt: r.created_at
  };
}
function listOutboxEmails(db, options) {
  const conditions = [];
  const params = [];
  if (options?.recipientEmail) {
    conditions.push("recipient_email = ?");
    params.push(options.recipientEmail);
  }
  if (options?.orderId) {
    conditions.push("order_id = ?");
    params.push(options.orderId);
  }
  if (options?.eventType) {
    conditions.push("event_type = ?");
    params.push(options.eventType);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options?.limit ?? 100;
  const rows = db.prepare(`
      SELECT * FROM email_outbox
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limit);
  return rows.map(mapOutboxRow);
}

// --- src/services/orderService.ts ---
class StockConflictError extends Error {
  statusCode = 409;
  code = "INSUFFICIENT_STOCK";
  constructor(message){
    super(message);
    this.name = "StockConflictError";
  }
}
function hydrateOrder(db, row) {
  const itemRows = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(row.id);
  const items = itemRows.map((ir)=>{
    let allergens = [];
    try {
      allergens = JSON.parse(ir.allergens_snapshot_json);
    } catch  {
      allergens = [];
    }
    return {
      id: ir.id,
      orderId: ir.order_id,
      productId: ir.product_id,
      productNameSnapshot: ir.product_name_snapshot,
      portionInfoSnapshot: ir.portion_info_snapshot,
      allergensSnapshot: allergens,
      unitPriceKurusSnapshot: ir.unit_price_kurus_snapshot,
      unitPriceFormatted: formatKurus(ir.unit_price_kurus_snapshot),
      quantity: ir.quantity,
      lineTotalKurusSnapshot: ir.line_total_kurus_snapshot,
      lineTotalFormatted: formatKurus(ir.line_total_kurus_snapshot)
    };
  });
  const refundRow = db.prepare("SELECT * FROM refunds WHERE order_id = ?").get(row.id);
  const refund = refundRow ? {
    id: refundRow.id,
    orderId: refundRow.order_id,
    userId: refundRow.user_id,
    processedByUserId: refundRow.processed_by_user_id,
    amountKurus: refundRow.amount_kurus,
    amountFormatted: formatKurus(refundRow.amount_kurus),
    reason: refundRow.reason,
    stockRestored: refundRow.stock_restored === 1,
    createdAt: refundRow.created_at
  } : null;
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    customerNameSnapshot: row.customer_name_snapshot,
    customerEmailSnapshot: row.customer_email_snapshot,
    deliveryAddress: row.delivery_address,
    customerNote: row.customer_note,
    totalAmountKurus: row.total_amount_kurus,
    totalAmountFormatted: formatKurus(row.total_amount_kurus),
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status],
    allowedNextStatusesForAdmin: getAllowedNextStatuses(row.status, "ADMIN"),
    allowedNextStatusesForCustomer: getAllowedNextStatuses(row.status, "CUSTOMER"),
    refundReason: row.refund_reason,
    refundedAmountKurus: row.refunded_amount_kurus ?? 0,
    refundedAmountFormatted: formatKurus(row.refunded_amount_kurus ?? 0),
    refundedAt: row.refunded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    refund
  };
}
/**
 * Sunucu tarafında sepet fiyatlarını ve stok uygunluğunu doğrular.
 * İstemciden gelen hiçbir fiyat verisine güvenilmez.
 */ function calculateServerCartQuote(db, items) {
  let totalAmountKurus = 0;
  const lines = [];
  for (const item of items){
    const product = db.prepare("SELECT id, name, portion_info, price_kurus, daily_stock, is_archived FROM products WHERE id = ?").get(item.productId);
    if (!product || product.is_archived === 1) {
      throw new StockConflictError(`Ürün bulunamadı veya satıştan kaldırılmış: ${item.productId}`);
    }
    const lineTotalKurus = product.price_kurus * item.quantity;
    totalAmountKurus += lineTotalKurus;
    lines.push({
      productId: product.id,
      name: product.name,
      portionInfo: product.portion_info,
      unitPriceKurus: product.price_kurus,
      unitPriceFormatted: formatKurus(product.price_kurus),
      quantity: item.quantity,
      availableStock: product.daily_stock,
      lineTotalKurus,
      lineTotalFormatted: formatKurus(lineTotalKurus)
    });
  }
  return {
    lines,
    totalAmountKurus,
    totalAmountFormatted: formatKurus(totalAmountKurus)
  };
}
/**
 * Atomik Satın Alma (Checkout):
 * 1. BEGIN IMMEDIATE TRANSACTION ile veritabanı yazma kilidi alır.
 * 2. Her kalem için atomik koşullu UPDATE (WHERE daily_stock >= quantity AND is_archived = 0) çalıştırır.
 *    Eşzamanlı siparişlerde stok asla negatife düşmez (overselling imkansızdır).
 * 3. Sipariş kalemlerinin satın alma anındaki fiyat, isim, porsiyon ve alerjen bilgisini dondurur (snapshot).
 * 4. Aynı transaction içinde hem Müşteri hem Yönetici için satın alma e-postalarını email_outbox'a yazar.
 */ function createOrderAtomic(db, user, input) {
  const orderId = withTransaction(db, ()=>{
    // İdempotency kontrolü
    if (input.idempotencyKey) {
      const existingOrder = db.prepare("SELECT id, user_id FROM orders WHERE idempotency_key = ?").get(input.idempotencyKey);
      if (existingOrder) {
        if (existingOrder.user_id !== user.id) {
          throw new ValidationError("Bu idempotency anahtarı başka bir işlemde kullanılmış.", "idempotencyKey");
        }
        return existingOrder.id;
      }
    }
    const now = new Date().toISOString();
    const newOrderId = generateId("ord");
    const orderNumber = generateOrderNumber();
    const deliveryAddress = input.deliveryAddress || user.address || "Standart Teslimat Adresi";
    const customerNote = input.customerNote || "";
    const decrementStmt = db.prepare(`
      UPDATE products
      SET daily_stock = daily_stock - ?, updated_at = ?
      WHERE id = ? AND is_archived = 0 AND daily_stock >= ?
    `);
    const selectProductStmt = db.prepare(`
      SELECT id, name, portion_info, allergens_json, price_kurus, daily_stock, is_archived
      FROM products
      WHERE id = ?
    `);
    let totalAmountKurus = 0;
    const snapshotsToInsert = [];
    for (const item of input.items){
      const prod = selectProductStmt.get(item.productId);
      if (!prod || prod.is_archived === 1) {
        throw new StockConflictError(`Sepetinizdeki ürün artık satışta değil veya arşivlenmiş (${item.productId}).`);
      }
      // Atomik koşullu stok düşümü
      const updateResult = decrementStmt.run(item.quantity, now, prod.id, item.quantity);
      if (updateResult.changes !== 1) {
        throw new StockConflictError(`'${prod.name}' için yeterli günlük porsiyon stoğu kalmadı. (İstenen: ${item.quantity}, Mevcut: ${prod.daily_stock})`);
      }
      const lineTotalKurus = prod.price_kurus * item.quantity;
      totalAmountKurus += lineTotalKurus;
      snapshotsToInsert.push({
        id: generateId("oit"),
        productId: prod.id,
        productNameSnapshot: prod.name,
        portionInfoSnapshot: prod.portion_info,
        allergensSnapshotJson: prod.allergens_json,
        unitPriceKurusSnapshot: prod.price_kurus,
        quantity: item.quantity,
        lineTotalKurusSnapshot: lineTotalKurus
      });
    }
    db.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_name_snapshot, customer_email_snapshot,
        delivery_address, customer_note, total_amount_kurus, status, idempotency_key,
        refunded_amount_kurus, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, 0, ?, ?)
    `).run(newOrderId, orderNumber, user.id, user.fullName, user.email, deliveryAddress, customerNote, totalAmountKurus, input.idempotencyKey ?? null, now, now);
    const insertItemStmt = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name_snapshot, portion_info_snapshot,
        allergens_snapshot_json, unit_price_kurus_snapshot, quantity, line_total_kurus_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const snap of snapshotsToInsert){
      insertItemStmt.run(snap.id, newOrderId, snap.productId, snap.productNameSnapshot, snap.portionInfoSnapshot, snap.allergensSnapshotJson, snap.unitPriceKurusSnapshot, snap.quantity, snap.lineTotalKurusSnapshot);
    }
    const orderForEmail = {
      id: newOrderId,
      orderNumber,
      customerNameSnapshot: user.fullName,
      customerEmailSnapshot: user.email,
      deliveryAddress,
      customerNote,
      totalAmountKurus,
      status: "PAID",
      createdAt: now,
      items: snapshotsToInsert.map((s)=>({
          productId: s.productId,
          productNameSnapshot: s.productNameSnapshot,
          portionInfoSnapshot: s.portionInfoSnapshot,
          unitPriceKurusSnapshot: s.unitPriceKurusSnapshot,
          quantity: s.quantity,
          lineTotalKurusSnapshot: s.lineTotalKurusSnapshot
        }))
    };
    // Transactional Outbox: Satın alma e-postalarını aynı transaction içinde kaydet
    enqueuePurchaseEmailsInTx(db, orderForEmail);
    return newOrderId;
  });
  // Transaction başarıyla commit edildikten sonra Outbox kuyruğunu işle
  processEmailOutbox(db);
  return getOrderById(db, orderId);
}
/**
 * Sipariş ve İade Durum Makinesi (FSM) İade İşlemi:
 * - İade tutarını her zaman dondurulmuş (snapshot) sipariş kalemlerinden hesaplar;
 *   ürünün güncel fiyatı değişmiş veya ürün silinmiş olsa bile eski fiyattan kuruşu kuruşuna doğru iade yapar.
 * - Çift iade (double-refund) hem FSM hem de UNIQUE(order_id) kısıtıyla engellenir.
 * - Uygun durumda stokları atomik olarak geri yükler.
 * - Aynı transaction içinde hem Müşteri hem Yöneticiye iade e-postalarını kuyruğa yazar.
 */ function refundOrderAtomic(db, actor, orderId, input) {
  withTransaction(db, ()=>{
    const rawOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!rawOrder) {
      throw new ValidationError("İade edilecek sipariş bulunamadı.", "orderId");
    }
    // Yetki kontrolü: Müşteri yalnızca kendi siparişini iade edebilir
    if (actor.role === "CUSTOMER" && rawOrder.user_id !== actor.id) {
      throw new AuthError("Başka bir kullanıcıya ait siparişi iade edemezsiniz.", 403);
    }
    const targetStatus = input.mode === "REQUEST" ? "REFUND_REQUESTED" : "REFUNDED";
    // Deterministik FSM geçiş kontrolü (Double-refund dahil tüm kuralları denetler)
    const transitionRule = validateOrderTransition(rawOrder.status, targetStatus, actor.role);
    // İade tutarını her zaman dondurulmuş order_items snapshot üzerinden doğrula
    const snapshotSumRow = db.prepare("SELECT COALESCE(SUM(line_total_kurus_snapshot), 0) as snapshot_total FROM order_items WHERE order_id = ?").get(orderId);
    const refundAmountKurus = snapshotSumRow.snapshot_total || rawOrder.total_amount_kurus;
    const now = new Date().toISOString();
    const itemRows = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
    if (targetStatus === "REFUND_REQUESTED") {
      db.prepare(`
        UPDATE orders
        SET status = 'REFUND_REQUESTED', refund_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(input.reason, now, orderId);
      const orderForEmail = {
        id: rawOrder.id,
        orderNumber: rawOrder.order_number,
        customerNameSnapshot: rawOrder.customer_name_snapshot,
        customerEmailSnapshot: rawOrder.customer_email_snapshot,
        deliveryAddress: rawOrder.delivery_address,
        customerNote: rawOrder.customer_note,
        totalAmountKurus: rawOrder.total_amount_kurus,
        status: "REFUND_REQUESTED",
        createdAt: rawOrder.created_at,
        items: itemRows.map((i)=>({
            productId: i.product_id,
            productNameSnapshot: i.product_name_snapshot,
            portionInfoSnapshot: i.portion_info_snapshot,
            unitPriceKurusSnapshot: i.unit_price_kurus_snapshot,
            quantity: i.quantity,
            lineTotalKurusSnapshot: i.line_total_kurus_snapshot
          }))
      };
      enqueueRefundEmailsInTx(db, orderForEmail, {
        refundId: `REQ-${rawOrder.order_number}`,
        refundAmountKurus,
        reason: input.reason,
        stockRestored: false,
        refundedAt: now,
        processedByEmail: actor.email
      }, "ORDER_REFUND_REQUESTED");
      writeAuditLog(db, {
        actor,
        action: "ORDER_REFUND_REQUESTED",
        entityType: "ORDER",
        entityId: orderId,
        oldData: {
          status: rawOrder.status
        },
        newData: {
          status: "REFUND_REQUESTED",
          reason: input.reason,
          refundAmountKurus
        }
      });
      return;
    }
    // Tam İade (REFUNDED) işlemi
    const existingRefund = db.prepare("SELECT id FROM refunds WHERE order_id = ?").get(orderId);
    if (existingRefund) {
      throw new OrderFsmError("Bu sipariş için zaten tamamlanmış bir iade kaydı mevcuttur (Double-Refund Engellendi).", 409, "DOUBLE_REFUND_PREVENTED");
    }
    const shouldRestoreStock = input.restoreStock !== undefined ? input.restoreStock : transitionRule.defaultRestoreStock;
    let anyStockRestored = false;
    if (shouldRestoreStock) {
      const restoreStmt = db.prepare(`
        UPDATE products
        SET daily_stock = daily_stock + ?, updated_at = ?
        WHERE id = ?
      `);
      for (const item of itemRows){
        if (item.product_id) {
          const res = restoreStmt.run(item.quantity, now, item.product_id);
          if (res.changes > 0) {
            anyStockRestored = true;
          }
        }
      }
    }
    const refundId = generateId("ref");
    db.prepare(`
      INSERT INTO refunds (
        id, order_id, user_id, processed_by_user_id,
        amount_kurus, reason, stock_restored, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(refundId, orderId, rawOrder.user_id, actor.id, refundAmountKurus, input.reason, anyStockRestored ? 1 : 0, input.idempotencyKey ?? null, now);
    db.prepare(`
      UPDATE orders
      SET
        status = 'REFUNDED',
        refund_reason = ?,
        refunded_amount_kurus = ?,
        refunded_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(input.reason, refundAmountKurus, now, now, orderId);
    const orderForEmail = {
      id: rawOrder.id,
      orderNumber: rawOrder.order_number,
      customerNameSnapshot: rawOrder.customer_name_snapshot,
      customerEmailSnapshot: rawOrder.customer_email_snapshot,
      deliveryAddress: rawOrder.delivery_address,
      customerNote: rawOrder.customer_note,
      totalAmountKurus: rawOrder.total_amount_kurus,
      status: "REFUNDED",
      createdAt: rawOrder.created_at,
      items: itemRows.map((i)=>({
          productId: i.product_id,
          productNameSnapshot: i.product_name_snapshot,
          portionInfoSnapshot: i.portion_info_snapshot,
          unitPriceKurusSnapshot: i.unit_price_kurus_snapshot,
          quantity: i.quantity,
          lineTotalKurusSnapshot: i.line_total_kurus_snapshot
        }))
    };
    enqueueRefundEmailsInTx(db, orderForEmail, {
      refundId,
      refundAmountKurus,
      reason: input.reason,
      stockRestored: anyStockRestored,
      refundedAt: now,
      processedByEmail: actor.email
    }, "ORDER_REFUNDED");
    writeAuditLog(db, {
      actor,
      action: "ORDER_REFUNDED",
      entityType: "ORDER",
      entityId: orderId,
      oldData: {
        status: rawOrder.status,
        refundedAmountKurus: 0
      },
      newData: {
        status: "REFUNDED",
        refundId,
        refundAmountKurus,
        reason: input.reason,
        stockRestored: anyStockRestored
      }
    });
  });
  processEmailOutbox(db);
  return getOrderById(db, orderId);
}
/**
 * Yönetici tarafından sipariş durumunu ilerletir (örn. PAID -> PREPARING -> DELIVERED).
 */ function updateOrderStatusByAdmin(db, admin, orderId, targetStatus, reason) {
  if (targetStatus === "REFUNDED" || targetStatus === "REFUND_REQUESTED") {
    return refundOrderAtomic(db, admin, orderId, {
      reason: reason || "Yönetici tarafından iade işlemi uygulandı",
      mode: targetStatus === "REFUND_REQUESTED" ? "REQUEST" : "EXECUTE"
    });
  }
  return withTransaction(db, ()=>{
    const rawOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!rawOrder) {
      throw new ValidationError("Sipariş bulunamadı.", "orderId");
    }
    validateOrderTransition(rawOrder.status, targetStatus, admin.role);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
    `).run(targetStatus, now, orderId);
    writeAuditLog(db, {
      actor: admin,
      action: "ORDER_STATUS_CHANGED",
      entityType: "ORDER",
      entityId: orderId,
      oldData: {
        status: rawOrder.status
      },
      newData: {
        status: targetStatus
      }
    });
    return getOrderById(db, orderId);
  });
}
function getOrderById(db, orderId) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  return row ? hydrateOrder(db, row) : null;
}
function listOrdersForUser(db, userId) {
  const rows = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(userId);
  return rows.map((r)=>hydrateOrder(db, r));
}
function listAllOrdersForAdmin(db, options) {
  const conditions = [];
  const params = [];
  if (options?.status && options.status !== "ALL") {
    conditions.push("status = ?");
    params.push(options.status);
  }
  if (options?.search) {
    conditions.push("(LOWER(order_number) LIKE ? OR LOWER(customer_name_snapshot) LIKE ? OR LOWER(customer_email_snapshot) LIKE ?)");
    const q = `%${options.search.toLowerCase()}%`;
    params.push(q, q, q);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM orders ${whereClause} ORDER BY created_at DESC`).all(...params);
  return rows.map((r)=>hydrateOrder(db, r));
}
function getAdminDashboardStats(db) {
  const totalOrdersRow = db.prepare("SELECT COUNT(*) as cnt FROM orders").get();
  const grossRevenueRow = db.prepare("SELECT COALESCE(SUM(total_amount_kurus), 0) as sum FROM orders WHERE status != 'REFUNDED'").get();
  const refundedTotalRow = db.prepare("SELECT COALESCE(SUM(refunded_amount_kurus), 0) as sum, COUNT(*) as cnt FROM orders WHERE status = 'REFUNDED'").get();
  const activeProductsRow = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE is_archived = 0").get();
  const lowStockRow = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE is_archived = 0 AND daily_stock <= 5").get();
  const sentEmailsRow = db.prepare("SELECT COUNT(*) as cnt FROM email_outbox WHERE status = 'SENT'").get();
  return {
    totalOrders: totalOrdersRow.cnt,
    netRevenueKurus: grossRevenueRow.sum,
    netRevenueFormatted: formatKurus(grossRevenueRow.sum),
    refundedOrdersCount: refundedTotalRow.cnt,
    refundedAmountKurus: refundedTotalRow.sum,
    refundedAmountFormatted: formatKurus(refundedTotalRow.sum),
    activeProductsCount: activeProductsRow.cnt,
    lowStockCount: lowStockRow.cnt,
    sentEmailsCount: sentEmailsRow.cnt
  };
}

// --- src/services/supabaseSync.ts ---
const DEFAULT_SUPABASE_URL = "https://tociikxbqycmfvsdllwx.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_cnNDiLzf4pY1K1Z30shrZw_CmRbavTI";
function getSupabaseConfig() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") ?? getEnv("SUPABASE_URL") ?? DEFAULT_SUPABASE_URL;
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? getEnv("SUPABASE_ANON_KEY") ?? DEFAULT_SUPABASE_KEY;
  const disabled = getEnv("DISABLE_SUPABASE_SYNC") === "1";
  return {
    url: url.replace(/\/+$/, ""),
    key,
    enabled: Boolean(url && key && !disabled)
  };
}
const TABLES_IN_ORDER = [
  {
    name: "users",
    pk: "id"
  },
  {
    name: "sessions",
    pk: "token_hash"
  },
  {
    name: "products",
    pk: "id"
  },
  {
    name: "orders",
    pk: "id"
  },
  {
    name: "order_items",
    pk: "id"
  },
  {
    name: "refunds",
    pk: "id"
  },
  {
    name: "email_outbox",
    pk: "id"
  },
  {
    name: "audit_logs",
    pk: "id"
  }
];
let lastPullTime = 0;
const PULL_TTL_MS = 3500;
async function supabaseFetch(path, options = {}) {
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
      headers
    });
  } catch  {
    return null;
  }
}
/**
 * Yerel SQLite tablolarındaki güncel verileri Supabase (PostgreSQL) tablolarına yazar (Upsert).
 */ async function pushAllToSupabase(db) {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return false;
  try {
    for (const t of TABLES_IN_ORDER){
      const rows = db.prepare(`SELECT * FROM ${t.name}`).all();
      if (rows.length === 0) continue;
      const cleanRows = rows.map((r)=>({
          ...r
        }));
      const res = await supabaseFetch(`${t.name}?on_conflict=${t.pk}`, {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(cleanRows)
      });
      if (!res || !res.ok && res.status !== 201 && res.status !== 200 && res.status !== 204) {
        return false;
      }
    }
    lastPullTime = Date.now();
    return true;
  } catch  {
    return false;
  }
}
/**
 * Supabase (PostgreSQL) tablolarındaki kalıcı verileri çekip yerel SQLite motoruna senkronize eder.
 * Eğer Supabase tabloları yeni oluşturulmuş ve boşsa, başlangıç verilerini otomatik olarak Supabase'e yükler.
 */ async function pullFromSupabaseIfNeeded(db, force = false) {
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
    const remoteUsers = await usersRes.json();
    if (!Array.isArray(remoteUsers)) return;
    // Eğer Supabase'de tablo yeni açılmış ve henüz hiç kullanıcı yoksa: yerel başlangıç verisini Supabase'e yükle!
    if (remoteUsers.length === 0) {
      await pushAllToSupabase(db);
      return;
    }
    // Diğer tüm tabloları paralel olarak Supabase'den çek
    const otherTables = TABLES_IN_ORDER.slice(1);
    const responses = await Promise.all(otherTables.map((t)=>supabaseFetch(`${t.name}?select=*`)));
    const tableDataMap = new Map();
    tableDataMap.set("users", remoteUsers);
    for(let i = 0; i < otherTables.length; i++){
      const r = responses[i];
      if (!r || !r.ok) return;
      const rows = await r.json();
      if (!Array.isArray(rows)) return;
      tableDataMap.set(otherTables[i].name, rows);
    }
    // Atomik olarak yerel SQLite tablolarını Supabase verileriyle güncelle
    db.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE TRANSACTION;");
    try {
      for (const t of TABLES_IN_ORDER){
        const rows = tableDataMap.get(t.name) ?? [];
        db.exec(`DELETE FROM ${t.name}`);
        if (rows.length === 0) continue;
        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(()=>"?").join(", ");
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${t.name} (${cols.join(", ")}) VALUES (${placeholders})`);
        for (const row of rows){
          const vals = cols.map((c)=>row[c] === undefined ? null : row[c]);
          stmt.run(...vals);
        }
      }
      db.exec("COMMIT; PRAGMA foreign_keys = ON;");
      lastPullTime = Date.now();
    } catch  {
      try {
        db.exec("ROLLBACK; PRAGMA foreign_keys = ON;");
      } catch  {
      // Ignore
      }
    }
  } catch  {
  // Ağ hatası durumunda yerel veritabanı kesintisiz çalışmaya devam eder
  }
}
async function deleteRowInSupabase(table, pkCol, pkVal) {
  await supabaseFetch(`${table}?${pkCol}=eq.${encodeURIComponent(pkVal)}`, {
    method: "DELETE"
  });
}

// --- src/ui/indexHtml.ts ---
function renderIndexHtml() {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ev Yemeklerim — Günlük Taze Ev Yemekleri & Doğal Ürünler</title>
  <style>
    :root {
      --bg: #faf7f2;
      --surface: #ffffff;
      --surface-alt: #f3ede2;
      --border: #e5dec9;
      --primary: #b45309;
      --primary-hover: #92400e;
      --primary-light: #fef3c7;
      --accent: #15803d;
      --accent-light: #dcfce7;
      --danger: #b91c1c;
      --danger-light: #fee2e2;
      --text: #1c1917;
      --text-muted: #57534e;
      --radius: 14px;
      --shadow: 0 6px 24px rgba(28, 25, 23, 0.07);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    /* Header */
    header {
      background: #1c1917;
      color: #fff;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    }
    .header-inner {
      max-width: 1320px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      text-decoration: none;
      color: #fff;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #d97706, #9a3412);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .brand-sub {
      font-size: 11px;
      color: #d6d3d1;
      display: block;
    }
    .nav-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .nav-btn {
      background: rgba(255,255,255,0.08);
      color: #e7e5e4;
      border: 1px solid rgba(255,255,255,0.12);
      padding: 8px 15px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
    .nav-btn.active {
      background: var(--primary);
      border-color: #f59e0b;
      color: #fff;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cart-trigger {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #fff;
      border: none;
      padding: 9px 16px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(217,119,6,0.35);
    }
    .cart-badge {
      background: #fff;
      color: #9a3412;
      font-size: 12px;
      font-weight: 800;
      padding: 1px 7px;
      border-radius: 999px;
    }
    .user-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.1);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
    }
    .role-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 999px;
      text-transform: uppercase;
    }
    .role-ADMIN { background: #dc2626; color: #fff; }
    .role-CUSTOMER { background: #16a34a; color: #fff; }

    /* Hero */
    .hero {
      background: linear-gradient(135deg, #431407 0%, #7c2d12 55%, #9a3412 100%);
      color: #fff;
      padding: 36px 20px;
      border-bottom: 1px solid var(--border);
    }
    .hero-inner {
      max-width: 1320px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
    }
    .hero h1 {
      font-size: 30px;
      font-weight: 800;
      margin-bottom: 8px;
      line-height: 1.2;
    }
    .hero p {
      color: #fed7aa;
      max-width: 640px;
      font-size: 15px;
    }
    .hero-badges {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .hero-badge {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12.5px;
      color: #fffbeb;
    }

    /* Main Container */
    main {
      max-width: 1320px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 20px 60px;
      flex: 1;
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      background: var(--surface);
      padding: 14px 18px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
    }
    .category-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .cat-pill {
      background: var(--surface-alt);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .cat-pill.active, .cat-pill:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .search-input {
      padding: 9px 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-size: 14px;
      min-width: 240px;
      outline: none;
    }
    .search-input:focus { border-color: var(--primary); }

    /* Product Grid */
    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 22px;
    }
    .product-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      transition: transform 0.18s, box-shadow 0.18s;
    }
    .product-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 28px rgba(28, 25, 23, 0.12);
    }
    .product-img-wrap {
      position: relative;
      height: 195px;
      background: #292524;
      overflow: hidden;
    }
    .product-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .stock-pill {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      backdrop-filter: blur(6px);
    }
    .stock-ok { background: rgba(21, 128, 61, 0.9); color: #fff; }
    .stock-low { background: rgba(180, 83, 9, 0.95); color: #fff; }
    .stock-out { background: rgba(185, 28, 28, 0.95); color: #fff; }
    .cat-tag {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(28, 25, 23, 0.8);
      color: #fef3c7;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .product-body {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .product-title {
      font-size: 17px;
      font-weight: 800;
      color: var(--text);
    }
    .product-meta {
      display: flex;
      gap: 10px;
      font-size: 12px;
      color: var(--text-muted);
      flex-wrap: wrap;
    }
    .product-desc {
      font-size: 13.5px;
      color: var(--text-muted);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .allergen-list {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .allergen-chip {
      font-size: 11px;
      background: #fff7ed;
      color: #9a3412;
      border: 1px solid #fed7aa;
      padding: 2px 7px;
      border-radius: 6px;
      font-weight: 600;
    }
    .product-footer {
      padding: 12px 16px 16px;
      border-top: 1px solid #f5f5f4;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .price-tag {
      font-size: 20px;
      font-weight: 900;
      color: var(--primary);
    }
    .btn {
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
    .btn-outline { background: transparent; border-color: var(--border); color: var(--text); }
    .btn-outline:hover:not(:disabled) { background: var(--surface-alt); }
    .btn-success { background: var(--accent); color: #fff; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }

    /* Cards & Tables for Orders / Admin */
    .panel-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      box-shadow: var(--shadow);
    }
    .stat-label { font-size: 12.5px; color: var(--text-muted); font-weight: 600; }
    .stat-value { font-size: 24px; font-weight: 900; margin-top: 4px; color: var(--text); }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
    }
    th, td {
      padding: 11px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: var(--surface-alt);
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    /* Status Badges */
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 800;
    }
    .status-PAID { background: #dbeafe; color: #1e40af; }
    .status-PREPARING { background: #fef3c7; color: #92400e; }
    .status-DELIVERED { background: #dcfce7; color: #166534; }
    .status-REFUND_REQUESTED { background: #ffedd5; color: #9a3412; }
    .status-REFUNDED { background: #fee2e2; color: #991b1b; }

    /* Modals & Drawers */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(28, 25, 23, 0.65);
      backdrop-filter: blur(3px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: 16px;
    }
    .modal-backdrop.open { display: flex; }
    .modal-box {
      background: var(--surface);
      border-radius: 16px;
      max-width: 680px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.3);
      border: 1px solid var(--border);
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 12px;
    }
    .form-group.full { grid-column: 1 / -1; }
    .form-group label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text-muted);
    }
    .form-control {
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
    }
    textarea.form-control { min-height: 80px; resize: vertical; }

    /* Toast Notification */
    #toast-container {
      position: fixed;
      bottom: 22px;
      right: 22px;
      z-index: 300;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toast {
      background: #1c1917;
      color: #fff;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 13.5px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.22);
      border-left: 5px solid var(--primary);
      max-width: 380px;
    }
    .toast.success { border-left-color: #22c55e; }
    .toast.error { border-left-color: #ef4444; }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <div class="brand" onclick="switchView('store')">
        <div class="brand-icon">🍲</div>
        <div>
          <span class="brand-title">Ev Yemeklerim</span>
          <span class="brand-sub">Anne Eli Değmiş Günlük Taze Lezzetler</span>
        </div>
      </div>

      <nav class="nav-tabs">
        <button class="nav-btn active" id="nav-store" onclick="switchView('store')">🍽️ Günün Menüsü & Ürünler</button>
        <button class="nav-btn" id="nav-orders" onclick="switchView('orders')" style="display:none;">📦 Siparişlerim & İade</button>
        <button class="nav-btn" id="nav-emails" onclick="switchView('emails')" style="display:none;">✉️ E-Posta Bildirimlerim</button>
        <button class="nav-btn" id="nav-profile" onclick="switchView('profile')" style="display:none;">👤 Üyelik Bilgilerim</button>
        <button class="nav-btn" id="nav-admin" onclick="switchView('admin')" style="display:none;">🛠️ Yönetici Paneli</button>
      </nav>

      <div class="header-actions">
        <div id="auth-area"></div>
        <button class="cart-trigger" onclick="openCartModal()">
          🛒 Sepetim <span class="cart-badge" id="cart-count">0</span>
        </button>
      </div>
    </div>
  </header>

  <section class="hero" id="hero-banner">
    <div class="hero-inner">
      <div>
        <h1>Katkısız, Doğal Ev Yapımı Lezzetler & Kurutmalıklar</h1>
        <p>Dalında kurutulmuş Aydın dağ inciri, doğal fermente sele siyah zeytin, güneşte kurutulmuş cennet hurması, çıtır incir reçeli ve el yapımı kızarmış içli köfte doğrudan mutfağımızdan sofranıza.</p>
        <div class="hero-badges">
          <span class="hero-badge">✅ %100 Doğal & Katkısız Ev Yapımı</span>
          <span class="hero-badge">🔒 Atomik Günlük Stok Garantisi</span>
          <span class="hero-badge">✉️ Anında Sipariş & İade E-Posta Bildirimi</span>
        </div>
      </div>
    </div>
  </section>

  <main>
    <!-- VIEW 1: STOREFRONT -->
    <div id="view-store">
      <div class="filter-bar">
        <div class="category-pills" id="category-pills"></div>
        <input type="search" id="search-box" class="search-input" placeholder="Yemek, malzeme veya kategori ara..." oninput="renderStorefront()" />
      </div>
      <div class="product-grid" id="product-grid"></div>
    </div>

    <!-- VIEW 2: CUSTOMER ORDERS & REFUNDS -->
    <div id="view-orders" style="display:none;">
      <div class="panel-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;">📦 Siparişlerim ve İade Yönetimi</h2>
            <p style="font-size:13.5px;color:var(--text-muted);">Siparişlerinizin durumunu takip edebilir, satın alma anındaki dondurulmuş (snapshot) fiyatları görebilir ve tek tıkla iade işlemi başlatabilirsiniz.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="loadMyOrders()">🔄 Yenile</button>
        </div>
        <div id="my-orders-container"></div>
      </div>
    </div>

    <!-- VIEW 3: TRANSACTIONAL EMAIL INBOX -->
    <div id="view-emails" style="display:none;">
      <div class="panel-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
          <div>
            <h2 style="font-size:22px;font-weight:800;">✉️ Gönderilen E-Posta Bildirimleri</h2>
            <p style="font-size:13.5px;color:var(--text-muted);">Satın alma ve iade işlemlerinde hesabınıza gönderilen gerçek HTML e-posta bildirimleri.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="loadEmailsView()">🔄 Yenile</button>
        </div>
        <div id="emails-list-container"></div>
      </div>
    </div>

    <!-- VIEW 3B: MEMBER PROFILE & ACCOUNT SETTINGS -->
    <div id="view-profile" style="display:none;">
      <div class="panel-card" style="max-width:680px;margin:0 auto;">
        <h2 style="font-size:22px;font-weight:800;margin-bottom:6px;">👤 Üyelik Bilgilerim ve Teslimat Ayarları</h2>
        <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:18px;">Kayıtlı iletişim bilgilerinizi, varsayılan teslimat adresinizi ve hesap şifrenizi buradan güncelleyebilirsiniz.</p>
        <form onsubmit="submitProfileForm(event)">
          <div class="form-group">
            <label>E-Posta Adresi (Değiştirilemez)</label>
            <input type="email" id="prof-email" class="form-control" disabled style="background:#f5f5f4;" />
          </div>
          <div class="form-group">
            <label>Ad Soyad *</label>
            <input type="text" id="prof-fullname" class="form-control" required />
          </div>
          <div class="form-group">
            <label>Telefon Numarası</label>
            <input type="text" id="prof-phone" class="form-control" />
          </div>
          <div class="form-group">
            <label>Varsayılan Teslimat Adresi</label>
            <textarea id="prof-address" class="form-control"></textarea>
          </div>
          <div class="form-group">
            <label>Yeni Şifre (Değiştirmek istemiyorsanız boş bırakın)</label>
            <input type="password" id="prof-password" class="form-control" placeholder="En az 6 karakter" />
          </div>
          <button type="submit" class="btn btn-primary">💾 Üyelik Bilgilerimi Güncelle</button>
        </form>
      </div>
    </div>

    <!-- VIEW 4: ADMIN PANEL -->
    <div id="view-admin" style="display:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:24px;font-weight:900;">🛠️ Yönetici Kontrol Paneli (Admin)</h2>
          <p style="font-size:13.5px;color:var(--text-muted);">Ürün ekleme, çıkarma, fiyat/stok düzenleme, sipariş durumu ilerletme, iade onaylama, e-posta kuyruğu ve denetim izi (Audit Log).</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="openProductModal()">➕ Yeni Yemek / Ürün Ekle</button>
          <button class="btn btn-outline" onclick="loadAdminAll()">🔄 Tüm Verileri Yenile</button>
        </div>
      </div>

      <div class="stats-grid" id="admin-stats-grid"></div>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="cat-pill active" id="adm-tab-products" onclick="switchAdminSubTab('products')">🍲 Ürün & Menü Yönetimi</button>
        <button class="cat-pill" id="adm-tab-orders" onclick="switchAdminSubTab('orders')">📋 Sipariş & İade (FSM) Yönetimi</button>
        <button class="cat-pill" id="adm-tab-outbox" onclick="switchAdminSubTab('outbox')">📨 E-Posta Outbox Kuyruğu</button>
        <button class="cat-pill" id="adm-tab-audit" onclick="switchAdminSubTab('audit')">🛡️ Denetim İzi (Audit Logs)</button>
      </div>

      <div id="admin-sub-products" class="panel-card"></div>
      <div id="admin-sub-orders" class="panel-card" style="display:none;"></div>
      <div id="admin-sub-outbox" class="panel-card" style="display:none;"></div>
      <div id="admin-sub-audit" class="panel-card" style="display:none;"></div>
    </div>
  </main>

  <!-- MODAL: PRODUCT DETAIL -->
  <div class="modal-backdrop" id="modal-product-detail">
    <div class="modal-box" id="modal-product-detail-content"></div>
  </div>

  <!-- MODAL: AUTH (LOGIN / REGISTER) -->
  <div class="modal-backdrop" id="modal-auth">
    <div class="modal-box" style="max-width:480px;">
      <div class="modal-header">
        <h3 id="auth-modal-title" style="font-size:19px;font-weight:800;">Hesaba Giriş Yap</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-auth')">✕</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn btn-sm btn-primary" id="tab-login-btn" onclick="toggleAuthMode('login')" style="flex:1;">Giriş Yap</button>
        <button class="btn btn-sm btn-outline" id="tab-register-btn" onclick="toggleAuthMode('register')" style="flex:1;">Yeni Hesap Oluştur</button>
      </div>
      <form id="auth-form" onsubmit="submitAuthForm(event)">
        <div id="register-extra-fields" style="display:none;">
          <div class="form-group">
            <label>Ad Soyad *</label>
            <input type="text" id="auth-fullname" class="form-control" placeholder="Örn: Mehmet Demir" />
          </div>
          <div class="form-group">
            <label>Telefon Numarası</label>
            <input type="text" id="auth-phone" class="form-control" placeholder="0532 000 00 00" />
          </div>
          <div class="form-group">
            <label>Teslimat Adresi</label>
            <input type="text" id="auth-address" class="form-control" placeholder="Mahalle, Sokak, Bina ve Daire No, İlçe/İl" />
          </div>
        </div>
        <div class="form-group">
          <label>E-Posta Adresi *</label>
          <input type="email" id="auth-email" class="form-control" required placeholder="ornek@eposta.com" />
        </div>
        <div class="form-group">
          <label>Şifre *</label>
          <input type="password" id="auth-password" class="form-control" required placeholder="En az 6 karakter" />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;padding:11px;margin-top:8px;" id="auth-submit-btn">Giriş Yap</button>
      </form>
    </div>
  </div>

  <!-- MODAL: CART & CHECKOUT -->
  <div class="modal-backdrop" id="modal-cart">
    <div class="modal-box">
      <div class="modal-header">
        <h3 style="font-size:20px;font-weight:800;">🛒 Sepetim ve Sipariş Tamamlama</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-cart')">✕</button>
      </div>
      <div id="cart-modal-body"></div>
    </div>
  </div>

  <!-- MODAL: ADMIN CREATE/EDIT PRODUCT -->
  <div class="modal-backdrop" id="modal-admin-product">
    <div class="modal-box">
      <div class="modal-header">
        <h3 id="admin-product-modal-title" style="font-size:20px;font-weight:800;">Ürün Ekle / Düzenle</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-admin-product')">✕</button>
      </div>
      <form id="admin-product-form" onsubmit="submitAdminProductForm(event)">
        <input type="hidden" id="prd-id" />
        <div class="form-grid">
          <div class="form-group full">
            <label>Yemek / Ürün Adı *</label>
            <input type="text" id="prd-name" class="form-control" required placeholder="Örn: Anne Usulü Karnıyarık" />
          </div>
          <div class="form-group">
            <label>Kategori *</label>
            <input type="text" id="prd-category" class="form-control" required placeholder="Kurutmalıklar & Doğal Meyveler" list="cat-suggestions" />
            <datalist id="cat-suggestions">
              <option value="Kurutmalıklar & Doğal Meyveler"></option>
              <option value="Kahvaltılık & Zeytin"></option>
              <option value="Ev Yapımı Reçeller"></option>
              <option value="İçli Köfte & Ev Yemekleri"></option>
            </datalist>
          </div>
          <div class="form-group">
            <label>Birim Fiyat (TL) *</label>
            <input type="text" id="prd-price-tl" class="form-control" required placeholder="Örn: 260,00" />
          </div>
          <div class="form-group">
            <label>Günlük Stok / Porsiyon Kapasitesi *</label>
            <input type="number" id="prd-stock" class="form-control" required min="0" max="10000" value="25" />
          </div>
          <div class="form-group">
            <label>Hazırlanma Süresi (Dakika) *</label>
            <input type="number" id="prd-prep" class="form-control" required min="1" max="1440" value="15" />
          </div>
          <div class="form-group full">
            <label>Porsiyon / Gramaj Bilgisi *</label>
            <input type="text" id="prd-portion" class="form-control" required placeholder="Örn: 1 Paket (500g Net)" />
          </div>
          <div class="form-group full">
            <label>Alerjen Etiketleri (Virgülle ayırın)</label>
            <input type="text" id="prd-allergens" class="form-control" placeholder="Örn: Gluten, Ceviz, Yumurta" />
          </div>
          <div class="form-group full">
            <label>Ürün Görseli (URL girin veya bilgisayardan fotoğraf seçin)</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="text" id="prd-image" class="form-control" style="flex:1;" placeholder="/uploads/kuru-incir.jpg veya https://..." />
              <input type="file" id="prd-image-file" accept="image/*" style="font-size:12px;max-width:210px;" onchange="handleImageFileSelect(event)" />
            </div>
          </div>
          <div class="form-group full">
            <label>Ürün Tanıtımı, İçindekiler ve Isıtma Önerisi *</label>
            <textarea id="prd-desc" class="form-control" required placeholder="Yemeğin malzemelerini, pişirme tekniğini ve lezzet detaylarını yazın..."></textarea>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="prd-featured" /> Vitrinde Öne Çıkan Ürün
            </label>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
          <button type="button" class="btn btn-outline" onclick="closeModal('modal-admin-product')">İptal</button>
          <button type="submit" class="btn btn-primary">💾 Kaydet</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: EMAIL HTML PREVIEW -->
  <div class="modal-backdrop" id="modal-email-preview">
    <div class="modal-box" style="max-width:740px;">
      <div class="modal-header">
        <h3 id="email-preview-title" style="font-size:17px;font-weight:800;">E-Posta Önizleme</h3>
        <button class="btn btn-sm btn-outline" onclick="closeModal('modal-email-preview')">✕</button>
      </div>
      <div id="email-preview-meta" style="font-size:12.5px;background:var(--surface-alt);padding:10px 14px;border-radius:8px;margin-bottom:12px;"></div>
      <iframe id="email-preview-frame" style="width:100%;height:460px;border:1px solid var(--border);border-radius:10px;background:#fff;"></iframe>
    </div>
  </div>

  <div id="toast-container"></div>

  <script>
    let state = {
      user: null,
      products: [],
      adminProducts: [],
      selectedCategory: 'Tümü',
      cart: JSON.parse(localStorage.getItem('evyemek_cart') || '[]'),
      myOrders: [],
      adminOrders: [],
      emails: [],
      auditLogs: [],
      authMode: 'login',
      currentView: 'store'
    };

    function showToast(msg, type = 'info') {
      const wrap = document.getElementById('toast-container');
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(() => el.remove(), 4200);
    }

    function escapeHtml(s) {
      if (s === null || s === undefined) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatKurus(k) {
      const n = Math.round(Number(k) || 0);
      const lira = Math.floor(Math.abs(n) / 100);
      const kurus = Math.abs(n) % 100;
      return (n < 0 ? '-' : '') + lira.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + ',' + String(kurus).padStart(2, '0') + ' ₺';
    }

    async function api(path, options = {}) {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || ('İşlem başarısız (' + res.status + ')'));
      }
      return data;
    }

    function saveCart() {
      localStorage.setItem('evyemek_cart', JSON.stringify(state.cart));
      const totalQty = state.cart.reduce((s, i) => s + i.quantity, 0);
      document.getElementById('cart-count').textContent = totalQty;
    }

    async function initApp() {
      saveCart();
      await Promise.all([fetchCurrentUser(), fetchProducts()]);
    }

    async function fetchCurrentUser() {
      try {
        const data = await api('/api/auth/me');
        state.user = data.user;
      } catch {
        state.user = null;
      }
      renderAuthHeader();
    }

    function renderAuthHeader() {
      const area = document.getElementById('auth-area');
      const ordersBtn = document.getElementById('nav-orders');
      const emailsBtn = document.getElementById('nav-emails');
      const profileBtn = document.getElementById('nav-profile');
      const adminBtn = document.getElementById('nav-admin');

      if (state.user) {
        ordersBtn.style.display = 'inline-flex';
        emailsBtn.style.display = 'inline-flex';
        profileBtn.style.display = 'inline-flex';
        adminBtn.style.display = state.user.role === 'ADMIN' ? 'inline-flex' : 'none';
        area.innerHTML = \`
          <div class="user-pill">
            <span class="role-badge role-\${state.user.role}">\${state.user.role === 'ADMIN' ? 'YÖNETİCİ' : 'ÜYE'}</span>
            <strong>\${escapeHtml(state.user.fullName)}</strong>
            <button class="btn btn-sm btn-outline" style="color:#fff;border-color:rgba(255,255,255,0.25);padding:3px 8px;" onclick="logout()">Çıkış Yap</button>
          </div>
        \`;
      } else {
        ordersBtn.style.display = 'none';
        emailsBtn.style.display = 'none';
        profileBtn.style.display = 'none';
        adminBtn.style.display = 'none';
        area.innerHTML = \`
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-outline" style="color:#fff;border-color:rgba(255,255,255,0.35);" onclick="openAuthModal('login')">🔑 Giriş Yap</button>
            <button class="btn btn-sm btn-primary" onclick="openAuthModal('register')">✨ Üye Ol</button>
          </div>
        \`;
      }
    }

    async function logout() {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      renderAuthHeader();
      showToast('Oturumunuz kapatıldı.');
      switchView('store');
    }

    function openAuthModal(mode = 'login') {
      toggleAuthMode(mode);
      document.getElementById('modal-auth').classList.add('open');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
    }

    function toggleAuthMode(mode) {
      state.authMode = mode;
      const isReg = mode === 'register';
      document.getElementById('auth-modal-title').textContent = isReg ? 'Yeni Üyelik Oluştur' : 'Üye / Yönetici Girişi';
      document.getElementById('register-extra-fields').style.display = isReg ? 'block' : 'none';
      document.getElementById('auth-submit-btn').textContent = isReg ? 'Üye Ol ve Giriş Yap' : 'Giriş Yap';
      document.getElementById('tab-login-btn').className = isReg ? 'btn btn-sm btn-outline' : 'btn btn-sm btn-primary';
      document.getElementById('tab-register-btn').className = isReg ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
    }

    async function submitAuthForm(e) {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      try {
        if (state.authMode === 'register') {
          const fullName = document.getElementById('auth-fullname').value;
          const phone = document.getElementById('auth-phone').value;
          const address = document.getElementById('auth-address').value;
          const res = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ fullName, email, password, phone, address })
          });
          state.user = res.user;
          showToast('Üyeliğiniz oluşturuldu, hoş geldiniz!', 'success');
        } else {
          const res = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
          });
          state.user = res.user;
          showToast('Hoş geldiniz, ' + res.user.fullName + '!', 'success');
        }
        closeModal('modal-auth');
        renderAuthHeader();
        if (state.user && state.user.role === 'ADMIN') {
          await switchView('admin');
        } else {
          await switchView('store');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function fetchProducts() {
      const data = await api('/api/products');
      state.products = data.products;
      renderCategories();
      renderStorefront();
    }

    function renderCategories() {
      const cats = ['Tümü', ...new Set(state.products.map(p => p.category))];
      const wrap = document.getElementById('category-pills');
      wrap.innerHTML = cats.map(c => \`
        <button class="cat-pill \${state.selectedCategory === c ? 'active' : ''}" onclick="selectCategory('\${escapeHtml(c)}')">\${escapeHtml(c)}</button>
      \`).join('');
    }

    function selectCategory(c) {
      state.selectedCategory = c;
      renderCategories();
      renderStorefront();
    }

    function renderStorefront() {
      const q = (document.getElementById('search-box').value || '').toLowerCase().trim();
      const filtered = state.products.filter(p => {
        if (state.selectedCategory !== 'Tümü' && p.category !== state.selectedCategory) return false;
        if (q && !(p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))) return false;
        return true;
      });

      const grid = document.getElementById('product-grid');
      if (filtered.length === 0) {
        grid.innerHTML = '<div class="panel-card" style="grid-column:1/-1;text-align:center;padding:40px;">Aradığınız kriterlere uygun yemek/ürün bulunamadı.</div>';
        return;
      }

      grid.innerHTML = filtered.map(p => {
        const stockClass = p.dailyStock === 0 ? 'stock-out' : (p.dailyStock <= 5 ? 'stock-low' : 'stock-ok');
        const stockText = p.dailyStock === 0 ? 'Bugün Tükendi' : (p.dailyStock <= 5 ? \`Son \${p.dailyStock} Porsiyon!\` : \`Günlük Stok: \${p.dailyStock}\`);
        const allergensHtml = (p.allergens || []).map(a => \`<span class="allergen-chip">⚠️ \${escapeHtml(a)}</span>\`).join('');

        return \`
          <article class="product-card">
            <div class="product-img-wrap" onclick="openProductDetail('\${p.id}')" style="cursor:pointer;">
              <img src="\${escapeHtml(p.imageUrl)}" alt="\${escapeHtml(p.name)}" />
              <span class="cat-tag">\${escapeHtml(p.category)}</span>
              <span class="stock-pill \${stockClass}">\${stockText}</span>
            </div>
            <div class="product-body">
              <div class="product-title" onclick="openProductDetail('\${p.id}')" style="cursor:pointer;">\${escapeHtml(p.name)}</div>
              <div class="product-meta">
                <span>⚖️ \${escapeHtml(p.portionInfo)}</span>
                <span>⏱️ \${p.prepTimeMinutes} dk</span>
              </div>
              <p class="product-desc">\${escapeHtml(p.description)}</p>
              <div class="allergen-list">\${allergensHtml}</div>
            </div>
            <div class="product-footer">
              <div class="price-tag">\${p.priceFormatted}</div>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-outline" onclick="openProductDetail('\${p.id}')">Detay</button>
                <button class="btn btn-sm btn-primary" \${p.dailyStock <= 0 ? 'disabled' : ''} onclick="addToCart('\${p.id}', 1)">
                  \${p.dailyStock <= 0 ? 'Tükendi' : '➕ Sepete Ekle'}
                </button>
              </div>
            </div>
          </article>
        \`;
      }).join('');
    }

    function openProductDetail(productId) {
      const p = state.products.find(x => x.id === productId);
      if (!p) return;
      const allergensHtml = (p.allergens && p.allergens.length > 0)
        ? p.allergens.map(a => \`<span class="allergen-chip">⚠️ \${escapeHtml(a)}</span>\`).join(' ')
        : '<span style="font-size:12px;color:var(--accent);">Bilinen alerjen içermez</span>';

      document.getElementById('modal-product-detail-content').innerHTML = \`
        <div class="modal-header">
          <h3 style="font-size:20px;font-weight:800;">\${escapeHtml(p.name)}</h3>
          <button class="btn btn-sm btn-outline" onclick="closeModal('modal-product-detail')">✕</button>
        </div>
        <div style="border-radius:12px;overflow:hidden;height:240px;margin-bottom:16px;">
          <img src="\${escapeHtml(p.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <span class="status-badge status-PAID">\${escapeHtml(p.category)}</span>
          <span style="font-size:24px;font-weight:900;color:var(--primary);">\${p.priceFormatted}</span>
        </div>
        <p style="font-size:14.5px;line-height:1.65;margin-bottom:16px;color:var(--text);">\${escapeHtml(p.description)}</p>
        <div style="background:var(--surface-alt);padding:14px;border-radius:10px;font-size:13.5px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><strong>⚖️ Porsiyon / Gramaj:</strong> \${escapeHtml(p.portionInfo)}</div>
          <div><strong>⏱️ Hazırlanma Süresi:</strong> \${p.prepTimeMinutes} Dakika</div>
          <div><strong>🍲 Günlük Kalan Stok:</strong> \${p.dailyStock} Porsiyon</div>
          <div><strong>🛡️ Alerjen Bilgisi:</strong> \${allergensHtml}</div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button class="btn btn-outline" onclick="closeModal('modal-product-detail')">Kapat</button>
          <button class="btn btn-primary" \${p.dailyStock <= 0 ? 'disabled' : ''} onclick="addToCart('\${p.id}', 1); closeModal('modal-product-detail');">
            🛒 Sepete Ekle (\${p.priceFormatted})
          </button>
        </div>
      \`;
      document.getElementById('modal-product-detail').classList.add('open');
    }

    function addToCart(productId, delta) {
      const p = state.products.find(x => x.id === productId);
      if (!p && delta > 0) return;
      const existing = state.cart.find(i => i.productId === productId);
      if (existing) {
        const nextQty = existing.quantity + delta;
        if (nextQty <= 0) {
          state.cart = state.cart.filter(i => i.productId !== productId);
        } else if (p && nextQty > p.dailyStock) {
          showToast(\`Bu üründen günlük stokta en fazla \${p.dailyStock} adet bulunmaktadır.\`, 'error');
          return;
        } else {
          existing.quantity = nextQty;
        }
      } else if (delta > 0) {
        if (p.dailyStock < delta) {
          showToast('Stok yetersiz.', 'error');
          return;
        }
        state.cart.push({ productId, quantity: delta });
      }
      saveCart();
      if (delta > 0 && p) {
        showToast(\`"\${p.name}" sepete eklendi.\`, 'success');
      }
      if (document.getElementById('modal-cart').classList.contains('open')) {
        renderCartModal();
      }
    }

    async function openCartModal() {
      document.getElementById('modal-cart').classList.add('open');
      await renderCartModal();
    }

    async function renderCartModal() {
      const body = document.getElementById('cart-modal-body');
      if (state.cart.length === 0) {
        body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Sepetinizde henüz ürün bulunmuyor.</div>';
        return;
      }

      let totalKurus = 0;
      const rowsHtml = state.cart.map(item => {
        const p = state.products.find(x => x.id === item.productId);
        if (!p) return '';
        const lineKurus = p.priceKurus * item.quantity;
        totalKurus += lineKurus;
        return \`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:10px;">
            <div style="flex:1;">
              <div style="font-weight:700;">\${escapeHtml(p.name)}</div>
              <div style="font-size:12px;color:var(--text-muted);">\${escapeHtml(p.portionInfo)} • Birim: \${p.priceFormatted}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button class="btn btn-sm btn-outline" onclick="addToCart('\${p.id}', -1)">−</button>
              <strong style="min-width:24px;text-align:center;">\${item.quantity}</strong>
              <button class="btn btn-sm btn-outline" onclick="addToCart('\${p.id}', 1)">+</button>
            </div>
            <div style="font-weight:800;min-width:90px;text-align:right;">\${formatKurus(lineKurus)}</div>
          </div>
        \`;
      }).join('');

      const defaultAddress = state.user ? (state.user.address || '') : '';
      body.innerHTML = \`
        <div>\${rowsHtml}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;font-size:19px;font-weight:900;color:var(--primary);">
          <span>Sunucu Doğrulamalı Toplam:</span>
          <span>\${formatKurus(totalKurus)}</span>
        </div>
        \${!state.user ? \`
          <div style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:10px;margin-bottom:12px;font-size:13.5px;">
            Siparişi tamamlamak ve üyelik özelliklerinden yararlanmak için lütfen üye girişi yapın veya yeni bir hesap oluşturun.
            <div style="margin-top:8px;display:flex;gap:8px;">
              <button class="btn btn-sm btn-primary" onclick="closeModal('modal-cart'); openAuthModal('login');">🔑 Giriş Yap</button>
              <button class="btn btn-sm btn-outline" onclick="closeModal('modal-cart'); openAuthModal('register');">✨ Yeni Üyelik Oluştur</button>
            </div>
          </div>
        \` : \`
          <form onsubmit="submitCheckout(event)">
            <div class="form-group">
              <label>Teslimat Adresi *</label>
              <input type="text" id="checkout-address" class="form-control" required value="\${escapeHtml(defaultAddress)}" />
            </div>
            <div class="form-group">
              <label>Sipariş / Teslimat Notu (Opsiyonel)</label>
              <input type="text" id="checkout-note" class="form-control" placeholder="Örn: Paketleme özenli olsun, zile basmayınız vb." />
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;padding:12px;font-size:15px;">
              ✅ Siparişi Onayla ve Satın Al (\${formatKurus(totalKurus)})
            </button>
          </form>
        \`}
      \`;
    }

    async function submitCheckout(e) {
      e.preventDefault();
      const deliveryAddress = document.getElementById('checkout-address').value;
      const customerNote = document.getElementById('checkout-note').value;
      try {
        const res = await api('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            items: state.cart,
            deliveryAddress,
            customerNote,
            idempotencyKey: 'chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
          })
        });
        state.cart = [];
        saveCart();
        closeModal('modal-cart');
        await fetchProducts();
        showToast(\`Siparişiniz (#\${res.order.orderNumber}) oluşturuldu ve onay e-postası gönderildi!\`, 'success');
        switchView('orders');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function switchView(view) {
      // Yetkisiz görünüm geçişlerini engelle
      if (view === 'admin') {
        if (!state.user || state.user.role !== 'ADMIN') {
          showToast('Yönetici paneline yalnızca yönetici hesabıyla giriş yapıldığında erişilebilir.', 'error');
          openAuthModal('login');
          return;
        }
      }
      if (['orders', 'emails', 'profile'].includes(view) && !state.user) {
        showToast('Üyelik özelliklerine erişmek için lütfen giriş yapın.', 'info');
        openAuthModal('login');
        return;
      }

      state.currentView = view;
      ['store', 'orders', 'emails', 'profile', 'admin'].forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) el.style.display = v === view ? 'block' : 'none';
        const btn = document.getElementById('nav-' + v);
        if (btn) btn.classList.toggle('active', v === view);
      });
      document.getElementById('hero-banner').style.display = view === 'store' ? 'block' : 'none';

      if (view === 'store') await fetchProducts();
      if (view === 'orders') await loadMyOrders();
      if (view === 'emails') await loadEmailsView();
      if (view === 'profile') loadProfileView();
      if (view === 'admin') await loadAdminAll();
    }

    function loadProfileView() {
      if (!state.user) return;
      document.getElementById('prof-email').value = state.user.email || '';
      document.getElementById('prof-fullname').value = state.user.fullName || '';
      document.getElementById('prof-phone').value = state.user.phone || '';
      document.getElementById('prof-address').value = state.user.address || '';
      document.getElementById('prof-password').value = '';
    }

    async function submitProfileForm(e) {
      e.preventDefault();
      try {
        const payload = {
          fullName: document.getElementById('prof-fullname').value,
          phone: document.getElementById('prof-phone').value,
          address: document.getElementById('prof-address').value,
          newPassword: document.getElementById('prof-password').value || undefined
        };
        const res = await api('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        state.user = res.user;
        document.getElementById('prof-password').value = '';
        renderAuthHeader();
        showToast('Üyelik bilgileriniz başarıyla güncellendi!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function loadMyOrders() {
      const wrap = document.getElementById('my-orders-container');
      if (!state.user) {
        wrap.innerHTML = '<div style="padding:24px;text-align:center;">Siparişlerinizi görmek için lütfen giriş yapın.</div>';
        return;
      }
      try {
        const data = await api('/api/orders/my');
        state.myOrders = data.orders;
        if (state.myOrders.length === 0) {
          wrap.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Henüz bir siparişiniz bulunmuyor.</div>';
          return;
        }
        wrap.innerHTML = state.myOrders.map(o => renderOrderCardHtml(o, false)).join('');
      } catch (err) {
        wrap.innerHTML = \`<div style="color:var(--danger);">\${escapeHtml(err.message)}</div>\`;
      }
    }

    function renderOrderCardHtml(o, isAdminView) {
      const itemsHtml = o.items.map(i => \`
        <tr>
          <td><strong>\${escapeHtml(i.productNameSnapshot)}</strong> <span style="color:var(--text-muted);font-size:12px;">(\${escapeHtml(i.portionInfoSnapshot)})</span></td>
          <td>\${i.quantity} Adet</td>
          <td>\${i.unitPriceFormatted} <span style="font-size:10px;color:var(--text-muted);">(Dondurulmuş Fiyat)</span></td>
          <td style="font-weight:700;">\${i.lineTotalFormatted}</td>
        </tr>
      \`).join('');

      let actionsHtml = '';
      if (!isAdminView) {
        if (o.status !== 'REFUNDED') {
          actionsHtml += \`
            <button class="btn btn-sm btn-danger" onclick="triggerRefund('\${o.id}', 'EXECUTE')">↩️ Siparişi İade Et (Tam İade & E-Posta)</button>
          \`;
          if (o.status !== 'REFUND_REQUESTED') {
            actionsHtml += \`
              <button class="btn btn-sm btn-outline" onclick="triggerRefund('\${o.id}', 'REQUEST')">📝 İade Talebi Oluştur</button>
            \`;
          }
        }
      } else {
        if (o.status === 'PAID') {
          actionsHtml += \`<button class="btn btn-sm btn-primary" onclick="adminChangeOrderStatus('\${o.id}', 'PREPARING')">👨‍🍳 Hazırlanıyor Yap</button>\`;
        }
        if (o.status === 'PREPARING') {
          actionsHtml += \`<button class="btn btn-sm btn-success" onclick="adminChangeOrderStatus('\${o.id}', 'DELIVERED')">🛵 Teslim Edildi Yap</button>\`;
        }
        if (o.status !== 'REFUNDED') {
          actionsHtml += \`<button class="btn btn-sm btn-danger" onclick="adminChangeOrderStatus('\${o.id}', 'REFUNDED')">💸 İadeyi Onayla / İade Et</button>\`;
        }
      }

      return \`
        <div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">
            <div>
              <span style="font-size:16px;font-weight:900;">#\${escapeHtml(o.orderNumber)}</span>
              <span style="font-size:12.5px;color:var(--text-muted);margin-left:8px;">\${escapeHtml(o.createdAt)}</span>
              <div style="font-size:12.5px;color:var(--text-muted);">👤 \${escapeHtml(o.customerNameSnapshot)} (\${escapeHtml(o.customerEmailSnapshot)}) • 📍 \${escapeHtml(o.deliveryAddress)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="status-badge status-\${o.status}">\${escapeHtml(o.statusLabel)}</span>
              <span style="font-size:18px;font-weight:900;color:var(--primary);">\${o.totalAmountFormatted}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Ürün (Snapshot)</th><th>Adet</th><th>Birim Fiyat</th><th>Toplam</th></tr>
            </thead>
            <tbody>\${itemsHtml}</tbody>
          </table>
          \${o.status === 'REFUNDED' || o.status === 'REFUND_REQUESTED' ? \`
            <div style="margin-top:10px;background:#fef2f2;border:1px solid #fecaca;padding:10px 12px;border-radius:8px;font-size:13px;color:#991b1b;">
              <strong>İade Bilgisi:</strong> Durum: \${escapeHtml(o.statusLabel)} | İade Tutarı: <strong>\${o.refund ? o.refund.amountFormatted : o.totalAmountFormatted}</strong> | Neden: \${escapeHtml(o.refundReason || '-')}
              \${o.refund ? \` | Stok Geri Yüklendi: \${o.refund.stockRestored ? 'Evet' : 'Hayır'}\` : ''}
            </div>
          \` : ''}
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;">
            \${actionsHtml}
          </div>
        </div>
      \`;
    }

    async function triggerRefund(orderId, mode) {
      const defaultReason = mode === 'REQUEST' ? 'Teslimat saatinde evde olamayacağım için iade talep ediyorum.' : 'Müşteri talebiyle sipariş iptali ve ücret iadesi.';
      const reason = prompt('Lütfen iade nedeninizi belirtiniz:', defaultReason);
      if (reason === null) return;
      try {
        const res = await api(\`/api/orders/\${orderId}/refund\`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason || defaultReason, mode })
        });
        showToast(\`Sipariş (#\${res.order.orderNumber}) için iade işlemi tamamlandı ve e-posta bildirimi gönderildi!\`, 'success');
        await loadMyOrders();
        await fetchProducts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function loadEmailsView() {
      const wrap = document.getElementById('emails-list-container');
      if (!state.user) {
        wrap.innerHTML = '<div style="padding:24px;text-align:center;">Gönderilen e-postaları incelemek için lütfen giriş yapın.</div>';
        return;
      }
      try {
        const data = await api('/api/emails');
        state.emails = data.emails;
        renderEmailsTable(wrap, state.emails);
      } catch (err) {
        wrap.innerHTML = \`<div style="color:var(--danger);">\${escapeHtml(err.message)}</div>\`;
      }
    }

    function renderEmailsTable(container, emails) {
      if (!emails || emails.length === 0) {
        container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Henüz gönderilmiş bir e-posta kaydı yok.</div>';
        return;
      }
      container.innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>Zaman</th>
              <th>Olay Tipi</th>
              <th>Alıcı</th>
              <th>Konu (Subject)</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            \${emails.map(e => \`
              <tr>
                <td style="font-size:12px;">\${escapeHtml(e.sentAt || e.createdAt)}</td>
                <td><span class="status-badge \${e.eventType === 'ORDER_PURCHASED' ? 'status-PAID' : 'status-REFUNDED'}">\${escapeHtml(e.eventType)}</span></td>
                <td><strong>\${escapeHtml(e.recipientEmail)}</strong> <span style="font-size:11px;color:var(--text-muted);">(\${e.recipientRole})</span></td>
                <td>\${escapeHtml(e.subject)}</td>
                <td><span class="status-badge status-DELIVERED">\${escapeHtml(e.status)}</span></td>
                <td><button class="btn btn-sm btn-outline" onclick="previewEmail('\${e.id}')">👁️ HTML E-Postayı Aç</button></td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function previewEmail(emailId) {
      const e = state.emails.find(x => x.id === emailId);
      if (!e) return;
      document.getElementById('email-preview-title').textContent = e.subject;
      document.getElementById('email-preview-meta').innerHTML = \`
        <div><strong>Alıcı:</strong> \${escapeHtml(e.recipientEmail)} (\${e.recipientRole}) | <strong>Durum:</strong> \${escapeHtml(e.status)}</div>
        <div><strong>Message-ID:</strong> \${escapeHtml(e.messageId || '-')} | <strong>Gönderim Zamanı:</strong> \${escapeHtml(e.sentAt || e.createdAt)}</div>
      \`;
      const frame = document.getElementById('email-preview-frame');
      frame.srcdoc = e.htmlBody;
      document.getElementById('modal-email-preview').classList.add('open');
    }

    /* ADMIN FUNCTIONS */
    async function loadAdminAll() {
      if (!state.user || state.user.role !== 'ADMIN') {
        showToast('Yönetici paneline erişmek için Yönetici hesabı ile giriş yapmalısınız.', 'error');
        return;
      }
      const [statsRes, prdRes, ordRes, emlRes, audRes] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/products'),
        api('/api/admin/orders'),
        api('/api/emails'),
        api('/api/admin/audit-logs')
      ]);

      state.adminProducts = prdRes.products;
      state.adminOrders = ordRes.orders;
      state.emails = emlRes.emails;
      state.auditLogs = audRes.logs;

      const s = statsRes.stats;
      document.getElementById('admin-stats-grid').innerHTML = \`
        <div class="stat-card"><div class="stat-label">Toplam Net Ciro</div><div class="stat-value" style="color:var(--accent);">\${s.netRevenueFormatted}</div></div>
        <div class="stat-card"><div class="stat-label">Toplam Sipariş</div><div class="stat-value">\${s.totalOrders}</div></div>
        <div class="stat-card"><div class="stat-label">İade Edilen Sipariş / Tutar</div><div class="stat-value" style="color:var(--danger);">\${s.refundedOrdersCount} (\${s.refundedAmountFormatted})</div></div>
        <div class="stat-card"><div class="stat-label">Aktif Ürün / Kritik Stok</div><div class="stat-value">\${s.activeProductsCount} / <span style="color:var(--primary);">\${s.lowStockCount}</span></div></div>
        <div class="stat-card"><div class="stat-label">Gönderilen E-Postalar</div><div class="stat-value">\${s.sentEmailsCount}</div></div>
      \`;

      renderAdminProducts();
      renderAdminOrders();
      renderEmailsTable(document.getElementById('admin-sub-outbox'), state.emails);
      renderAdminAuditLogs();
    }

    function switchAdminSubTab(tab) {
      ['products', 'orders', 'outbox', 'audit'].forEach(t => {
        document.getElementById('admin-sub-' + t).style.display = t === tab ? 'block' : 'none';
        document.getElementById('adm-tab-' + t).classList.toggle('active', t === tab);
      });
    }

    function renderAdminProducts() {
      const wrap = document.getElementById('admin-sub-products');
      wrap.innerHTML = \`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="font-size:17px;font-weight:800;">Menüdeki Tüm Ürünler (Aktif & Arşivlenmiş)</h3>
          <button class="btn btn-sm btn-primary" onclick="openProductModal()">➕ Yeni Ürün Ekle</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ürün Adı</th>
              <th>Kategori</th>
              <th>Porsiyon</th>
              <th>Fiyat</th>
              <th>Günlük Stok</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            \${state.adminProducts.map(p => \`
              <tr style="\${p.isArchived ? 'opacity:0.55;background:#f5f5f4;' : ''}">
                <td><strong>\${escapeHtml(p.name)}</strong></td>
                <td>\${escapeHtml(p.category)}</td>
                <td style="font-size:12px;">\${escapeHtml(p.portionInfo)}</td>
                <td style="font-weight:800;color:var(--primary);">\${p.priceFormatted}</td>
                <td><strong>\${p.dailyStock}</strong> Porsiyon</td>
                <td>
                  <span class="status-badge \${p.isArchived ? 'status-REFUNDED' : 'status-DELIVERED'}">
                    \${p.isArchived ? 'Arşivlendi (Pasif)' : 'Satışta (Aktif)'}
                  </span>
                </td>
                <td style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-sm btn-outline" onclick="openProductModal('\${p.id}')">✏️ Düzenle</button>
                  <button class="btn btn-sm btn-outline" onclick="quickAddStock('\${p.id}', \${p.dailyStock + 10})">+10 Stok</button>
                  \${p.isArchived
                    ? \`<button class="btn btn-sm btn-success" onclick="toggleArchiveProduct('\${p.id}', false)">♻️ Geri Yükle</button>\`
                    : \`<button class="btn btn-sm btn-danger" onclick="archiveProduct('\${p.id}')">🗑️ Sil / Arşivle</button>\`
                  }
                </td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function handleImageFileSelect(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        document.getElementById('prd-image').value = reader.result;
        showToast('Görsel seçildi ve forma eklendi.', 'success');
      };
      reader.readAsDataURL(file);
    }

    function openProductModal(productId = null) {
      const p = productId ? state.adminProducts.find(x => x.id === productId) : null;
      document.getElementById('admin-product-modal-title').textContent = p ? ('Ürünü Düzenle: ' + p.name) : 'Yeni Ev Yemeği / Ürün Ekle';
      document.getElementById('prd-id').value = p ? p.id : '';
      document.getElementById('prd-name').value = p ? p.name : '';
      document.getElementById('prd-category').value = p ? p.category : 'Kurutmalıklar & Doğal Meyveler';
      document.getElementById('prd-price-tl').value = p ? (p.priceKurus / 100).toFixed(2).replace('.', ',') : '';
      document.getElementById('prd-stock').value = p ? p.dailyStock : 25;
      document.getElementById('prd-prep').value = p ? p.prepTimeMinutes : 15;
      document.getElementById('prd-portion').value = p ? p.portionInfo : '1 Paket (500g Net)';
      document.getElementById('prd-allergens').value = p ? (p.allergens || []).join(', ') : '';
      document.getElementById('prd-image').value = p ? p.imageUrl : '';
      const fileInput = document.getElementById('prd-image-file');
      if (fileInput) fileInput.value = '';
      document.getElementById('prd-desc').value = p ? p.description : '';
      document.getElementById('prd-featured').checked = p ? p.isFeatured : false;
      document.getElementById('modal-admin-product').classList.add('open');
    }

    async function submitAdminProductForm(e) {
      e.preventDefault();
      const id = document.getElementById('prd-id').value;
      const payload = {
        name: document.getElementById('prd-name').value,
        category: document.getElementById('prd-category').value,
        priceTl: document.getElementById('prd-price-tl').value,
        dailyStock: Number(document.getElementById('prd-stock').value),
        prepTimeMinutes: Number(document.getElementById('prd-prep').value),
        portionInfo: document.getElementById('prd-portion').value,
        allergens: document.getElementById('prd-allergens').value,
        imageUrl: document.getElementById('prd-image').value || undefined,
        description: document.getElementById('prd-desc').value,
        isFeatured: document.getElementById('prd-featured').checked
      };

      try {
        if (id) {
          await api(\`/api/admin/products/\${id}\`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Ürün başarıyla güncellendi ve denetim izine (audit log) kaydedildi.', 'success');
        } else {
          await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Yeni ürün başarıyla menüye eklendi!', 'success');
        }
        closeModal('modal-admin-product');
        await loadAdminAll();
        await fetchProducts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function quickAddStock(id, newStock) {
      try {
        await api(\`/api/admin/products/\${id}\`, {
          method: 'PUT',
          body: JSON.stringify({ dailyStock: newStock })
        });
        showToast('Günlük porsiyon stoğu güncellendi.', 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function archiveProduct(id) {
      try {
        await api(\`/api/admin/products/\${id}\`, { method: 'DELETE' });
        showToast('Ürün vitrinden kaldırıldı (Geçmiş sipariş snapshot verileri korundu).', 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function toggleArchiveProduct(id, isArchived) {
      try {
        await api(\`/api/admin/products/\${id}\`, {
          method: 'PUT',
          body: JSON.stringify({ isArchived, dailyStock: isArchived ? 0 : 15 })
        });
        showToast('Ürün durumu güncellendi.', 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function renderAdminOrders() {
      const wrap = document.getElementById('admin-sub-orders');
      if (state.adminOrders.length === 0) {
        wrap.innerHTML = '<div style="padding:20px;text-align:center;">Henüz sipariş bulunmuyor.</div>';
        return;
      }
      wrap.innerHTML = state.adminOrders.map(o => renderOrderCardHtml(o, true)).join('');
    }

    async function adminChangeOrderStatus(orderId, status) {
      try {
        await api(\`/api/admin/orders/\${orderId}/status\`, {
          method: 'POST',
          body: JSON.stringify({ status, reason: 'Yönetici paneli üzerinden işlem yapıldı.' })
        });
        showToast('Sipariş durumu güncellendi: ' + status, 'success');
        await loadAdminAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function renderAdminAuditLogs() {
      const wrap = document.getElementById('admin-sub-audit');
      if (!state.auditLogs || state.auditLogs.length === 0) {
        wrap.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Henüz denetim kaydı yok.</div>';
        return;
      }
      wrap.innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Kullanıcı</th>
              <th>İşlem (Action)</th>
              <th>Varlık</th>
              <th>Değişiklik Özeti</th>
            </tr>
          </thead>
          <tbody>
            \${state.auditLogs.map(l => \`
              <tr>
                <td style="font-size:12px;">\${escapeHtml(l.createdAt)}</td>
                <td><strong>\${escapeHtml(l.actorEmail)}</strong> (\${escapeHtml(l.actorRole)})</td>
                <td><span class="status-badge status-PAID">\${escapeHtml(l.action)}</span></td>
                <td>\${escapeHtml(l.entityType)} (\${escapeHtml(l.entityId)})</td>
                <td style="font-size:11.5px;max-width:420px;overflow:hidden;text-overflow:ellipsis;">
                  <code>\${escapeHtml(JSON.stringify(l.newData))}</code>
                </td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    initApp();
  </script>
</body>
</html>`;
}

// --- src/app.ts ---
function jsonResponse(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders ?? {}
    }
  });
}
async function parseJsonBody(req) {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError("İstek gövdesi geçerli bir JSON nesnesi olmalıdır.");
    }
    return parsed;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError("Geçersiz JSON formatı.");
  }
}
function createApp(db, options) {
  const syncEnabled = options?.enableSupabaseSync ?? false;
  async function handleCoreRequest(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();
    try {
      if (syncEnabled && path.startsWith("/api/")) {
        await pullFromSupabaseIfNeeded(db, method !== "GET");
      }
      // 1. Ana Sayfa & Arayüz
      if (method === "GET" && (path === "/" || path === "/index.html")) {
        return new Response(renderIndexHtml(), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        });
      }
      if (method === "GET" && path === "/default-food.svg") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><rect width="600" height="400" fill="#9a3412"/><text x="300" y="220" font-size="96" text-anchor="middle">🍲</text></svg>`;
        return new Response(svg, {
          status: 200,
          headers: {
            "content-type": "image/svg+xml; charset=utf-8"
          }
        });
      }
      // 1.b Yüklenen Ürün Görsellerini Sunma (/uploads/*)
      const uploadMatch = path.match(/^\/uploads\/([a-zA-Z0-9._-]+)$/);
      if (method === "GET" && uploadMatch) {
        const filename = uploadMatch[1];
        try {
          const fileBytes = await readFile(`./public/uploads/${filename}`);
          const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
          const mimeMap = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
            svg: "image/svg+xml"
          };
          return new Response(new Uint8Array(fileBytes), {
            status: 200,
            headers: {
              "content-type": mimeMap[ext] ?? "application/octet-stream",
              "cache-control": "public, max-age=86400"
            }
          });
        } catch  {
          return jsonResponse({
            error: "Görsel bulunamadı."
          }, 404);
        }
      }
      // 2. Kimlik Doğrulama (Auth) Uç Noktaları
      if (method === "POST" && path === "/api/auth/register") {
        const body = await parseJsonBody(req);
        const input = validateRegisterInput(body);
        const { user, sessionToken, setCookieHeader } = registerUser(db, input);
        return jsonResponse({
          user,
          sessionToken
        }, 201, {
          "set-cookie": setCookieHeader
        });
      }
      if (method === "POST" && path === "/api/auth/login") {
        const body = await parseJsonBody(req);
        const input = validateLoginInput(body);
        const { user, sessionToken, setCookieHeader } = loginUser(db, input);
        return jsonResponse({
          user,
          sessionToken
        }, 200, {
          "set-cookie": setCookieHeader
        });
      }
      if (method === "POST" && path === "/api/auth/logout") {
        const clearCookie = logoutSession(db, req);
        return jsonResponse({
          ok: true
        }, 200, {
          "set-cookie": clearCookie
        });
      }
      if (method === "GET" && path === "/api/auth/me") {
        const user = getAuthenticatedUser(db, req);
        if (!user) {
          return jsonResponse({
            user: null
          }, 401);
        }
        return jsonResponse({
          user
        }, 200);
      }
      if (method === "PUT" && path === "/api/auth/profile") {
        const user = requireAuth(db, req);
        const body = await parseJsonBody(req);
        const updatedUser = updateUserProfile(db, user, body);
        return jsonResponse({
          user: updatedUser
        }, 200);
      }
      // 3. Vitrin Ürün Uç Noktaları
      if (method === "GET" && path === "/api/products") {
        const category = url.searchParams.get("category") ?? undefined;
        const search = url.searchParams.get("search") ?? undefined;
        const products = listProducts(db, {
          includeArchived: false,
          category,
          search
        });
        return jsonResponse({
          products
        }, 200);
      }
      const productDetailMatch = path.match(/^\/api\/products\/([^/]+)$/);
      if (method === "GET" && productDetailMatch) {
        const product = getProductById(db, decodeURIComponent(productDetailMatch[1]));
        if (!product || product.isArchived) {
          return jsonResponse({
            error: "Ürün bulunamadı."
          }, 404);
        }
        return jsonResponse({
          product
        }, 200);
      }
      // 4. Sunucu Tarafı Sepet Doğrulama & Sipariş Uç Noktaları
      if (method === "POST" && path === "/api/cart/quote") {
        const body = await parseJsonBody(req);
        const input = validateCheckoutInput(body);
        const quote = calculateServerCartQuote(db, input.items);
        return jsonResponse({
          quote
        }, 200);
      }
      if (method === "POST" && path === "/api/orders") {
        const user = requireAuth(db, req);
        const body = await parseJsonBody(req);
        const input = validateCheckoutInput(body);
        const order = createOrderAtomic(db, user, input);
        return jsonResponse({
          order
        }, 201);
      }
      if (method === "GET" && path === "/api/orders/my") {
        const user = requireAuth(db, req);
        const orders = listOrdersForUser(db, user.id);
        return jsonResponse({
          orders
        }, 200);
      }
      const orderDetailMatch = path.match(/^\/api\/orders\/([^/]+)$/);
      if (method === "GET" && orderDetailMatch) {
        const user = requireAuth(db, req);
        const order = getOrderById(db, decodeURIComponent(orderDetailMatch[1]));
        if (!order) {
          return jsonResponse({
            error: "Sipariş bulunamadı."
          }, 404);
        }
        if (user.role !== "ADMIN" && order.userId !== user.id) {
          return jsonResponse({
            error: "Bu siparişi görüntüleme yetkiniz yok."
          }, 403);
        }
        return jsonResponse({
          order
        }, 200);
      }
      const orderRefundMatch = path.match(/^\/api\/orders\/([^/]+)\/refund$/);
      if (method === "POST" && orderRefundMatch) {
        const user = requireAuth(db, req);
        const orderId = decodeURIComponent(orderRefundMatch[1]);
        const body = await parseJsonBody(req);
        const input = validateRefundInput(body);
        const order = refundOrderAtomic(db, user, orderId, input);
        return jsonResponse({
          order
        }, 200);
      }
      // 5. E-Posta Kuyruğu (Transactional Outbox) Görüntüleme
      if (method === "GET" && path === "/api/emails") {
        const user = requireAuth(db, req);
        processEmailOutbox(db);
        const orderId = url.searchParams.get("orderId") ?? undefined;
        const eventType = url.searchParams.get("eventType") ?? undefined;
        if (user.role === "ADMIN") {
          const emails = listOutboxEmails(db, {
            orderId,
            eventType,
            limit: 200
          });
          return jsonResponse({
            emails
          }, 200);
        } else {
          const emails = listOutboxEmails(db, {
            recipientEmail: user.email,
            orderId,
            eventType,
            limit: 100
          });
          return jsonResponse({
            emails
          }, 200);
        }
      }
      // 6. YÖNETİCİ PANELİ (ADMIN) UÇ NOKTALARI — KATI RBAC KORUMALI
      if (path.startsWith("/api/admin/")) {
        const admin = requireAdmin(db, req);
        if (method === "GET" && path === "/api/admin/stats") {
          const stats = getAdminDashboardStats(db);
          return jsonResponse({
            stats
          }, 200);
        }
        if (method === "GET" && path === "/api/admin/products") {
          const products = listProducts(db, {
            includeArchived: true
          });
          return jsonResponse({
            products
          }, 200);
        }
        if (method === "POST" && path === "/api/admin/products") {
          const body = await parseJsonBody(req);
          const input = validateProductCreateInput(body);
          const product = createProduct(db, admin, input);
          return jsonResponse({
            product
          }, 201);
        }
        const adminProductMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
        if (adminProductMatch) {
          const productId = decodeURIComponent(adminProductMatch[1]);
          if (method === "PUT" || method === "PATCH") {
            const body = await parseJsonBody(req);
            const input = validateProductUpdateInput(body);
            const product = updateProduct(db, admin, productId, input);
            return jsonResponse({
              product
            }, 200);
          }
          if (method === "DELETE") {
            const hard = url.searchParams.get("hard") === "true";
            const result = deleteOrArchiveProduct(db, admin, productId, hard);
            if (syncEnabled && hard) {
              await deleteRowInSupabase("products", "id", productId);
            }
            return jsonResponse(result, 200);
          }
        }
        if (method === "GET" && path === "/api/admin/orders") {
          const status = url.searchParams.get("status") ?? undefined;
          const search = url.searchParams.get("search") ?? undefined;
          const orders = listAllOrdersForAdmin(db, {
            status,
            search
          });
          return jsonResponse({
            orders
          }, 200);
        }
        const adminOrderStatusMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
        if (method === "POST" && adminOrderStatusMatch) {
          const orderId = decodeURIComponent(adminOrderStatusMatch[1]);
          const body = await parseJsonBody(req);
          const targetStatus = validateOrderStatus(body.status);
          const reason = typeof body.reason === "string" ? body.reason : undefined;
          const order = updateOrderStatusByAdmin(db, admin, orderId, targetStatus, reason);
          return jsonResponse({
            order
          }, 200);
        }
        const adminOrderRefundMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/refund$/);
        if (method === "POST" && adminOrderRefundMatch) {
          const orderId = decodeURIComponent(adminOrderRefundMatch[1]);
          const body = await parseJsonBody(req);
          const input = validateRefundInput(body);
          const order = refundOrderAtomic(db, admin, orderId, input);
          return jsonResponse({
            order
          }, 200);
        }
        if (method === "GET" && path === "/api/admin/audit-logs") {
          const logs = listAuditLogs(db, 150);
          return jsonResponse({
            logs
          }, 200);
        }
      }
      return jsonResponse({
        error: `Uç nokta bulunamadı: ${method} ${path}`
      }, 404);
    } catch (err) {
      if (err instanceof ValidationError) {
        return jsonResponse({
          error: err.message,
          field: err.field
        }, 400);
      }
      if (err instanceof AuthError) {
        return jsonResponse({
          error: err.message
        }, err.statusCode);
      }
      if (err instanceof StockConflictError) {
        return jsonResponse({
          error: err.message,
          code: err.code
        }, err.statusCode);
      }
      if (err instanceof OrderFsmError) {
        return jsonResponse({
          error: err.message,
          code: err.code
        }, err.statusCode);
      }
      console.error("Unhandled API Error:", err);
      return jsonResponse({
        error: err instanceof Error ? err.message : "Beklenmeyen sunucu hatası."
      }, 500);
    }
  }
  async function handleRequest(req) {
    const res = await handleCoreRequest(req);
    const method = req.method.toUpperCase();
    const url = new URL(req.url);
    if (syncEnabled && url.pathname.startsWith("/api/") && method !== "GET" && method !== "HEAD" && res.status >= 200 && res.status < 300) {
      await pushAllToSupabase(db);
    }
    return res;
  }
  return {
    fetch: handleRequest
  };
}

// --- src/vercelEntry.ts ---
const db = getDatabase();
const app = createApp(db, {
  enableSupabaseSync: true
});
export default async function handler(req, res) {
  try {
    const proto = req.headers?.["x-forwarded-proto"] || "https";
    const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "localhost:3000";
    const fullUrl = new URL(req.url || "/", `${proto}://${host}`);
    const headers = new Headers();
    if (req.headers) {
      for (const [k, v] of Object.entries(req.headers)){
        if (Array.isArray(v)) {
          headers.set(k, v.join(", "));
        } else if (typeof v === "string") {
          headers.set(k, v);
        }
      }
    }
    const method = (req.method || "GET").toUpperCase();
    let bodyBytes = undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === "string") {
          bodyBytes = new TextEncoder().encode(req.body);
        } else if (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array) {
          bodyBytes = new Uint8Array(req.body);
        } else if (typeof req.body === "object") {
          bodyBytes = new TextEncoder().encode(JSON.stringify(req.body));
        }
      } else {
        const chunks = [];
        for await (const chunk of req){
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (chunks.length > 0) {
          bodyBytes = new Uint8Array(Buffer.concat(chunks));
        }
      }
    }
    const webReq = new Request(fullUrl.toString(), {
      method,
      headers,
      body: bodyBytes ? bodyBytes : undefined
    });
    const webRes = await app.fetch(webReq);
    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key)=>{
      res.setHeader(key, val);
    });
    const respArrayBuffer = await webRes.arrayBuffer();
    res.end(Buffer.from(respArrayBuffer));
  } catch (err) {
    console.error("Vercel Handler Error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      error: err instanceof Error ? err.message : "Sunucu hatası"
    }));
  }
}
