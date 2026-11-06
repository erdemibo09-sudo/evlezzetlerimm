import { createApp } from "../src/app.ts";
import { getDatabase } from "../src/db/database.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`DOĞRULAMA HATASI (Assertion Failed): ${message}`);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} | Beklenen: ${JSON.stringify(expected)}, Gerçekleşen: ${JSON.stringify(actual)}`,
    );
  }
}

async function callApi(
  app: { fetch: (req: Request) => Promise<Response> },
  method: string,
  path: string,
  options?: { body?: unknown; token?: string; cookie?: string },
): Promise<{ status: number; data: Record<string, any>; headers: Headers }> {
  const headers = new Headers({ "content-type": "application/json" });
  if (options?.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }
  if (options?.cookie) {
    headers.set("cookie", options.cookie);
  }

  const req = new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const res = await app.fetch(req);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

Deno.test("(a) Eşzamanlı Stok Aşımı (Race Condition / Overselling) Stres Testi", async () => {
  const db = getDatabase(":memory:");
  const app = createApp(db);

  // 1. Yönetici girişi yap ve stok adedi sadece 1 olan özel bir yemek oluştur
  const adminLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "admin@evyemeklerim.com", password: "Admin123!" },
  });
  assertEquals(adminLogin.status, 200, "Yönetici girişi başarılı olmalı");
  const adminToken = adminLogin.data.sessionToken as string;

  const createRes = await callApi(app, "POST", "/api/admin/products", {
    token: adminToken,
    body: {
      name: "Sınırlı Üretim Kuzu İncik (Son 1 Porsiyon)",
      description: "Fırında 5 saat ağır ateşte pişmiş kuzu incik.",
      category: "Ana Yemekler",
      portionInfo: "1 Porsiyon (450g)",
      allergens: ["Gluten"],
      prepTimeMinutes: 35,
      dailyStock: 1, // SADECE 1 ADET STOK!
      priceKurus: 42000, // 420,00 TL
      isFeatured: true,
    },
  });
  assertEquals(createRes.status, 201, "Ürün oluşturulmalı");
  const limitedProductId = createRes.data.product.id as string;

  // 2. Müşteri girişi
  const custLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "ayse@ornek.com", password: "Musteri123!" },
  });
  assertEquals(custLogin.status, 200, "Müşteri girişi başarılı olmalı");
  const custToken = custLogin.data.sessionToken as string;

  // 3. Aynı anda 5 paralel satın alma isteği gönder (Son 1 porsiyon için)
  const concurrentAttempts = Array.from({ length: 5 }, (_, idx) =>
    callApi(app, "POST", "/api/orders", {
      token: custToken,
      body: {
        items: [{ productId: limitedProductId, quantity: 1 }],
        deliveryAddress: `Eşzamanlı Test Adresi No: ${idx + 1}`,
      },
    })
  );

  const results = await Promise.all(concurrentAttempts);
  const succeeded = results.filter((r) => r.status === 201);
  const conflicted = results.filter((r) => r.status === 409);

  assertEquals(succeeded.length, 1, "5 eşzamanlı istekten tam olarak 1 tanesi başarılı (201) olmalı");
  assertEquals(conflicted.length, 4, "Diğer 4 eşzamanlı istek 409 Conflict (INSUFFICIENT_STOCK) almalı");

  // 4. Veritabanındaki stok değerinin asla negatife düşmediğini (tam 0 olduğunu) doğrula
  const productAfter = await callApi(app, "GET", `/api/products/${limitedProductId}`);
  assertEquals(productAfter.status, 200, "Ürün sorgulanabilmeli");
  assertEquals(
    productAfter.data.product.dailyStock,
    0,
    "Ürün stoğu tam olarak 0 olmalı, asla negatife düşmemeli",
  );
});

Deno.test("(b) Fiyat Değişimi ve Ürün Silinmesi Sonrası Geçmiş Sipariş Değişmezliği (Snapshot Immutability) ve İade Doğruluğu", async () => {
  const db = getDatabase(":memory:");
  const app = createApp(db);

  const adminLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "admin@evyemeklerim.com", password: "Admin123!" },
  });
  const adminToken = adminLogin.data.sessionToken as string;

  // 1. Yeni müşteri hesabı oluştur
  const custReg = await callApi(app, "POST", "/api/auth/register", {
    body: {
      fullName: "Burak Kaya",
      email: "burak@ornek.com",
      password: "Password123!",
      phone: "0533 999 88 77",
      address: "Beşiktaş / İstanbul",
    },
  });
  assertEquals(custReg.status, 201, "Yeni müşteri kaydı 201 dönmeli");
  const custToken = custReg.data.sessionToken as string;

  // 2. Yönetici 150,00 TL (15000 kuruş) fiyatlı bir ürün ekler
  const prdRes = await callApi(app, "POST", "/api/admin/products", {
    token: adminToken,
    body: {
      name: "Ev Yapımı Erişte (Cevizli & Keşli)",
      description: "Köy yumurtalı kesme erişte.",
      category: "Börek & Hamur İşi",
      portionInfo: "1 Porsiyon (320g)",
      allergens: ["Gluten", "Yumurta", "Ceviz", "Laktoz"],
      prepTimeMinutes: 20,
      dailyStock: 10,
      priceKurus: 15000, // 150,00 TL
    },
  });
  const productId = prdRes.data.product.id as string;

  // 3. Müşteri bu üründen 2 porsiyon satın alır (Toplam: 300,00 TL = 30000 kuruş)
  const orderRes = await callApi(app, "POST", "/api/orders", {
    token: custToken,
    body: {
      items: [{ productId, quantity: 2 }],
      deliveryAddress: "Beşiktaş Çarşı No: 12, İstanbul",
    },
  });
  assertEquals(orderRes.status, 201, "Sipariş oluşturulmalı");
  const orderId = orderRes.data.order.id as string;
  assertEquals(orderRes.data.order.totalAmountKurus, 30000, "Sipariş toplamı 30000 kuruş (300,00 TL) olmalı");

  // 4. Yönetici ürünün fiyatını 150,00 TL'den 350,00 TL'ye (35000 kuruş) çıkarır ve adını değiştirir
  const updateRes = await callApi(app, "PUT", `/api/admin/products/${productId}`, {
    token: adminToken,
    body: {
      name: "Zamlı Özel Erişte",
      priceKurus: 35000, // 350,00 TL
    },
  });
  assertEquals(updateRes.status, 200, "Ürün fiyatı güncellenmeli");
  assertEquals(updateRes.data.product.priceKurus, 35000, "Yeni fiyat 35000 kuruş olmalı");

  // 5. Yönetici ürünü vitrinden siler / arşivler (DELETE)
  const delRes = await callApi(app, "DELETE", `/api/admin/products/${productId}`, {
    token: adminToken,
  });
  assertEquals(delRes.status, 200, "Ürün arşivlenmeli/silinmeli");
  assertEquals(delRes.data.archived, true, "Ürün arşivlenmiş olmalı");

  // 6. Müşteri geçmiş siparişini iade eder
  const refundRes = await callApi(app, "POST", `/api/orders/${orderId}/refund`, {
    token: custToken,
    body: {
      reason: "Misafirlerim iptal oldu, iade rica ediyorum.",
      mode: "EXECUTE",
    },
  });
  assertEquals(refundRes.status, 200, "İade işlemi başarılı olmalı");

  const refundedOrder = refundRes.data.order;
  assertEquals(refundedOrder.status, "REFUNDED", "Sipariş durumu REFUNDED olmalı");
  assertEquals(
    refundedOrder.items[0].unitPriceKurusSnapshot,
    15000,
    "Sipariş kalemi dondurulmuş birim fiyatı hala 15000 kuruş (150,00 TL) olmalı",
  );
  assertEquals(
    refundedOrder.items[0].productNameSnapshot,
    "Ev Yapımı Erişte (Cevizli & Keşli)",
    "Sipariş kalemi dondurulmuş ürün adı bozulmamalı",
  );
  assertEquals(
    refundedOrder.refundedAmountKurus,
    30000,
    "İade edilen tutar yeni fiyattan (700 TL) değil, satın alma anındaki eski fiyattan (300,00 TL = 30000 kuruş) hesaplanmalı",
  );
  assertEquals(
    refundedOrder.refund.amountKurus,
    30000,
    "Refund tablosundaki tutar tam olarak 30000 kuruş olmalı",
  );

  // 7. Çift İade (Double-Refund) engelleme testi
  const secondRefundAttempt = await callApi(app, "POST", `/api/orders/${orderId}/refund`, {
    token: custToken,
    body: {
      reason: "İkinci kez iade denemesi",
      mode: "EXECUTE",
    },
  });
  assertEquals(
    secondRefundAttempt.status,
    409,
    "Zaten iade edilmiş bir siparişe ikinci kez iade isteği 409 Conflict ile reddedilmeli",
  );
  assertEquals(
    secondRefundAttempt.data.code,
    "DOUBLE_REFUND_PREVENTED",
    "Hata kodu DOUBLE_REFUND_PREVENTED olmalı",
  );
});

Deno.test("(c) Satın Alma ve İade E-Postalarının (Transactional Outbox) Doğru İçerikle Üretildiği Kanıtı", async () => {
  const db = getDatabase(":memory:");
  const app = createApp(db);

  const adminLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "admin@evyemeklerim.com", password: "Admin123!" },
  });
  const adminToken = adminLogin.data.sessionToken as string;

  const custLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "ayse@ornek.com", password: "Musteri123!" },
  });
  const custToken = custLogin.data.sessionToken as string;

  // 1. Müşteri Doğal Aydın Dağ İnciri (260,00 TL) satın alır
  const orderRes = await callApi(app, "POST", "/api/orders", {
    token: custToken,
    body: {
      items: [{ productId: "prd_kuru_incir", quantity: 2 }],
      deliveryAddress: "Moda Caddesi No: 42, Kadıköy",
      customerNote: "Hediye paketi olsun lütfen",
    },
  });
  assertEquals(orderRes.status, 201, "Sipariş oluşturulmalı");
  const order = orderRes.data.order;
  const orderId = order.id as string;
  const orderNumber = order.orderNumber as string;

  // 2. Satın alma sonrası e-posta kuyruğunu (Outbox) denetle
  const purchaseEmailsRes = await callApi(
    app,
    "GET",
    `/api/emails?orderId=${encodeURIComponent(orderId)}&eventType=ORDER_PURCHASED`,
    { token: adminToken },
  );
  assertEquals(purchaseEmailsRes.status, 200, "E-posta listesi alınabilmeli");
  const purchaseEmails = purchaseEmailsRes.data.emails as Array<Record<string, any>>;
  assertEquals(
    purchaseEmails.length,
    2,
    "Satın alma anında hem CUSTOMER hem ADMIN için toplam 2 e-posta üretilmeli",
  );

  const custPurchaseEmail = purchaseEmails.find((e) => e.recipientRole === "CUSTOMER")!;
  const adminPurchaseEmail = purchaseEmails.find((e) => e.recipientRole === "ADMIN")!;

  assert(custPurchaseEmail, "Müşteri satın alma e-postası mevcut olmalı");
  assert(adminPurchaseEmail, "Yönetici satın alma e-postası mevcut olmalı");
  assertEquals(custPurchaseEmail.status, "SENT", "Müşteri e-postası SENT durumunda olmalı");
  assertEquals(custPurchaseEmail.recipientEmail, "ayse@ornek.com", "Alıcı ayse@ornek.com olmalı");
  assert(
    custPurchaseEmail.htmlBody.includes(orderNumber) &&
      custPurchaseEmail.htmlBody.includes("Doğal Aydın Dağ İnciri") &&
      custPurchaseEmail.htmlBody.includes("520,00 ₺"),
    "Satın alma HTML e-postası sipariş numarasını, ürün adını ve toplam tutarı (520,00 ₺) içermeli",
  );

  // 3. Siparişi iade et ve iade e-postalarını doğrula
  const refundReason = "Adres değişikliği nedeniyle sipariş iptali";
  const refundRes = await callApi(app, "POST", `/api/orders/${orderId}/refund`, {
    token: custToken,
    body: { reason: refundReason, mode: "EXECUTE" },
  });
  assertEquals(refundRes.status, 200, "İade işlemi başarılı olmalı");

  const refundEmailsRes = await callApi(
    app,
    "GET",
    `/api/emails?orderId=${encodeURIComponent(orderId)}&eventType=ORDER_REFUNDED`,
    { token: adminToken },
  );
  const refundEmails = refundEmailsRes.data.emails as Array<Record<string, any>>;
  assertEquals(
    refundEmails.length,
    2,
    "İade anında hem CUSTOMER hem ADMIN için toplam 2 iade e-postası üretilmeli",
  );

  const custRefundEmail = refundEmails.find((e) => e.recipientRole === "CUSTOMER")!;
  assertEquals(custRefundEmail.status, "SENT", "İade e-postası SENT durumunda olmalı");
  assert(
    custRefundEmail.htmlBody.includes(orderNumber) &&
      custRefundEmail.htmlBody.includes("520,00 ₺") &&
      custRefundEmail.htmlBody.includes(refundReason),
    "İade HTML e-postası sipariş numarasını, iade edilen tutarı (520,00 ₺) ve iade nedenini içermeli",
  );
});

Deno.test("(d) Rol Tabanlı Yetkilendirme (RBAC) Sızdırmazlığı ve Denetim İzi (Audit Log) Kanıtı", async () => {
  const db = getDatabase(":memory:");
  const app = createApp(db);

  // 1. Oturum açmamış (Anonim) kullanıcının yönetici ve sipariş uç noktalarına erişimi engellenmeli (401)
  const anonAdminAttempt = await callApi(app, "POST", "/api/admin/products", {
    body: { name: "Kaçak Ürün" },
  });
  assertEquals(anonAdminAttempt.status, 401, "Anonim istek 401 Unauthorized almalı");

  const anonOrderAttempt = await callApi(app, "POST", "/api/orders", {
    body: { items: [{ productId: "prd_kuru_incir", quantity: 1 }] },
  });
  assertEquals(anonOrderAttempt.status, 401, "Anonim sipariş isteği 401 Unauthorized almalı");

  // 2. Standart Müşteri (CUSTOMER) hesabının Yönetici (ADMIN) uç noktalarına erişimi engellenmeli (403)
  const custLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "ayse@ornek.com", password: "Musteri123!" },
  });
  const custToken = custLogin.data.sessionToken as string;

  const custCreatePrd = await callApi(app, "POST", "/api/admin/products", {
    token: custToken,
    body: {
      name: "Yetkisiz Ürün",
      description: "Test",
      category: "Kurutmalıklar & Doğal Meyveler",
      portionInfo: "1 Paket",
      priceKurus: 10000,
      dailyStock: 10,
    },
  });
  assertEquals(custCreatePrd.status, 403, "Müşteri ürün eklemeye çalıştığında 403 Forbidden almalı");

  const custDeletePrd = await callApi(app, "DELETE", "/api/admin/products/prd_kuru_incir", {
    token: custToken,
  });
  assertEquals(custDeletePrd.status, 403, "Müşteri ürün silmeye çalıştığında 403 Forbidden almalı");

  const custAuditLogs = await callApi(app, "GET", "/api/admin/audit-logs", {
    token: custToken,
  });
  assertEquals(custAuditLogs.status, 403, "Müşteri denetim izine erişmeye çalıştığında 403 Forbidden almalı");

  // 3. Yöneticinin yaptığı işlemlerin audit_logs tablosuna kaydedildiğinin kanıtı
  const adminLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "admin@evyemeklerim.com", password: "Admin123!" },
  });
  const adminToken = adminLogin.data.sessionToken as string;

  await callApi(app, "PUT", "/api/admin/products/prd_kuru_incir", {
    token: adminToken,
    body: { priceKurus: 27500, dailyStock: 40 },
  });

  const auditRes = await callApi(app, "GET", "/api/admin/audit-logs", {
    token: adminToken,
  });
  assertEquals(auditRes.status, 200, "Yönetici audit logları okuyabilmeli");
  const logs = auditRes.data.logs as Array<Record<string, any>>;
  assert(logs.length >= 1, "En az 1 denetim izi (audit log) kaydı bulunmalı");
  const latestLog = logs[0];
  assertEquals(latestLog.action, "PRODUCT_UPDATED", "Son işlem PRODUCT_UPDATED olmalı");
  assertEquals(latestLog.oldData.priceKurus, 26000, "Audit log eski fiyatı (26000 kuruş) kaydetmeli");
  assertEquals(latestLog.newData.priceKurus, 27500, "Audit log yeni fiyatı (27500 kuruş) kaydetmeli");
});

Deno.test("(e) Deterministik Sipariş & İade Durum Makinesi (FSM) Geçişleri ve Stok Geri Yükleme Kanıtı", async () => {
  const db = getDatabase(":memory:");
  const app = createApp(db);

  const adminLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "admin@evyemeklerim.com", password: "Admin123!" },
  });
  const adminToken = adminLogin.data.sessionToken as string;

  const custLogin = await callApi(app, "POST", "/api/auth/login", {
    body: { email: "ayse@ornek.com", password: "Musteri123!" },
  });
  const custToken = custLogin.data.sessionToken as string;

  // Başlangıç stok kontrolü (prd_icli_kofte: 20 porsiyon)
  const beforePrd = await callApi(app, "GET", "/api/products/prd_icli_kofte");
  assertEquals(beforePrd.data.product.dailyStock, 20, "Başlangıç stoğu 20 olmalı");

  // 1. Müşteri 3 porsiyon El Yapımı Kızarmış İçli Köfte sipariş eder (Stok 20 -> 17)
  const orderRes = await callApi(app, "POST", "/api/orders", {
    token: custToken,
    body: {
      items: [{ productId: "prd_icli_kofte", quantity: 3 }],
      deliveryAddress: "Kadıköy / İstanbul",
    },
  });
  assertEquals(orderRes.status, 201, "Sipariş oluşturulmalı");
  const orderId = orderRes.data.order.id as string;

  const midPrd = await callApi(app, "GET", "/api/products/prd_icli_kofte");
  assertEquals(midPrd.data.product.dailyStock, 17, "Sipariş sonrası stok 17'ye düşmeli");

  // 2. Geçersiz FSM geçiş denemesi: PAID -> DELIVERED (PREPARING atlanarak doğrudan teslim edilemez)
  const invalidJump = await callApi(app, "POST", `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: "DELIVERED" },
  });
  assertEquals(invalidJump.status, 409, "PAID -> DELIVERED doğrudan geçişi FSM tarafından 409 ile engellenmeli");

  // 3. Geçerli FSM akışı: PAID -> PREPARING -> DELIVERED -> REFUND_REQUESTED -> REFUNDED
  const prepRes = await callApi(app, "POST", `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: "PREPARING" },
  });
  assertEquals(prepRes.status, 200, "PAID -> PREPARING geçişi başarılı olmalı");
  assertEquals(prepRes.data.order.status, "PREPARING", "Durum PREPARING olmalı");

  const delivRes = await callApi(app, "POST", `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: "DELIVERED" },
  });
  assertEquals(delivRes.status, 200, "PREPARING -> DELIVERED geçişi başarılı olmalı");
  assertEquals(delivRes.data.order.status, "DELIVERED", "Durum DELIVERED olmalı");

  // Müşteri iade talebi açar (DELIVERED -> REFUND_REQUESTED)
  const reqRefundRes = await callApi(app, "POST", `/api/orders/${orderId}/refund`, {
    token: custToken,
    body: { reason: "Paket soğuk ulaştı, iade talep ediyorum.", mode: "REQUEST" },
  });
  assertEquals(reqRefundRes.status, 200, "DELIVERED -> REFUND_REQUESTED geçişi başarılı olmalı");
  assertEquals(reqRefundRes.data.order.status, "REFUND_REQUESTED", "Durum REFUND_REQUESTED olmalı");

  // Yönetici iade talebini onaylar (REFUND_REQUESTED -> REFUNDED)
  const approveRefundRes = await callApi(app, "POST", `/api/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: "REFUNDED", reason: "Müşteri memnuniyeti kapsamında iade onaylandı." },
  });
  assertEquals(approveRefundRes.status, 200, "REFUND_REQUESTED -> REFUNDED geçişi başarılı olmalı");
  assertEquals(approveRefundRes.data.order.status, "REFUNDED", "Durum REFUNDED olmalı");
  assertEquals(
    approveRefundRes.data.order.refund.stockRestored,
    true,
    "Stok geri yükleme (stockRestored) true olmalı",
  );

  // Stok tekrar 20'ye yükselmiş olmalı
  const afterPrd = await callApi(app, "GET", "/api/products/prd_icli_kofte");
  assertEquals(afterPrd.data.product.dailyStock, 20, "İade sonrası stok tekrar 20'ye geri yüklenmeli");
});

