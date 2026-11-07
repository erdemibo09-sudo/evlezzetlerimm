import { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../db/database.ts";
import { formatKurus } from "../domain/money.ts";
import {
  getAllowedNextStatuses,
  ORDER_STATUS_LABELS,
  OrderFsmError,
  OrderStatus,
  validateOrderTransition,
} from "../domain/orderFsm.ts";
import { CartItemInput, CheckoutInput, RefundInput, ValidationError } from "../domain/validation.ts";
import { AuthenticatedUser, AuthError } from "./authService.ts";
import { writeAuditLog } from "./auditService.ts";
import { generateId, generateOrderNumber } from "./cryptoUtils.ts";
import {
  enqueuePurchaseEmailsInTx,
  enqueueRefundEmailsInTx,
  OrderForEmail,
  processEmailOutbox,
} from "./emailService.ts";

export class StockConflictError extends Error {
  public readonly statusCode = 409;
  public readonly code = "INSUFFICIENT_STOCK";

  constructor(message: string) {
    super(message);
    this.name = "StockConflictError";
  }
}

export interface OrderMeta {
  paymentNotified?: boolean;
  paymentNotifiedAt?: string | null;
  paymentSenderName?: string | null;
  cargoCompany?: string | null;
  trackingCode?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  lastCargoCheckAt?: string | null;
  cargoStatusSummary?: string | null;
}

const META_DELIMITER = "\n__EVL_META__:";

function parseCustomerNoteAndMeta(raw: string | null | undefined): {
  cleanNote: string;
  meta: OrderMeta;
} {
  const str = raw ?? "";
  const idx = str.indexOf(META_DELIMITER);
  if (idx === -1) {
    return { cleanNote: str, meta: {} };
  }
  const cleanNote = str.slice(0, idx);
  const jsonPart = str.slice(idx + META_DELIMITER.length);
  try {
    const parsed = JSON.parse(jsonPart) as OrderMeta;
    return { cleanNote, meta: parsed && typeof parsed === "object" ? parsed : {} };
  } catch {
    return { cleanNote, meta: {} };
  }
}

function serializeCustomerNoteAndMeta(cleanNote: string, meta: OrderMeta): string {
  const hasAnyMeta = Object.values(meta).some((v) => v !== undefined && v !== null && v !== false && v !== "");
  if (!hasAnyMeta) return cleanNote;
  return `${cleanNote}${META_DELIMITER}${JSON.stringify(meta)}`;
}

export function buildCargoTrackingUrl(
  cargoCompany: string | null | undefined,
  trackingCode: string | null | undefined,
): string | null {
  if (!cargoCompany || !trackingCode) return null;
  const code = encodeURIComponent(trackingCode.trim());
  const comp = cargoCompany.toLowerCase();
  if (comp.includes("yurtiçi") || comp.includes("yurtici")) {
    return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${code}`;
  }
  if (comp.includes("aras")) {
    return `https://kargotakip.araskargo.com.tr/mainpage.aspx?code=${code}`;
  }
  if (comp.includes("ptt")) {
    return `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${code}`;
  }
  if (comp.includes("sürat") || comp.includes("surat")) {
    return `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${code}`;
  }
  if (comp.includes("mng") || comp.includes("dhl")) {
    return `https://www.mngkargo.com.tr/gonderi-takip?takipNo=${code}`;
  }
  if (comp.includes("hepsijet")) {
    return `https://www.hepsijet.com/gonderi-takibi/${code}`;
  }
  if (comp.includes("kolay")) {
    return `https://esube.kolaygelsin.com/?trackingId=${code}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(cargoCompany + " kargo takip " + trackingCode)}`;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string | null;
  productNameSnapshot: string;
  portionInfoSnapshot: string;
  allergensSnapshot: string[];
  unitPriceKurusSnapshot: number;
  unitPriceFormatted: string;
  quantity: number;
  lineTotalKurusSnapshot: number;
  lineTotalFormatted: string;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  userId: string;
  processedByUserId: string;
  amountKurus: number;
  amountFormatted: string;
  reason: string;
  stockRestored: boolean;
  createdAt: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  userId: string;
  customerNameSnapshot: string;
  customerEmailSnapshot: string;
  deliveryAddress: string;
  customerNote: string;
  totalAmountKurus: number;
  totalAmountFormatted: string;
  status: OrderStatus;
  statusLabel: string;
  allowedNextStatusesForAdmin: OrderStatus[];
  allowedNextStatusesForCustomer: OrderStatus[];
  paymentNotified: boolean;
  paymentNotifiedAt: string | null;
  paymentSenderName: string | null;
  paymentDeadlineAt: string;
  cargoCompany: string | null;
  trackingCode: string | null;
  cargoTrackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cargoStatusSummary: string | null;
  refundReason: string | null;
  refundedAmountKurus: number;
  refundedAmountFormatted: string;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
  refund: RefundRecord | null;
}

interface RawOrderRow {
  id: string;
  order_number: string;
  user_id: string;
  customer_name_snapshot: string;
  customer_email_snapshot: string;
  delivery_address: string;
  customer_note: string;
  total_amount_kurus: number;
  status: OrderStatus;
  idempotency_key: string | null;
  refund_reason: string | null;
  refunded_amount_kurus: number;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RawOrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  portion_info_snapshot: string;
  allergens_snapshot_json: string;
  unit_price_kurus_snapshot: number;
  quantity: number;
  line_total_kurus_snapshot: number;
}

interface RawRefundRow {
  id: string;
  order_id: string;
  user_id: string;
  processed_by_user_id: string;
  amount_kurus: number;
  reason: string;
  stock_restored: number;
  created_at: string;
}

function hydrateOrder(db: DatabaseSync, row: RawOrderRow): OrderRecord {
  const { cleanNote, meta } = parseCustomerNoteAndMeta(row.customer_note);

  const itemRows = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC")
    .all(row.id) as unknown as RawOrderItemRow[];

  const items: OrderItemRecord[] = itemRows.map((ir) => {
    let allergens: string[] = [];
    try {
      allergens = JSON.parse(ir.allergens_snapshot_json);
    } catch {
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
      lineTotalFormatted: formatKurus(ir.line_total_kurus_snapshot),
    };
  });

  const refundRow = db
    .prepare("SELECT * FROM refunds WHERE order_id = ?")
    .get(row.id) as RawRefundRow | undefined;

  const refund: RefundRecord | null = refundRow
    ? {
        id: refundRow.id,
        orderId: refundRow.order_id,
        userId: refundRow.user_id,
        processedByUserId: refundRow.processed_by_user_id,
        amountKurus: refundRow.amount_kurus,
        amountFormatted: formatKurus(refundRow.amount_kurus),
        reason: refundRow.reason,
        stockRestored: refundRow.stock_restored === 1,
        createdAt: refundRow.created_at,
      }
    : null;

  const createdMs = Date.parse(row.created_at) || Date.now();
  const paymentDeadlineAt = new Date(createdMs + 24 * 60 * 60 * 1000).toISOString();

  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    customerNameSnapshot: row.customer_name_snapshot,
    customerEmailSnapshot: row.customer_email_snapshot,
    deliveryAddress: row.delivery_address,
    customerNote: cleanNote,
    totalAmountKurus: row.total_amount_kurus,
    totalAmountFormatted: formatKurus(row.total_amount_kurus),
    status: row.status,
    statusLabel: ORDER_STATUS_LABELS[row.status] ?? row.status,
    allowedNextStatusesForAdmin: getAllowedNextStatuses(row.status, "ADMIN"),
    allowedNextStatusesForCustomer: getAllowedNextStatuses(row.status, "CUSTOMER"),
    paymentNotified: Boolean(meta.paymentNotified),
    paymentNotifiedAt: meta.paymentNotifiedAt ?? null,
    paymentSenderName: meta.paymentSenderName ?? null,
    paymentDeadlineAt,
    cargoCompany: meta.cargoCompany ?? null,
    trackingCode: meta.trackingCode ?? null,
    cargoTrackingUrl: buildCargoTrackingUrl(meta.cargoCompany, meta.trackingCode),
    shippedAt: meta.shippedAt ?? null,
    deliveredAt: meta.deliveredAt ?? null,
    cargoStatusSummary: meta.cargoStatusSummary ?? null,
    refundReason: row.refund_reason,
    refundedAmountKurus: row.refunded_amount_kurus ?? 0,
    refundedAmountFormatted: formatKurus(row.refunded_amount_kurus ?? 0),
    refundedAt: row.refunded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    refund,
  };
}

/**
 * 1 gün (24 saat) içinde IBAN ödemesi bildirilmemiş 'PAID' (Sipariş Alındı) durumundaki siparişleri
 * otomatik olarak iptal eder ve günlük stoklarını geri yükler.
 */
export function autoExpireUnpaidOrders(db: DatabaseSync): number {
  const paidRows = db
    .prepare("SELECT * FROM orders WHERE status = 'PAID'")
    .all() as unknown as RawOrderRow[];

  let expiredCount = 0;
  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  for (const row of paidRows) {
    const { meta } = parseCustomerNoteAndMeta(row.customer_note);
    if (meta.paymentNotified) continue;
    const createdMs = Date.parse(row.created_at);
    if (!Number.isNaN(createdMs) && nowMs - createdMs > ONE_DAY_MS) {
      try {
        const systemActor: AuthenticatedUser = {
          id: row.user_id,
          email: row.customer_email_snapshot,
          fullName: "Otomatik Süre Aşımı Sistemi",
          phone: "",
          address: "",
          role: "ADMIN",
          createdAt: row.created_at,
        };
        refundOrderAtomic(db, systemActor, row.id, {
          reason:
            "1 gün (24 saat) içerisinde IBAN hesabına ödeme yapılmadığı için sipariş otomatik olarak iptal edildi.",
          mode: "EXECUTE",
          restoreStock: true,
        });
        expiredCount++;
      } catch {
        // Zaten işlenmiş olabilir
      }
    }
  }
  return expiredCount;
}

/**
 * Sunucu tarafında sepet fiyatlarını ve stok uygunluğunu doğrular.
 */
export function calculateServerCartQuote(
  db: DatabaseSync,
  items: CartItemInput[],
): {
  lines: Array<{
    productId: string;
    name: string;
    portionInfo: string;
    unitPriceKurus: number;
    unitPriceFormatted: string;
    quantity: number;
    availableStock: number;
    lineTotalKurus: number;
    lineTotalFormatted: string;
  }>;
  totalAmountKurus: number;
  totalAmountFormatted: string;
} {
  let totalAmountKurus = 0;
  const lines = [];

  for (const item of items) {
    const product = db
      .prepare(
        "SELECT id, name, portion_info, price_kurus, daily_stock, is_archived FROM products WHERE id = ?",
      )
      .get(item.productId) as {
        id: string;
        name: string;
        portion_info: string;
        price_kurus: number;
        daily_stock: number;
        is_archived: number;
      } | undefined;

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
      lineTotalFormatted: formatKurus(lineTotalKurus),
    });
  }

  return {
    lines,
    totalAmountKurus,
    totalAmountFormatted: formatKurus(totalAmountKurus),
  };
}

/**
 * Atomik Satın Alma (Checkout):
 * Siparişi 'PAID' ('Sipariş Alındı') durumunda oluşturur ve hem e-posta kuyruğuna yazar hem de Siparişlerim ekranına düşürür.
 */
export function createOrderAtomic(
  db: DatabaseSync,
  user: AuthenticatedUser,
  input: CheckoutInput,
): OrderRecord {
  const orderId = withTransaction(db, () => {
    if (input.idempotencyKey) {
      const existingOrder = db
        .prepare("SELECT id, user_id FROM orders WHERE idempotency_key = ?")
        .get(input.idempotencyKey) as { id: string; user_id: string } | undefined;
      if (existingOrder) {
        if (existingOrder.user_id !== user.id) {
          throw new ValidationError(
            "Bu idempotency anahtarı başka bir işlemde kullanılmış.",
            "idempotencyKey",
          );
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
    const snapshotsToInsert: Array<{
      id: string;
      productId: string;
      productNameSnapshot: string;
      portionInfoSnapshot: string;
      allergensSnapshotJson: string;
      unitPriceKurusSnapshot: number;
      quantity: number;
      lineTotalKurusSnapshot: number;
    }> = [];

    for (const item of input.items) {
      const prod = selectProductStmt.get(item.productId) as {
        id: string;
        name: string;
        portion_info: string;
        allergens_json: string;
        price_kurus: number;
        daily_stock: number;
        is_archived: number;
      } | undefined;

      if (!prod || prod.is_archived === 1) {
        throw new StockConflictError(
          `Sepetinizdeki ürün artık satışta değil veya arşivlenmiş (${item.productId}).`,
        );
      }

      const updateResult = decrementStmt.run(item.quantity, now, prod.id, item.quantity);
      if (updateResult.changes !== 1) {
        throw new StockConflictError(
          `'${prod.name}' için yeterli günlük porsiyon stoğu kalmadı. (İstenen: ${item.quantity}, Mevcut: ${prod.daily_stock})`,
        );
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
        lineTotalKurusSnapshot: lineTotalKurus,
      });
    }

    db.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_name_snapshot, customer_email_snapshot,
        delivery_address, customer_note, total_amount_kurus, status, idempotency_key,
        refunded_amount_kurus, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, 0, ?, ?)
    `).run(
      newOrderId,
      orderNumber,
      user.id,
      user.fullName,
      user.email,
      deliveryAddress,
      customerNote,
      totalAmountKurus,
      input.idempotencyKey ?? null,
      now,
      now,
    );

    const insertItemStmt = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name_snapshot, portion_info_snapshot,
        allergens_snapshot_json, unit_price_kurus_snapshot, quantity, line_total_kurus_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const snap of snapshotsToInsert) {
      insertItemStmt.run(
        snap.id,
        newOrderId,
        snap.productId,
        snap.productNameSnapshot,
        snap.portionInfoSnapshot,
        snap.allergensSnapshotJson,
        snap.unitPriceKurusSnapshot,
        snap.quantity,
        snap.lineTotalKurusSnapshot,
      );
    }

    const orderForEmail: OrderForEmail = {
      id: newOrderId,
      orderNumber,
      customerNameSnapshot: user.fullName,
      customerEmailSnapshot: user.email,
      deliveryAddress,
      customerNote,
      totalAmountKurus,
      status: "PAID",
      createdAt: now,
      items: snapshotsToInsert.map((s) => ({
        productId: s.productId,
        productNameSnapshot: s.productNameSnapshot,
        portionInfoSnapshot: s.portionInfoSnapshot,
        unitPriceKurusSnapshot: s.unitPriceKurusSnapshot,
        quantity: s.quantity,
        lineTotalKurusSnapshot: s.lineTotalKurusSnapshot,
      })),
    };

    enqueuePurchaseEmailsInTx(db, orderForEmail);

    return newOrderId;
  });

  processEmailOutbox(db);

  return getOrderById(db, orderId)!;
}

/**
 * Müşterinin IBAN'a havale/EFT gönderdiğini onaylaması ("Ödemeyi Yaptım").
 */
export function confirmOrderPaymentByCustomer(
  db: DatabaseSync,
  actor: AuthenticatedUser,
  orderId: string,
  senderName?: string,
): OrderRecord {
  return withTransaction(db, () => {
    const rawOrder = db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(orderId) as RawOrderRow | undefined;

    if (!rawOrder) {
      throw new ValidationError("Sipariş bulunamadı.", "orderId");
    }

    if (actor.role !== "ADMIN" && rawOrder.user_id !== actor.id) {
      throw new AuthError("Bu sipariş için ödeme bildirim yetkiniz yok.", 403);
    }

    const { cleanNote, meta } = parseCustomerNoteAndMeta(rawOrder.customer_note);
    const now = new Date().toISOString();
    meta.paymentNotified = true;
    meta.paymentNotifiedAt = now;
    meta.paymentSenderName = (senderName || actor.fullName).trim();

    const updatedRawNote = serializeCustomerNoteAndMeta(cleanNote, meta);
    db.prepare("UPDATE orders SET customer_note = ?, updated_at = ? WHERE id = ?").run(
      updatedRawNote,
      now,
      orderId,
    );

    writeAuditLog(db, {
      actor,
      action: "ORDER_PAYMENT_NOTIFIED",
      entityType: "ORDER",
      entityId: orderId,
      oldData: { paymentNotified: false },
      newData: {
        paymentNotified: true,
        paymentNotifiedAt: now,
        paymentSenderName: meta.paymentSenderName,
      },
    });

    return getOrderById(db, orderId)!;
  });
}

/**
 * Sipariş ve İade Durum Makinesi (FSM) İade İşlemi.
 */
export function refundOrderAtomic(
  db: DatabaseSync,
  actor: AuthenticatedUser,
  orderId: string,
  input: RefundInput,
): OrderRecord {
  withTransaction(db, () => {
    const rawOrder = db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(orderId) as RawOrderRow | undefined;

    if (!rawOrder) {
      throw new ValidationError("İade edilecek sipariş bulunamadı.", "orderId");
    }

    if (actor.role === "CUSTOMER" && rawOrder.user_id !== actor.id) {
      throw new AuthError("Başka bir kullanıcıya ait siparişi iade edemezsiniz.", 403);
    }

    const targetStatus: OrderStatus = input.mode === "REQUEST" ? "REFUND_REQUESTED" : "REFUNDED";
    const transitionRule = validateOrderTransition(rawOrder.status, targetStatus, actor.role);

    const snapshotSumRow = db
      .prepare(
        "SELECT COALESCE(SUM(line_total_kurus_snapshot), 0) as snapshot_total FROM order_items WHERE order_id = ?",
      )
      .get(orderId) as { snapshot_total: number };

    const refundAmountKurus = snapshotSumRow.snapshot_total || rawOrder.total_amount_kurus;
    const now = new Date().toISOString();
    const { cleanNote } = parseCustomerNoteAndMeta(rawOrder.customer_note);

    const itemRows = db
      .prepare("SELECT * FROM order_items WHERE order_id = ?")
      .all(orderId) as unknown as RawOrderItemRow[];

    if (targetStatus === "REFUND_REQUESTED") {
      db.prepare(`
        UPDATE orders
        SET status = 'REFUND_REQUESTED', refund_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(input.reason, now, orderId);

      const orderForEmail: OrderForEmail = {
        id: rawOrder.id,
        orderNumber: rawOrder.order_number,
        customerNameSnapshot: rawOrder.customer_name_snapshot,
        customerEmailSnapshot: rawOrder.customer_email_snapshot,
        deliveryAddress: rawOrder.delivery_address,
        customerNote: cleanNote,
        totalAmountKurus: rawOrder.total_amount_kurus,
        status: "REFUND_REQUESTED",
        createdAt: rawOrder.created_at,
        items: itemRows.map((i) => ({
          productId: i.product_id,
          productNameSnapshot: i.product_name_snapshot,
          portionInfoSnapshot: i.portion_info_snapshot,
          unitPriceKurusSnapshot: i.unit_price_kurus_snapshot,
          quantity: i.quantity,
          lineTotalKurusSnapshot: i.line_total_kurus_snapshot,
        })),
      };

      enqueueRefundEmailsInTx(
        db,
        orderForEmail,
        {
          refundId: `REQ-${rawOrder.order_number}`,
          refundAmountKurus,
          reason: input.reason,
          stockRestored: false,
          refundedAt: now,
          processedByEmail: actor.email,
        },
        "ORDER_REFUND_REQUESTED",
      );

      writeAuditLog(db, {
        actor,
        action: "ORDER_REFUND_REQUESTED",
        entityType: "ORDER",
        entityId: orderId,
        oldData: { status: rawOrder.status },
        newData: { status: "REFUND_REQUESTED", reason: input.reason, refundAmountKurus },
      });
      return;
    }

    const existingRefund = db
      .prepare("SELECT id FROM refunds WHERE order_id = ?")
      .get(orderId) as { id: string } | undefined;

    if (existingRefund) {
      throw new OrderFsmError(
        "Bu sipariş için zaten tamamlanmış bir iade kaydı mevcuttur (Double-Refund Engellendi).",
        409,
        "DOUBLE_REFUND_PREVENTED",
      );
    }

    const shouldRestoreStock =
      input.restoreStock !== undefined ? input.restoreStock : transitionRule.defaultRestoreStock;

    let anyStockRestored = false;
    if (shouldRestoreStock) {
      const restoreStmt = db.prepare(`
        UPDATE products
        SET daily_stock = daily_stock + ?, updated_at = ?
        WHERE id = ?
      `);
      for (const item of itemRows) {
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
    `).run(
      refundId,
      orderId,
      rawOrder.user_id,
      actor.id,
      refundAmountKurus,
      input.reason,
      anyStockRestored ? 1 : 0,
      input.idempotencyKey ?? null,
      now,
    );

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

    const orderForEmail: OrderForEmail = {
      id: rawOrder.id,
      orderNumber: rawOrder.order_number,
      customerNameSnapshot: rawOrder.customer_name_snapshot,
      customerEmailSnapshot: rawOrder.customer_email_snapshot,
      deliveryAddress: rawOrder.delivery_address,
      customerNote: cleanNote,
      totalAmountKurus: rawOrder.total_amount_kurus,
      status: "REFUNDED",
      createdAt: rawOrder.created_at,
      items: itemRows.map((i) => ({
        productId: i.product_id,
        productNameSnapshot: i.product_name_snapshot,
        portionInfoSnapshot: i.portion_info_snapshot,
        unitPriceKurusSnapshot: i.unit_price_kurus_snapshot,
        quantity: i.quantity,
        lineTotalKurusSnapshot: i.line_total_kurus_snapshot,
      })),
    };

    enqueueRefundEmailsInTx(
      db,
      orderForEmail,
      {
        refundId,
        refundAmountKurus,
        reason: input.reason,
        stockRestored: anyStockRestored,
        refundedAt: now,
        processedByEmail: actor.email,
      },
      "ORDER_REFUNDED",
    );

    writeAuditLog(db, {
      actor,
      action: "ORDER_REFUNDED",
      entityType: "ORDER",
      entityId: orderId,
      oldData: { status: rawOrder.status, refundedAmountKurus: 0 },
      newData: {
        status: "REFUNDED",
        refundId,
        refundAmountKurus,
        reason: input.reason,
        stockRestored: anyStockRestored,
      },
    });
  });

  processEmailOutbox(db);

  return getOrderById(db, orderId)!;
}

/**
 * Yönetici tarafından sipariş durumunu ilerletir (PAID -> PREPARING -> SHIPPED -> DELIVERED).
 */
export function updateOrderStatusByAdmin(
  db: DatabaseSync,
  admin: AuthenticatedUser,
  orderId: string,
  targetStatus: OrderStatus,
  reason?: string,
  cargoInfo?: { cargoCompany?: string; trackingCode?: string },
): OrderRecord {
  if (targetStatus === "REFUNDED" || targetStatus === "REFUND_REQUESTED") {
    return refundOrderAtomic(db, admin, orderId, {
      reason: reason || "Yönetici tarafından iade işlemi uygulandı",
      mode: targetStatus === "REFUND_REQUESTED" ? "REQUEST" : "EXECUTE",
    });
  }

  return withTransaction(db, () => {
    const rawOrder = db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(orderId) as RawOrderRow | undefined;

    if (!rawOrder) {
      throw new ValidationError("Sipariş bulunamadı.", "orderId");
    }

    validateOrderTransition(rawOrder.status, targetStatus, admin.role);

    const { cleanNote, meta } = parseCustomerNoteAndMeta(rawOrder.customer_note);
    const now = new Date().toISOString();

    if (targetStatus === "SHIPPED") {
      meta.cargoCompany = (cargoInfo?.cargoCompany || meta.cargoCompany || "Yurtiçi Kargo").trim();
      meta.trackingCode = (
        cargoInfo?.trackingCode ||
        meta.trackingCode ||
        `TRK-${rawOrder.order_number.replace(/[^0-9A-Z]/g, "")}`
      ).trim();
      meta.shippedAt = now;
      meta.cargoStatusSummary = "Kargo firmasına teslim edildi — Transfer sürecinde";
    } else if (targetStatus === "DELIVERED") {
      meta.deliveredAt = now;
      meta.cargoStatusSummary = "Müşteriye teslim edildi";
    }

    const updatedRawNote = serializeCustomerNoteAndMeta(cleanNote, meta);

    db.prepare(`
      UPDATE orders SET status = ?, customer_note = ?, updated_at = ? WHERE id = ?
    `).run(targetStatus, updatedRawNote, now, orderId);

    writeAuditLog(db, {
      actor: admin,
      action: "ORDER_STATUS_CHANGED",
      entityType: "ORDER",
      entityId: orderId,
      oldData: { status: rawOrder.status },
      newData: {
        status: targetStatus,
        cargoCompany: meta.cargoCompany ?? undefined,
        trackingCode: meta.trackingCode ?? undefined,
      },
    });

    return getOrderById(db, orderId)!;
  });
}

/**
 * Kargo firmasından canlı teslimat durumunu sorgular ve eğer kargo teslim edilmişse
 * siparişi otomatik olarak 'DELIVERED' ('Teslim Edildi') durumuna günceller.
 */
export async function syncCargoDeliveryStatus(
  db: DatabaseSync,
  orderId: string,
  options?: { simulateDelivered?: boolean },
): Promise<{ order: OrderRecord; autoDelivered: boolean; carrierMessage: string }> {
  const rawOrder = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(orderId) as RawOrderRow | undefined;

  if (!rawOrder) {
    throw new ValidationError("Sipariş bulunamadı.", "orderId");
  }

  const { cleanNote, meta } = parseCustomerNoteAndMeta(rawOrder.customer_note);
  const now = new Date().toISOString();

  if (rawOrder.status === "DELIVERED") {
    return {
      order: hydrateOrder(db, rawOrder),
      autoDelivered: false,
      carrierMessage: "Kargo zaten teslim edilmiş durumda.",
    };
  }

  if (rawOrder.status !== "SHIPPED") {
    return {
      order: hydrateOrder(db, rawOrder),
      autoDelivered: false,
      carrierMessage: "Sipariş henüz kargoya verilmemiş.",
    };
  }

  let isDeliveredAtCarrier = Boolean(options?.simulateDelivered);
  let carrierMessage = "Kargo transfer aşamasında (Dağıtım şubesine ilerlemekte).";

  const trackingCode = (meta.trackingCode ?? "").trim();
  const trackingUrl = buildCargoTrackingUrl(meta.cargoCompany, trackingCode);

  if (!isDeliveredAtCarrier && trackingCode.toUpperCase().endsWith("TESLIM")) {
    isDeliveredAtCarrier = true;
  }

  if (!isDeliveredAtCarrier && trackingUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(trackingUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EvLezzetlerimmCargoBot/1.0)" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        if (
          /teslim\s+edildi|teslim\s+alan|gönderiniz\s+teslim\s+edilmiştir|status["']?\s*:\s*["']?delivered/i.test(
            html,
          )
        ) {
          isDeliveredAtCarrier = true;
        }
      }
    } catch {
      // Kargo sayfası yanıt vermezse mevcut durumu koru
    }
  }

  meta.lastCargoCheckAt = now;

  if (isDeliveredAtCarrier) {
    carrierMessage = `${meta.cargoCompany || "Kargo firması"} sisteminden 'TESLİM EDİLDİ' verisi çekildi ve sipariş durumu otomatik güncellendi.`;
    meta.deliveredAt = now;
    meta.cargoStatusSummary = carrierMessage;
    const updatedRawNote = serializeCustomerNoteAndMeta(cleanNote, meta);

    db.prepare(`
      UPDATE orders SET status = 'DELIVERED', customer_note = ?, updated_at = ? WHERE id = ?
    `).run(updatedRawNote, now, orderId);

    const systemActor: AuthenticatedUser = {
      id: rawOrder.user_id,
      email: "evlezzetlerimm@gmail.com",
      fullName: `${meta.cargoCompany || "Kargo"} Otomatik Takip Sistemi`,
      phone: "",
      address: "",
      role: "ADMIN",
      createdAt: now,
    };

    writeAuditLog(db, {
      actor: systemActor,
      action: "CARGO_AUTO_DELIVERED",
      entityType: "ORDER",
      entityId: orderId,
      oldData: { status: "SHIPPED" },
      newData: {
        status: "DELIVERED",
        cargoCompany: meta.cargoCompany,
        trackingCode: meta.trackingCode,
        carrierMessage,
      },
    });

    return {
      order: getOrderById(db, orderId)!,
      autoDelivered: true,
      carrierMessage,
    };
  }

  meta.cargoStatusSummary = `${carrierMessage} (Son Kontrol: ${now.slice(11, 19)})`;
  const updatedRawNote = serializeCustomerNoteAndMeta(cleanNote, meta);
  db.prepare("UPDATE orders SET customer_note = ?, updated_at = ? WHERE id = ?").run(
    updatedRawNote,
    now,
    orderId,
  );

  return {
    order: getOrderById(db, orderId)!,
    autoDelivered: false,
    carrierMessage,
  };
}

export function getOrderById(db: DatabaseSync, orderId: string): OrderRecord | null {
  const row = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(orderId) as RawOrderRow | undefined;
  return row ? hydrateOrder(db, row) : null;
}

export function listOrdersForUser(db: DatabaseSync, userId: string): OrderRecord[] {
  autoExpireUnpaidOrders(db);
  const rows = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as unknown as RawOrderRow[];
  return rows.map((r) => hydrateOrder(db, r));
}

export function listAllOrdersForAdmin(
  db: DatabaseSync,
  options?: { status?: string; search?: string },
): OrderRecord[] {
  autoExpireUnpaidOrders(db);
  const conditions: string[] = [];
  const params: string[] = [];

  if (options?.status && options.status !== "ALL") {
    conditions.push("status = ?");
    params.push(options.status);
  }
  if (options?.search) {
    conditions.push(
      "(LOWER(order_number) LIKE ? OR LOWER(customer_name_snapshot) LIKE ? OR LOWER(customer_email_snapshot) LIKE ?)",
    );
    const q = `%${options.search.toLowerCase()}%`;
    params.push(q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM orders ${whereClause} ORDER BY created_at DESC`)
    .all(...params) as unknown as RawOrderRow[];

  return rows.map((r) => hydrateOrder(db, r));
}

export function getAdminDashboardStats(db: DatabaseSync) {
  const totalOrdersRow = db
    .prepare("SELECT COUNT(*) as cnt FROM orders")
    .get() as { cnt: number };

  const grossRevenueRow = db
    .prepare(
      "SELECT COALESCE(SUM(total_amount_kurus), 0) as sum FROM orders WHERE status != 'REFUNDED'",
    )
    .get() as { sum: number };

  const refundedTotalRow = db
    .prepare(
      "SELECT COALESCE(SUM(refunded_amount_kurus), 0) as sum, COUNT(*) as cnt FROM orders WHERE status = 'REFUNDED'",
    )
    .get() as { sum: number; cnt: number };

  const activeProductsRow = db
    .prepare("SELECT COUNT(*) as cnt FROM products WHERE is_archived = 0")
    .get() as { cnt: number };

  const lowStockRow = db
    .prepare("SELECT COUNT(*) as cnt FROM products WHERE is_archived = 0 AND daily_stock <= 5")
    .get() as { cnt: number };

  const sentEmailsRow = db
    .prepare("SELECT COUNT(*) as cnt FROM email_outbox WHERE status = 'SENT'")
    .get() as { cnt: number };

  return {
    totalOrders: totalOrdersRow.cnt,
    netRevenueKurus: grossRevenueRow.sum,
    netRevenueFormatted: formatKurus(grossRevenueRow.sum),
    refundedOrdersCount: refundedTotalRow.cnt,
    refundedAmountKurus: refundedTotalRow.sum,
    refundedAmountFormatted: formatKurus(refundedTotalRow.sum),
    activeProductsCount: activeProductsRow.cnt,
    lowStockCount: lowStockRow.cnt,
    sentEmailsCount: sentEmailsRow.cnt,
  };
}
