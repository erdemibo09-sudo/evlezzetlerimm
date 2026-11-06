import { DatabaseSync } from "node:sqlite";
import { Buffer } from "node:buffer";
import { generateId, hashPassword } from "../services/cryptoUtils.ts";

let defaultDbInstance: DatabaseSync | null = null;

/**
 * Özel yemek illüstrasyonu SVG Data-URI üreticisi (Yedek görsel için)
 */
function createFoodSvgDataUri(title: string, emoji: string, bgStart: string, bgEnd: string): string {
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
 */
function loadUploadedPhotoDataUri(filename: string, fallbackTitle: string): string {
  try {
    const fileUrl = new URL(`../../public/uploads/${filename}`, import.meta.url);
    const bytes = Deno.readFileSync(fileUrl);
    const b64 = Buffer.from(bytes).toString("base64");
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    try {
      const bytes = Deno.readFileSync(`./public/uploads/${filename}`);
      const b64 = Buffer.from(bytes).toString("base64");
      return `data:image/jpeg;base64,${b64}`;
    } catch {
      return createFoodSvgDataUri(fallbackTitle, "🍲", "#9a3412", "#431407");
    }
  }
}

export function initSchema(db: DatabaseSync): void {
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

export function seedDatabase(db: DatabaseSync): void {
  // Eski varsayılan demo ürünleri varsa temizle
  const legacyProduct = db
    .prepare("SELECT id FROM products WHERE id = 'prd_kayseri_manti'")
    .get() as { id: string } | undefined;
  if (legacyProduct) {
    db.exec("DELETE FROM products WHERE id IN ('prd_kayseri_manti','prd_yaprak_sarma','prd_hunkar_begendi','prd_su_boregi','prd_mercimek_corbasi','prd_firin_sutlac','prd_ev_acuka','prd_icli_kofte')");
  }

  // Mevcut ürünlerde /uploads/ yolu varsa doğrudan gömülü Base64 Data-URI'ye yükselt (kesintisiz görüntüleme için)
  const uploadPathRows = db
    .prepare("SELECT id, name, image_url FROM products WHERE image_url LIKE '/uploads/%'")
    .all() as Array<{ id: string; name: string; image_url: string }>;
  if (uploadPathRows.length > 0) {
    const updateImgStmt = db.prepare("UPDATE products SET image_url = ? WHERE id = ?");
    for (const r of uploadPathRows) {
      const fname = r.image_url.replace("/uploads/", "");
      const dataUri = loadUploadedPhotoDataUri(fname, r.name);
      updateImgStmt.run(dataUri, r.id);
    }
  }

  const existingUsers = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
  const existingProducts = db.prepare("SELECT COUNT(*) as cnt FROM products").get() as { cnt: number };
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

    insertUser.run(
      adminId,
      "admin@evyemeklerim.com",
      "Mutfak Şefi & Yönetici (Elif Hanım)",
      "0532 100 20 30",
      "Ev Yemeklerim Merkez Mutfak, Kadıköy / İstanbul",
      hashPassword("Admin123!"),
      "ADMIN",
      now,
    );

    insertUser.run(
      customerId,
      "ayse@ornek.com",
      "Ayşe Yılmaz",
      "0544 222 33 44",
      "Moda Caddesi No: 42 Daire: 5, Kadıköy / İstanbul",
      hashPassword("Musteri123!"),
      "CUSTOMER",
      now,
    );
  }

  // 2. Kullanıcının Yüklediği 5 Gerçek Ev Yapımı & Doğal Ürün Kataloğu
  const initialProducts = [
    {
      id: "prd_kuru_incir",
      slug: "dogal-aydin-dag-inciri-kuru-incir",
      name: "Doğal Aydın Dağ İnciri (Dalında Kurutulmuş)",
      description:
        "Aydın dağlarının yüksek rakımlı bahçelerinde ilaçsız ve hidrojen peroksitsiz olarak dalında kurutulmuş, ince kabuklu ve içi bol ballı 1. sınıf doğal kuru incir. Üzerindeki beyazlık tamamen kendi doğal meyve şekerinin kristalleşmesidir.",
      category: "Kurutmalıklar & Doğal Meyveler",
      imageUrl: loadUploadedPhotoDataUri("kuru-incir.jpg", "Doğal Aydın Dağ İnciri"),
      portionInfo: "1 Paket (500g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 35,
      priceKurus: 26000, // 260,00 ₺
      isFeatured: 1,
    },
    {
      id: "prd_sele_zeytin",
      slug: "ev-yapimi-dogal-sele-siyah-zeytin",
      name: "Ev Yapımı Doğal Sele Siyah Zeytin",
      description:
        "Kasım-Aralık hasadı olgunlaşmış ince kabuklu zeytinlerin kostik veya boya kullanılmadan sadece kaya tuzu ile kendi suyunda aylarca çevrilerek tatlandırıldığı, etli ve küçük çekirdekli hakiki ev yapımı sele zeytin.",
      category: "Kahvaltılık & Zeytin",
      imageUrl: loadUploadedPhotoDataUri("sele-siyah-zeytin.jpg", "Ev Yapımı Sele Siyah Zeytin"),
      portionInfo: "1 Kavanoz / Paket (500g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 40,
      priceKurus: 21000, // 210,00 ₺
      isFeatured: 1,
    },
    {
      id: "prd_cennet_hurmasi",
      slug: "guneste-kurutulmus-cennet-hurmasi-kurusu",
      name: "Güneşte Kurutulmuş Cennet Hurması (Trabzon Hurması)",
      description:
        "Tam mevsiminde toplanan cennet hurmalarının kabukları soyularak iplere dizilip dağ esintisinde ve güneşte doğal olarak kurutulmasıyla hazırlanmıştır. Dışı kendi doğal pudrası ile kaplı, içi lokum gibi yumuşaktır.",
      category: "Kurutmalıklar & Doğal Meyveler",
      imageUrl: loadUploadedPhotoDataUri("cennet-hurmasi-kurusu.jpg", "Cennet Hurması Kurusu"),
      portionInfo: "1 Paket (500g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 30,
      priceKurus: 28000, // 280,00 ₺
      isFeatured: 1,
    },
    {
      id: "prd_incir_receli",
      slug: "ev-yapimi-citir-incir-receli-kavanoz",
      name: "Ev Yapımı Çıtır İncir Reçeli (Cam Kavanoz)",
      description:
        "Ege'nin seçme incirleriyle glikoz şurubu veya koruyucu kullanılmadan, geleneksel bakır tencerede ağır ateşte kıvamlandırılmış, çıtır çekirdekli ve yoğun aromalı ev yapımı incir reçeli.",
      category: "Ev Yapımı Reçeller",
      imageUrl: loadUploadedPhotoDataUri("incir-receli.jpg", "Ev Yapımı Çıtır İncir Reçeli"),
      portionInfo: "1 Cam Kavanoz (650g Net)",
      allergens: [],
      prepTimeMinutes: 10,
      dailyStock: 25,
      priceKurus: 19500, // 195,00 ₺
      isFeatured: 1,
    },
    {
      id: "prd_icli_kofte",
      slug: "el-yapimi-kizarmis-icli-kofte-kiymali-cevizli",
      name: "El Yapımı Kızarmış İçli Köfte (Kıymalı & Cevizli)",
      description:
        "İncecik açılmış çıtır bulgur dış kabuğu, içinde özel baharatlarla kavrulmuş %100 dana kıyması ve bol yerli ceviz içi ile tek tek elde kapatılıp nar gibi kızartılmış ev yapımı içli köfte.",
      category: "İçli Köfte & Ev Yemekleri",
      imageUrl: loadUploadedPhotoDataUri("icli-kofte.jpg", "El Yapımı Kızarmış İçli Köfte"),
      portionInfo: "1 Porsiyon (5 Adet / ~400g)",
      allergens: ["Gluten", "Ceviz", "Yumurta"],
      prepTimeMinutes: 25,
      dailyStock: 20,
      priceKurus: 24500, // 245,00 ₺
      isFeatured: 1,
    },
  ];

  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, slug, name, description, category, image_url, portion_info,
      allergens_json, prep_time_minutes, daily_stock, price_kurus,
      is_featured, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  for (const p of initialProducts) {
    insertProduct.run(
      p.id,
      p.slug,
      p.name,
      p.description,
      p.category,
      p.imageUrl,
      p.portionInfo,
      JSON.stringify(p.allergens),
      p.prepTimeMinutes,
      p.dailyStock,
      p.priceKurus,
      p.isFeatured,
      now,
      now,
    );
  }
}

/**
 * ACID Transaction sarmalayıcısı (BEGIN IMMEDIATE ile yazma kilidini atomik olarak alır)
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Rollback zaten gerçekleşmiş olabilir
    }
    throw err;
  }
}

export function getDatabase(dbPath?: string): DatabaseSync {
  if (dbPath) {
    const customDb = new DatabaseSync(dbPath);
    initSchema(customDb);
    seedDatabase(customDb);
    return customDb;
  }
  if (!defaultDbInstance) {
    const path = Deno.env.get("DATABASE_PATH") ?? "./evyemeklerim.sqlite";
    defaultDbInstance = new DatabaseSync(path);
    initSchema(defaultDbInstance);
    seedDatabase(defaultDbInstance);
  }
  return defaultDbInstance;
}
