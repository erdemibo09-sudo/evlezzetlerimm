/**
 * Sipariş ve İade Yaşam Döngüsü — Deterministik Sonlu Durum Makinesi (FSM)
 * Durumlar: PAID -> PREPARING -> DELIVERED -> REFUND_REQUESTED -> REFUNDED
 */

export type OrderStatus =
  | "PAID"
  | "PREPARING"
  | "DELIVERED"
  | "REFUND_REQUESTED"
  | "REFUNDED";

export type UserRole = "CUSTOMER" | "ADMIN";

export interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  allowedRoles: UserRole[];
  defaultRestoreStock: boolean;
  description: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PAID: "Sipariş Alındı (Ödendi)",
  PREPARING: "Mutfakta Hazırlanıyor",
  DELIVERED: "Teslim Edildi",
  REFUND_REQUESTED: "İade Talebi Oluşturuldu",
  REFUNDED: "İade Edildi",
};

const TRANSITION_MATRIX: TransitionRule[] = [
  // Normal Operasyonel Akış (PAID -> PREPARING -> DELIVERED)
  {
    from: "PAID",
    to: "PREPARING",
    allowedRoles: ["ADMIN"],
    defaultRestoreStock: false,
    description: "Sipariş mutfakta hazırlanmaya başlandı.",
  },
  {
    from: "PREPARING",
    to: "DELIVERED",
    allowedRoles: ["ADMIN"],
    defaultRestoreStock: false,
    description: "Sipariş müşteriye teslim edildi.",
  },

  // İade Talebi Akışı (-> REFUND_REQUESTED)
  {
    from: "PAID",
    to: "REFUND_REQUESTED",
    allowedRoles: ["CUSTOMER", "ADMIN"],
    defaultRestoreStock: false,
    description: "Ödenmiş sipariş için iade talebi açıldı.",
  },
  {
    from: "PREPARING",
    to: "REFUND_REQUESTED",
    allowedRoles: ["CUSTOMER", "ADMIN"],
    defaultRestoreStock: false,
    description: "Hazırlanmakta olan sipariş için iade talebi açıldı.",
  },
  {
    from: "DELIVERED",
    to: "REFUND_REQUESTED",
    allowedRoles: ["CUSTOMER", "ADMIN"],
    defaultRestoreStock: false,
    description: "Teslim edilmiş sipariş için iade talebi açıldı.",
  },

  // İade Onayı ve Doğrudan İade Akışı (-> REFUNDED)
  {
    from: "REFUND_REQUESTED",
    to: "REFUNDED",
    allowedRoles: ["ADMIN", "CUSTOMER"],
    defaultRestoreStock: true,
    description: "İade talebi onaylandı ve tutar müşteriye iade edildi.",
  },
  {
    from: "PAID",
    to: "REFUNDED",
    allowedRoles: ["CUSTOMER", "ADMIN"],
    defaultRestoreStock: true,
    description: "Mutfağa girmeden iptal/iade edildi, stok geri yüklendi.",
  },
  {
    from: "PREPARING",
    to: "REFUNDED",
    allowedRoles: ["ADMIN"],
    defaultRestoreStock: false,
    description: "Hazırlık aşamasındaki sipariş yönetici tarafından iade edildi.",
  },
  {
    from: "DELIVERED",
    to: "REFUNDED",
    allowedRoles: ["CUSTOMER", "ADMIN"],
    defaultRestoreStock: true,
    description: "Teslim edilen sipariş iade edildi.",
  },
];

export class OrderFsmError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 409, code = "INVALID_STATE_TRANSITION") {
    super(message);
    this.name = "OrderFsmError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Verilen mevcut durumdan hedef duruma geçişin geçerli olup olmadığını doğrular.
 * Geçersizse deterministik OrderFsmError fırlatır.
 */
export function validateOrderTransition(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus,
  actorRole: UserRole,
): TransitionRule {
  // Çift iade (Double-Refund) kontrolü
  if (currentStatus === "REFUNDED" && (targetStatus === "REFUNDED" || targetStatus === "REFUND_REQUESTED")) {
    throw new OrderFsmError(
      "Bu sipariş zaten iade edilmiştir. Çift iade (double-refund) işlemi engellendi.",
      409,
      "DOUBLE_REFUND_PREVENTED",
    );
  }

  if (currentStatus === targetStatus) {
    throw new OrderFsmError(
      `Sipariş zaten '${ORDER_STATUS_LABELS[currentStatus]}' (${currentStatus}) durumunda.`,
      409,
      "ALREADY_IN_STATE",
    );
  }

  const rule = TRANSITION_MATRIX.find(
    (r) => r.from === currentStatus && r.to === targetStatus,
  );

  if (!rule) {
    throw new OrderFsmError(
      `Geçersiz sipariş durum geçişi: '${currentStatus}' durumundan '${targetStatus}' durumuna geçiş yapılamaz.`,
      409,
      "INVALID_STATE_TRANSITION",
    );
  }

  if (!rule.allowedRoles.includes(actorRole)) {
    throw new OrderFsmError(
      `'${actorRole}' rolü '${currentStatus}' -> '${targetStatus}' durum geçişini yapmaya yetkili değildir.`,
      403,
      "FORBIDDEN_STATE_TRANSITION",
    );
  }

  return rule;
}

/**
 * Belirli bir durum ve rol için izin verilen sonraki durumları döndürür.
 */
export function getAllowedNextStatuses(
  currentStatus: OrderStatus,
  actorRole: UserRole,
): OrderStatus[] {
  return TRANSITION_MATRIX
    .filter((r) => r.from === currentStatus && r.allowedRoles.includes(actorRole))
    .map((r) => r.to);
}
