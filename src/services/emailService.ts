import { DatabaseSync } from "node:sqlite";
import { formatKurus } from "../domain/money.ts";
import { generateId, getEnv } from "./cryptoUtils.ts";

export type EmailEventType = "ORDER_PURCHASED" | "ORDER_REFUND_REQUESTED" | "ORDER_REFUNDED";

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

const ADMIN_NOTIFICATION_EMAIL = getEnv("ADMIN_EMAIL") ?? "admin@evyemeklerim.com";

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

function buildPurchaseHtml(order: OrderForEmail, isForAdmin: boolean): string {
  const headline = isForAdmin
    ? `Yeni Sipariş Geldi! (#${escapeHtml(order.orderNumber)})`
    : `Siparişiniz Alındı! Afiyet Olsun (#${escapeHtml(order.orderNumber)})`;
  const subtext = isForAdmin
    ? `${escapeHtml(order.customerNameSnapshot)} (${escapeHtml(order.customerEmailSnapshot)}) tarafından yeni bir sipariş oluşturuldu.`
    : `Sayın ${escapeHtml(order.customerNameSnapshot)}, ev yemekleri siparişiniz mutfağımıza başarıyla iletilmiştir.`;

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

function buildRefundHtml(
  order: OrderForEmail,
  refund: RefundForEmail,
  isForAdmin: boolean,
  eventType: EmailEventType,
): string {
  const isCompleted = eventType === "ORDER_REFUNDED";
  const badgeColor = isCompleted ? "#15803d" : "#b45309";
  const headline = isCompleted
    ? `Sipariş İadesi Onaylandı ve Tamamlandı (#${escapeHtml(order.orderNumber)})`
    : `İade Talebi Oluşturuldu (#${escapeHtml(order.orderNumber)})`;

  const intro = isForAdmin
    ? `${escapeHtml(order.customerNameSnapshot)} (${escapeHtml(order.customerEmailSnapshot)}) adlı müşterinin <strong>#${escapeHtml(order.orderNumber)}</strong> numaralı siparişi için iade işlemi gerçekleşti.`
    : `Sayın ${escapeHtml(order.customerNameSnapshot)}, <strong>#${escapeHtml(order.orderNumber)}</strong> numaralı siparişinize ait iade işleminiz aşağıda detaylandırılmıştır.`;

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
 */
export function enqueuePurchaseEmailsInTx(
  db: DatabaseSync,
  order: OrderForEmail,
): string[] {
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
    timestamp: order.createdAt,
  };

  const itemsText = order.items
    .map(
      (i) =>
        `- ${i.productNameSnapshot} (${i.portionInfoSnapshot}) x${i.quantity} = ${formatKurus(i.lineTotalKurusSnapshot)}`,
    )
    .join("\n");

  // 1. Müşteri Onay E-postası
  const custEmailId = generateId("eml");
  const custSubject = `Siparişiniz Alındı (#${order.orderNumber}) - ${formatKurus(order.totalAmountKurus)}`;
  const custText = `Sayın ${order.customerNameSnapshot},\n#${order.orderNumber} numaralı siparişiniz alınmıştır.\n\nKalemler:\n${itemsText}\n\nToplam Tutar: ${formatKurus(order.totalAmountKurus)}\nTeslimat Adresi: ${order.deliveryAddress}`;
  insertStmt.run(
    custEmailId,
    "ORDER_PURCHASED",
    order.id,
    order.customerEmailSnapshot,
    "CUSTOMER",
    custSubject,
    buildPurchaseHtml(order, false),
    custText,
    JSON.stringify(payload),
    now,
  );

  // 2. Yönetici Bildirim E-postası
  const adminEmailId = generateId("eml");
  const adminSubject = `[YENİ SİPARİŞ] #${order.orderNumber} - ${order.customerNameSnapshot} (${formatKurus(order.totalAmountKurus)})`;
  const adminText = `Yeni Sipariş (#${order.orderNumber})\nMüşteri: ${order.customerNameSnapshot} (${order.customerEmailSnapshot})\nToplam: ${formatKurus(order.totalAmountKurus)}\n\nKalemler:\n${itemsText}`;
  insertStmt.run(
    adminEmailId,
    "ORDER_PURCHASED",
    order.id,
    ADMIN_NOTIFICATION_EMAIL,
    "ADMIN",
    adminSubject,
    buildPurchaseHtml(order, true),
    adminText,
    JSON.stringify(payload),
    now,
  );

  return [custEmailId, adminEmailId];
}

/**
 * İade veya iade talebi gerçekleştiğinde AYNI VERİTABANI TRANSACTION'I içinde
 * hem Müşteri hem Yönetici için e-postaları email_outbox tablosuna yazar.
 */
export function enqueueRefundEmailsInTx(
  db: DatabaseSync,
  order: OrderForEmail,
  refund: RefundForEmail,
  eventType: EmailEventType = "ORDER_REFUNDED",
): string[] {
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
    timestamp: refund.refundedAt,
  };

  const itemsText = order.items
    .map(
      (i) =>
        `- ${i.productNameSnapshot} x${i.quantity} = ${formatKurus(i.lineTotalKurusSnapshot)}`,
    )
    .join("\n");

  const statusTitle = eventType === "ORDER_REFUNDED" ? "İade Onayı" : "İade Talebi Alındı";

  // 1. Müşteri İade E-postası
  const custEmailId = generateId("eml");
  const custSubject = `${statusTitle} (#${order.orderNumber}) - İade Tutarı: ${formatKurus(refund.refundAmountKurus)}`;
  const custText = `Sayın ${order.customerNameSnapshot},\n#${order.orderNumber} numaralı siparişiniz için ${statusTitle} işlemi gerçekleştirilmiştir.\nİade Tutarı: ${formatKurus(refund.refundAmountKurus)}\nNeden: ${refund.reason}\nZaman: ${refund.refundedAt}\n\nKalemler:\n${itemsText}`;
  insertStmt.run(
    custEmailId,
    eventType,
    order.id,
    order.customerEmailSnapshot,
    "CUSTOMER",
    custSubject,
    buildRefundHtml(order, refund, false, eventType),
    custText,
    JSON.stringify(payload),
    now,
  );

  // 2. Yönetici İade E-postası
  const adminEmailId = generateId("eml");
  const adminSubject = `[İADE BİLDİRİMİ] #${order.orderNumber} - ${formatKurus(refund.refundAmountKurus)} (${order.customerNameSnapshot})`;
  const adminText = `Sipariş İade Bildirimi (#${order.orderNumber})\nMüşteri: ${order.customerNameSnapshot} (${order.customerEmailSnapshot})\nİade Tutarı: ${formatKurus(refund.refundAmountKurus)}\nNeden: ${refund.reason}\nZaman: ${refund.refundedAt}`;
  insertStmt.run(
    adminEmailId,
    eventType,
    order.id,
    ADMIN_NOTIFICATION_EMAIL,
    "ADMIN",
    adminSubject,
    buildRefundHtml(order, refund, true, eventType),
    adminText,
    JSON.stringify(payload),
    now,
  );

  return [custEmailId, adminEmailId];
}

/**
 * Outbox kuyruğundaki PENDING e-postaları işler, RFC-2822 Message-ID üretir ve SENT olarak işaretler.
 */
export function processEmailOutbox(db: DatabaseSync): number {
  const pendingRows = db
    .prepare("SELECT id, order_id, recipient_email FROM email_outbox WHERE status = 'PENDING' ORDER BY created_at ASC")
    .all() as Array<{ id: string; order_id: string; recipient_email: string }>;

  if (pendingRows.length === 0) return 0;

  const updateStmt = db.prepare(`
    UPDATE email_outbox
    SET status = 'SENT', attempts = attempts + 1, message_id = ?, sent_at = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();
  for (const row of pendingRows) {
    const messageId = `<${row.id}.${Date.now()}@evyemeklerim.com>`;
    updateStmt.run(messageId, now, row.id);
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
  options?: { recipientEmail?: string; orderId?: string; eventType?: EmailEventType; limit?: number },
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
