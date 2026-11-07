import { DatabaseSync } from "node:sqlite";
import { formatKurus } from "../domain/money.ts";
import { generateId, getEnv } from "./cryptoUtils.ts";

export type EmailEventType = "ORDER_PURCHASED" | "ORDER_REFUND_REQUESTED" | "ORDER_REFUNDED";

export interface StoreSettings {
  contactEmail: string;
  ibanNumber: string;
  ibanHolderName: string;
  bankName: string;
  brevoApiKey: string;
  brevoSenderEmail: string;
  brevoSenderName: string;
}

const STORE_SETTINGS_ROW_ID = "cfg_store_settings_v1";

export function getStoreSettings(db: DatabaseSync): StoreSettings {
  const defaults: StoreSettings = {
    contactEmail: getEnv("ADMIN_EMAIL") ?? "evlezzetlerimm@gmail.com",
    ibanNumber: getEnv("COMPANY_IBAN") ?? "TR12 0001 0012 3456 7890 1234 01",
    ibanHolderName: getEnv("COMPANY_IBAN_HOLDER") ?? "Ev Lezzetlerimm — Mutfak Yönetimi",
    bankName: getEnv("COMPANY_BANK_NAME") ?? "Ziraat Bankası (Tüm Bankalardan 7/24 FAST / EFT)",
    brevoApiKey: getEnv("BREVO_API_KEY") ?? "",
    brevoSenderEmail: getEnv("BREVO_SENDER_EMAIL") ?? "evlezzetlerimm@gmail.com",
    brevoSenderName: "Ev Lezzetlerimm",
  };

  try {
    const row = db
      .prepare("SELECT new_data_json FROM audit_logs WHERE id = ?")
      .get(STORE_SETTINGS_ROW_ID) as { new_data_json: string | null } | undefined;
    if (row && row.new_data_json) {
      const parsed = JSON.parse(row.new_data_json) as Partial<StoreSettings>;
      return {
        contactEmail: parsed.contactEmail || defaults.contactEmail,
        ibanNumber: parsed.ibanNumber || defaults.ibanNumber,
        ibanHolderName: parsed.ibanHolderName || defaults.ibanHolderName,
        bankName: parsed.bankName || defaults.bankName,
        brevoApiKey: parsed.brevoApiKey !== undefined ? parsed.brevoApiKey : defaults.brevoApiKey,
        brevoSenderEmail: parsed.brevoSenderEmail || defaults.brevoSenderEmail,
        brevoSenderName: parsed.brevoSenderName || defaults.brevoSenderName,
      };
    }
  } catch {
    // Varsayılan ayarlarla devam et
  }
  return defaults;
}

export function saveStoreSettings(
  db: DatabaseSync,
  actorId: string,
  actorEmail: string,
  input: Partial<StoreSettings>,
): StoreSettings {
  const current = getStoreSettings(db);
  const updated: StoreSettings = {
    contactEmail: (input.contactEmail ?? current.contactEmail).trim() || "evlezzetlerimm@gmail.com",
    ibanNumber: (input.ibanNumber ?? current.ibanNumber).trim(),
    ibanHolderName: (input.ibanHolderName ?? current.ibanHolderName).trim(),
    bankName: (input.bankName ?? current.bankName).trim(),
    brevoApiKey: (input.brevoApiKey ?? current.brevoApiKey).trim(),
    brevoSenderEmail:
      (input.brevoSenderEmail ?? current.brevoSenderEmail).trim() || "evlezzetlerimm@gmail.com",
    brevoSenderName: (input.brevoSenderName ?? current.brevoSenderName).trim() || "Ev Lezzetlerimm",
  };

  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO audit_logs (
      id, actor_user_id, actor_email, actor_role, action, entity_type, entity_id, old_data_json, new_data_json, created_at
    ) VALUES (?, ?, ?, 'ADMIN', 'STORE_SETTINGS_UPDATED', 'STORE_SETTINGS', 'GLOBAL', ?, ?, ?)
  `).run(
    STORE_SETTINGS_ROW_ID,
    actorId,
    actorEmail,
    JSON.stringify({ ...current, brevoApiKey: current.brevoApiKey ? "***" : "" }),
    JSON.stringify(updated),
    now,
  );

  return updated;
}

export interface OrderItemSnapshotForEmail {
  productId: string | null;
  productNameSnapshot: string;
  portionInfoSnapshot: string;
  unitPriceKurusSnapshot: number;
  quantity: number;
  lineTotalKurusSnapshot: number;
}

export interface OrderForEmail {
  id: string;
  orderNumber: string;
  customerNameSnapshot: string;
  customerEmailSnapshot: string;
  deliveryAddress: string;
  customerNote: string;
  totalAmountKurus: number;
  status: string;
  createdAt: string;
  items: OrderItemSnapshotForEmail[];
}

export interface RefundForEmail {
  refundId: string;
  refundAmountKurus: number;
  reason: string;
  stockRestored: boolean;
  refundedAt: string;
  processedByEmail: string;
}

export interface EmailOutboxRecord {
  id: string;
  eventType: EmailEventType;
  orderId: string;
  recipientEmail: string;
  recipientRole: "CUSTOMER" | "ADMIN";
  subject: string;
  htmlBody: string;
  textBody: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  messageId: string | null;
  sentAt: string | null;
  createdAt: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildItemsHtmlTable(items: OrderItemSnapshotForEmail[]): string {
  const rows = items
    .map(
      (item) => `
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
      </tr>`,
    )
    .join("");

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

function buildPurchaseHtml(
  order: OrderForEmail,
  isForAdmin: boolean,
  settings: StoreSettings,
): string {
  const headline = isForAdmin
    ? `Yeni Sipariş Alındı! (#${escapeHtml(order.orderNumber)})`
    : `Siparişiniz Alındı! (#${escapeHtml(order.orderNumber)})`;
  const subtext = isForAdmin
    ? `${escapeHtml(order.customerNameSnapshot)} (${escapeHtml(order.customerEmailSnapshot)}) tarafından yeni bir sipariş oluşturuldu. Müşterinin IBAN havale/EFT ödemesini kontrol ederek siparişi 'Sipariş Hazırlanıyor' aşamasına geçirebilirsiniz.`
    : `Sayın ${escapeHtml(order.customerNameSnapshot)}, siparişiniz sistemimize <strong>Sipariş Alındı</strong> olarak kaydedilmiştir. Ödemeniz aşağıdaki IBAN hesabımıza ulaştıktan sonra siparişiniz hazırlanmaya başlanacaktır.`;

  const ibanBoxHtml = `
    <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:10px;padding:16px;margin:16px 0;font-size:14px;color:#78350f;">
      <div style="font-weight:900;font-size:15px;margin-bottom:8px;color:#92400e;">🏦 Havale / EFT / FAST Ödeme Bilgileri</div>
      <div style="margin-bottom:4px;"><strong>Banka:</strong> ${escapeHtml(settings.bankName)}</div>
      <div style="margin-bottom:4px;"><strong>Alıcı Ad Soyad / Ünvan:</strong> ${escapeHtml(settings.ibanHolderName)}</div>
      <div style="margin-bottom:6px;"><strong>IBAN:</strong> <code style="background:#fff;padding:3px 8px;border-radius:6px;font-weight:900;color:#1c1917;font-size:14px;">${escapeHtml(settings.ibanNumber)}</code></div>
      <div style="margin-bottom:8px;"><strong>Açıklama Kodu:</strong> <strong>#${escapeHtml(order.orderNumber)}</strong></div>
      <div style="background:#fee2e2;border:1px solid #f87171;color:#991b1b;padding:10px 12px;border-radius:8px;font-weight:700;font-size:13px;">
        ⚠️ ÖNEMLİ UYARI: Ödemeyi yaptıktan sonra sitemizdeki "Siparişlerim" ekranından "Ödemeyi Yaptım" butonuna basınız. 1 gün (24 saat) içinde IBAN hesabına ödemesi yapılmayan siparişler otomatik olarak iptal edilecektir.
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>${headline}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f3ef;padding:24px;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.06);border:1px solid #e7e2da;">
    <div style="background:linear-gradient(135deg,#9a3412,#c2410c);color:#ffffff;padding:24px;">
      <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Ev Lezzetlerimm — Günlük Taze Mutfak</div>
      <h1 style="margin:8px 0 0;font-size:22px;">${headline}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${subtext}</p>
      ${ibanBoxHtml}
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px;margin-bottom:16px;font-size:14px;">
        <div><strong>Sipariş Numarası:</strong> ${escapeHtml(order.orderNumber)}</div>
        <div><strong>Sipariş Durumu:</strong> Sipariş Alındı</div>
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
      İletişim: <a href="mailto:${escapeHtml(settings.contactEmail)}" style="color:#9a3412;">${escapeHtml(settings.contactEmail)}</a> • Bu e-posta Ev Lezzetlerimm otomatik bildirim sistemi tarafından gönderilmiştir.
    </div>
  </div>
</body>
</html>`;
}

function buildRefundHtml(
  order: OrderForEmail,
  refund: RefundForEmail,
  isForAdmin: boolean,
  eventType: EmailEventType,
  settings: StoreSettings,
): string {
  const isCompleted = eventType === "ORDER_REFUNDED";
  const badgeColor = isCompleted ? "#15803d" : "#b45309";
  const headline = isCompleted
    ? `Sipariş İadesi / İptali Tamamlandı (#${escapeHtml(order.orderNumber)})`
    : `İade Talebi Oluşturuldu (#${escapeHtml(order.orderNumber)})`;

  const intro = isForAdmin
    ? `${escapeHtml(order.customerNameSnapshot)} (${escapeHtml(order.customerEmailSnapshot)}) adlı müşterinin <strong>#${escapeHtml(order.orderNumber)}</strong> numaralı siparişi için iade/iptal işlemi gerçekleşti.`
    : `Sayın ${escapeHtml(order.customerNameSnapshot)}, <strong>#${escapeHtml(order.orderNumber)}</strong> numaralı siparişinize ait iade/iptal işleminiz aşağıda detaylandırılmıştır.`;

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><title>${headline}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f3ef;padding:24px;color:#1f2937;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.06);border:1px solid #e7e2da;">
    <div style="background:${badgeColor};color:#ffffff;padding:24px;">
      <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Ev Lezzetlerimm — İade & Müşteri Güvencesi</div>
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
      İletişim: <a href="mailto:${escapeHtml(settings.contactEmail)}" style="color:#15803d;">${escapeHtml(settings.contactEmail)}</a> • Bu e-posta Ev Lezzetlerimm Transactional Outbox sistemi tarafından otomatik olarak oluşturulmuştur.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Satın alma gerçekleştiğinde AYNI VERİTABANI TRANSACTION'I içinde
 * hem Müşteri hem Yönetici için e-postaları email_outbox tablosuna yazar.
 */
export function enqueuePurchaseEmailsInTx(
  db: DatabaseSync,
  order: OrderForEmail,
): string[] {
  const settings = getStoreSettings(db);
  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO email_outbox (
      id, event_type, order_id, recipient_email, recipient_role,
      subject, html_body, text_body, payload_json, status, attempts, created_at
    ) VALUES (?, 'ORDER_PURCHASED', ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)
  `);

  const itemsSummaryText = order.items
    .map(
      (i) =>
        `- ${i.productNameSnapshot} (${i.portionInfoSnapshot}) x${i.quantity} = ${formatKurus(i.lineTotalKurusSnapshot)}`,
    )
    .join("\n");

  const payload = {
    event: "ORDER_PURCHASED",
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmailSnapshot,
    totalAmountKurus: order.totalAmountKurus,
    totalFormatted: formatKurus(order.totalAmountKurus),
    ibanNumber: settings.ibanNumber,
    ibanHolderName: settings.ibanHolderName,
    items: order.items,
  };

  // 1. Müşteri Onay E-Postası
  const custEmailId = generateId("eml");
  const custSubject = `🍲 Siparişiniz Alındı (#${order.orderNumber}) — Toplam: ${formatKurus(order.totalAmountKurus)}`;
  const custText =
    `Sayın ${order.customerNameSnapshot},\n\n` +
    `#${order.orderNumber} numaralı siparişiniz 'Sipariş Alındı' olarak kaydedilmiştir.\n` +
    `IBAN: ${settings.ibanNumber} (${settings.ibanHolderName})\n` +
    `UYARI: 1 gün (24 saat) içinde IBAN hesabına ödeme yapılmayan siparişler iptal edilir.\n\n` +
    `Sipariş Kalemleri:\n${itemsSummaryText}\n\n` +
    `Genel Toplam: ${formatKurus(order.totalAmountKurus)}\nTeslimat Adresi: ${order.deliveryAddress}`;

  insertStmt.run(
    custEmailId,
    order.id,
    order.customerEmailSnapshot,
    "CUSTOMER",
    custSubject,
    buildPurchaseHtml(order, false, settings),
    custText,
    JSON.stringify(payload),
    now,
  );

  // 2. Yönetici Bildirim E-Postası
  const adminEmailId = generateId("eml");
  const adminSubject = `🔔 [YÖNETİCİ] Yeni Sipariş Alındı (#${order.orderNumber}) — ${order.customerNameSnapshot} (${formatKurus(order.totalAmountKurus)})`;
  const adminText =
    `Yeni Sipariş Bildirimi (#${order.orderNumber})\n` +
    `Müşteri: ${order.customerNameSnapshot} (${order.customerEmailSnapshot})\n` +
    `Teslimat Adresi: ${order.deliveryAddress}\n\n` +
    `Kalemler:\n${itemsSummaryText}\n\n` +
    `Genel Toplam: ${formatKurus(order.totalAmountKurus)}`;

  insertStmt.run(
    adminEmailId,
    order.id,
    settings.contactEmail,
    "ADMIN",
    adminSubject,
    buildPurchaseHtml(order, true, settings),
    adminText,
    JSON.stringify(payload),
    now,
  );

  return [custEmailId, adminEmailId];
}

/**
 * İade talebi veya iade onayı gerçekleştiğinde AYNI VERİTABANI TRANSACTION'I içinde
 * hem Müşteri hem Yönetici için iade e-postalarını email_outbox tablosuna yazar.
 */
export function enqueueRefundEmailsInTx(
  db: DatabaseSync,
  order: OrderForEmail,
  refund: RefundForEmail,
  eventType: "ORDER_REFUND_REQUESTED" | "ORDER_REFUNDED",
): string[] {
  const settings = getStoreSettings(db);
  const now = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO email_outbox (
      id, event_type, order_id, recipient_email, recipient_role,
      subject, html_body, text_body, payload_json, status, attempts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)
  `);

  const payload = {
    event: eventType,
    orderId: order.id,
    orderNumber: order.orderNumber,
    refundId: refund.refundId,
    refundAmountKurus: refund.refundAmountKurus,
    refundFormatted: formatKurus(refund.refundAmountKurus),
    reason: refund.reason,
    stockRestored: refund.stockRestored,
    refundedAt: refund.refundedAt,
  };

  const isCompleted = eventType === "ORDER_REFUNDED";

  // 1. Müşteri İade E-Postası
  const custEmailId = generateId("eml");
  const custSubject = isCompleted
    ? `💸 İadeniz Onaylandı (#${order.orderNumber}) — İade Tutarı: ${formatKurus(refund.refundAmountKurus)}`
    : `⏳ İade Talebiniz Alındı (#${order.orderNumber}) — ${formatKurus(refund.refundAmountKurus)}`;
  const custText =
    `Sayın ${order.customerNameSnapshot},\n\n` +
    `#${order.orderNumber} numaralı siparişiniz için ${isCompleted ? "iade işleminiz tamamlanmıştır" : "iade talebiniz oluşturulmuştur"}.\n` +
    `İade Tutarı: ${formatKurus(refund.refundAmountKurus)}\n` +
    `İade Nedeni: ${refund.reason}\n` +
    `Referans No: ${refund.refundId}`;

  insertStmt.run(
    custEmailId,
    eventType,
    order.id,
    order.customerEmailSnapshot,
    "CUSTOMER",
    custSubject,
    buildRefundHtml(order, refund, false, eventType, settings),
    custText,
    JSON.stringify(payload),
    now,
  );

  // 2. Yönetici İade Bildirim E-Postası
  const adminEmailId = generateId("eml");
  const adminSubject = isCompleted
    ? `🔄 [YÖNETİCİ] Sipariş İade Edildi (#${order.orderNumber}) — ${formatKurus(refund.refundAmountKurus)}`
    : `⚠️ [YÖNETİCİ] Yeni İade Talebi (#${order.orderNumber}) — ${order.customerNameSnapshot}`;
  const adminText =
    `Sipariş İade Bildirimi (#${order.orderNumber})\n` +
    `Müşteri: ${order.customerNameSnapshot} (${order.customerEmailSnapshot})\n` +
    `İade Tutarı: ${formatKurus(refund.refundAmountKurus)}\n` +
    `İade Nedeni: ${refund.reason}\n` +
    `Stok Geri Yüklendi: ${refund.stockRestored ? "Evet" : "Hayır"}`;

  insertStmt.run(
    adminEmailId,
    eventType,
    order.id,
    settings.contactEmail,
    "ADMIN",
    adminSubject,
    buildRefundHtml(order, refund, true, eventType, settings),
    adminText,
    JSON.stringify(payload),
    now,
  );

  return [custEmailId, adminEmailId];
}

async function sendViaBrevoRestApi(
  settings: StoreSettings,
  recipientEmail: string,
  subject: string,
  htmlContent: string,
  textContent: string,
): Promise<void> {
  if (!settings.brevoApiKey) return;
  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": settings.brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: settings.brevoSenderName || "Ev Lezzetlerimm",
          email: settings.brevoSenderEmail || "evlezzetlerimm@gmail.com",
        },
        replyTo: {
          name: "Ev Lezzetlerimm",
          email: settings.contactEmail || "evlezzetlerimm@gmail.com",
        },
        to: [{ email: recipientEmail }],
        subject,
        htmlContent,
        textContent,
      }),
    });
  } catch {
    // Brevo ağ hatası durumunda yerel Outbox kaydı korunur
  }
}

const inFlightEmailDeliveries: Promise<void>[] = [];

export async function flushInFlightEmailDeliveries(): Promise<void> {
  if (inFlightEmailDeliveries.length === 0) return;
  const batch = inFlightEmailDeliveries.splice(0, inFlightEmailDeliveries.length);
  await Promise.allSettled(batch);
}

/**
 * Outbox kuyruğundaki PENDING e-postaları işler, RFC-2822 Message-ID üretir, SENT olarak işaretler
 * ve eğer Brevo API anahtarı tanımlıysa gerçek e-posta gönderimini tetikler.
 */
export function processEmailOutbox(db: DatabaseSync): number {
  const pendingRows = db
    .prepare(
      "SELECT id, order_id, recipient_email, subject, html_body, text_body FROM email_outbox WHERE status = 'PENDING' ORDER BY created_at ASC",
    )
    .all() as Array<{
      id: string;
      order_id: string;
      recipient_email: string;
      subject: string;
      html_body: string;
      text_body: string;
    }>;

  if (pendingRows.length === 0) return 0;

  const settings = getStoreSettings(db);
  const updateStmt = db.prepare(`
    UPDATE email_outbox
    SET status = 'SENT', attempts = attempts + 1, message_id = ?, sent_at = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();
  for (const row of pendingRows) {
    const messageId = `<${row.id}.${Date.now()}@evlezzetlerimm.com>`;
    updateStmt.run(messageId, now, row.id);
    if (settings.brevoApiKey) {
      inFlightEmailDeliveries.push(
        sendViaBrevoRestApi(
          settings,
          row.recipient_email,
          row.subject,
          row.html_body,
          row.text_body,
        ).catch(() => {}),
      );
    }
  }

  return pendingRows.length;
}

interface RawEmailOutboxRow {
  id: string;
  event_type: EmailEventType;
  order_id: string;
  recipient_email: string;
  recipient_role: "CUSTOMER" | "ADMIN";
  subject: string;
  html_body: string;
  text_body: string;
  payload_json: string;
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  message_id: string | null;
  sent_at: string | null;
  created_at: string;
}

function mapOutboxRow(r: RawEmailOutboxRow): EmailOutboxRecord {
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
    createdAt: r.created_at,
  };
}

export function listOutboxEmails(
  db: DatabaseSync,
  options?: {
    recipientEmail?: string;
    orderId?: string;
    eventType?: EmailEventType;
    limit?: number;
  },
): EmailOutboxRecord[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

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

  const rows = db
    .prepare(`
      SELECT * FROM email_outbox
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(...params, limit) as unknown as RawEmailOutboxRow[];

  return rows.map(mapOutboxRow);
}
