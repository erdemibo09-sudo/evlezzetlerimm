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
    refund,
  };
}

/**
 * Sunucu tarafında sepet fiyatlarını ve stok uygunluğunu doğrular.
 * İstemciden gelen hiçbir fiyat verisine güvenilmez.
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
      .prepare("SELECT id, name, portion_info, price_kurus, daily_stock, is_archived FROM products WHERE id = ?")
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
 * 1. BEGIN IMMEDIATE TRANSACTION ile veritabanı yazma kilidi alır.
 * 2. Her kalem için atomik koşullu UPDATE (WHERE daily_stock >= quantity AND is_archived = 0) çalıştırır.
 *    Eşzamanlı siparişlerde stok asla negatife düşmez (overselling imkansızdır).
 * 3. Sipariş kalemlerinin satın alma anındaki fiyat, isim, porsiyon ve alerjen bilgisini dondurur (snapshot).
 * 4. Aynı transaction içinde hem Müşteri hem Yönetici için satın alma e-postalarını email_outbox'a yazar.
 */
export function createOrderAtomic(
  db: DatabaseSync,
  user: AuthenticatedUser,
  input: CheckoutInput,
): OrderRecord {
  const orderId = withTransaction(db, () => {
    // İdempotency kontrolü
    if (input.idempotencyKey) {
      const existingOrder = db
        .prepare("SELECT id, user_id FROM orders WHERE idempotency_key = ?")
        .get(input.idempotencyKey) as { id: string; user_id: string } | undefined;
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

      // Atomik koşullu stok düşümü
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

    // Transactional Outbox: Satın alma e-postalarını aynı transaction içinde kaydet
    enqueuePurchaseEmailsInTx(db, orderForEmail);

    return newOrderId;
  });

  // Transaction başarıyla commit edildikten sonra Outbox kuyruğunu işle
  processEmailOutbox(db);

  return getOrderById(db, orderId)!;
}

/**
 * Sipariş ve İade Durum Makinesi (FSM) İade İşlemi:
 * - İade tutarını her zaman dondurulmuş (snapshot) sipariş kalemlerinden hesaplar;
 *   ürünün güncel fiyatı değişmiş veya ürün silinmiş olsa bile eski fiyattan kuruşu kuruşuna doğru iade yapar.
 * - Çift iade (double-refund) hem FSM hem de UNIQUE(order_id) kısıtıyla engellenir.
 * - Uygun durumda stokları atomik olarak geri yükler.
 * - Aynı transaction içinde hem Müşteri hem Yöneticiye iade e-postalarını kuyruğa yazar.
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

    // Yetki kontrolü: Müşteri yalnızca kendi siparişini iade edebilir
    if (actor.role === "CUSTOMER" && rawOrder.user_id !== actor.id) {
      throw new AuthError("Başka bir kullanıcıya ait siparişi iade edemezsiniz.", 403);
    }

    const targetStatus: OrderStatus = input.mode === "REQUEST" ? "REFUND_REQUESTED" : "REFUNDED";

    // Deterministik FSM geçiş kontrolü (Double-refund dahil tüm kuralları denetler)
    const transitionRule = validateOrderTransition(rawOrder.status, targetStatus, actor.role);

    // İade tutarını her zaman dondurulmuş order_items snapshot üzerinden doğrula
    const snapshotSumRow = db
      .prepare("SELECT COALESCE(SUM(line_total_kurus_snapshot), 0) as snapshot_total FROM order_items WHERE order_id = ?")
      .get(orderId) as { snapshot_total: number };

    const refundAmountKurus = snapshotSumRow.snapshot_total || rawOrder.total_amount_kurus;
    const now = new Date().toISOString();

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
        customerNote: rawOrder.customer_note,
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

    // Tam İade (REFUNDED) işlemi
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
      customerNote: rawOrder.customer_note,
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
 * Yönetici tarafından sipariş durumunu ilerletir (örn. PAID -> PREPARING -> DELIVERED).
 */
export function updateOrderStatusByAdmin(
  db: DatabaseSync,
  admin: AuthenticatedUser,
  orderId: string,
  targetStatus: OrderStatus,
  reason?: string,
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

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
    `).run(targetStatus, now, orderId);

    writeAuditLog(db, {
      actor: admin,
      action: "ORDER_STATUS_CHANGED",
      entityType: "ORDER",
      entityId: orderId,
      oldData: { status: rawOrder.status },
      newData: { status: targetStatus },
    });

    return getOrderById(db, orderId)!;
  });
}

export function getOrderById(db: DatabaseSync, orderId: string): OrderRecord | null {
  const row = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(orderId) as RawOrderRow | undefined;
  return row ? hydrateOrder(db, row) : null;
}

export function listOrdersForUser(db: DatabaseSync, userId: string): OrderRecord[] {
  const rows = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as unknown as RawOrderRow[];
  return rows.map((r) => hydrateOrder(db, r));
}

export function listAllOrdersForAdmin(
  db: DatabaseSync,
  options?: { status?: string; search?: string },
): OrderRecord[] {
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
    .prepare("SELECT COALESCE(SUM(total_amount_kurus), 0) as sum FROM orders WHERE status != 'REFUNDED'")
    .get() as { sum: number };

  const refundedTotalRow = db
    .prepare("SELECT COALESCE(SUM(refunded_amount_kurus), 0) as sum, COUNT(*) as cnt FROM orders WHERE status = 'REFUNDED'")
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
