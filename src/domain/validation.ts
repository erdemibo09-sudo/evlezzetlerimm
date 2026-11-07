import { assertPositiveKurus, assertValidKurus, parseTlToKurus } from "./money.ts";
import { OrderStatus } from "./orderFsm.ts";

export class ValidationError extends Error {
  public readonly statusCode = 400;
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  address: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ProductCreateInput {
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  portionInfo: string;
  allergens: string[];
  prepTimeMinutes: number;
  dailyStock: number;
  priceKurus: number;
  isFeatured: boolean;
}

export interface ProductUpdateInput {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  portionInfo?: string;
  allergens?: string[];
  prepTimeMinutes?: number;
  dailyStock?: number;
  priceKurus?: number;
  isFeatured?: boolean;
  isArchived?: boolean;
}

export interface CartItemInput {
  productId: string;
  quantity: number;
}

export interface CheckoutInput {
  items: CartItemInput[];
  deliveryAddress?: string;
  customerNote?: string;
  idempotencyKey?: string;
}

export interface RefundInput {
  reason: string;
  idempotencyKey?: string;
  restoreStock?: boolean;
  mode?: "REQUEST" | "EXECUTE";
}

function asString(val: unknown, field: string, minLen = 1, maxLen = 2000): string {
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

export function validateRegisterInput(body: Record<string, unknown>): RegisterInput {
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

  return { fullName, email, password, phone, address };
}

export function validateLoginInput(body: Record<string, unknown>): LoginInput {
  const email = asString(body.email, "E-posta", 3, 180).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    throw new ValidationError("Şifre gereklidir.", "password");
  }
  return { email, password };
}

function resolvePriceKurus(body: Record<string, unknown>): number {
  if (body.priceKurus !== undefined && body.priceKurus !== null && body.priceKurus !== "") {
    const pk = Number(body.priceKurus);
    try {
      assertPositiveKurus(pk, "Fiyat (Kuruş)");
    } catch (e) {
      throw new ValidationError((e as Error).message, "priceKurus");
    }
    return pk;
  }
  if (body.priceTl !== undefined && body.priceTl !== null && body.priceTl !== "") {
    try {
      const pk = parseTlToKurus(body.priceTl as string | number);
      assertPositiveKurus(pk, "Fiyat");
      return pk;
    } catch (e) {
      throw new ValidationError((e as Error).message, "priceTl");
    }
  }
  throw new ValidationError("Ürün fiyatı (priceKurus veya priceTl) belirtilmelidir.", "priceKurus");
}

function parseAllergens(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

export function validateProductCreateInput(body: Record<string, unknown>): ProductCreateInput {
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
    isFeatured,
  };
}

export function validateProductUpdateInput(body: Record<string, unknown>): ProductUpdateInput {
  const update: ProductUpdateInput = {};

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

export function validateCheckoutInput(body: Record<string, unknown>): CheckoutInput {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("Sepetiniz boş. Sipariş vermek için en az bir ürün eklemelisiniz.", "items");
  }

  const mergedMap = new Map<string, number>();
  for (const rawItem of body.items) {
    if (!rawItem || typeof rawItem !== "object") {
      throw new ValidationError("Geçersiz sepet kalemi.", "items");
    }
    const itemObj = rawItem as Record<string, unknown>;
    const productId = asString(itemObj.productId, "Ürün ID", 1, 100);
    const quantity = Number(itemObj.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      throw new ValidationError("Ürün adedi 1 ile 500 arasında bir tam sayı olmalıdır.", "quantity");
    }
    mergedMap.set(productId, (mergedMap.get(productId) ?? 0) + quantity);
  }

  const items: CartItemInput[] = Array.from(mergedMap.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  const deliveryAddress = body.deliveryAddress
    ? asString(body.deliveryAddress, "Teslimat Adresi", 5, 500)
    : undefined;
  const customerNote = body.customerNote
    ? asString(body.customerNote, "Sipariş Notu", 1, 500)
    : undefined;
  const idempotencyKey = body.idempotencyKey
    ? asString(body.idempotencyKey, "Idempotency Key", 4, 150)
    : undefined;

  return { items, deliveryAddress, customerNote, idempotencyKey };
}

export function validateRefundInput(body: Record<string, unknown>): RefundInput {
  const reason = body.reason
    ? asString(body.reason, "İade Nedeni", 3, 500)
    : "Müşteri talebiyle sipariş iadesi";
  const idempotencyKey = body.idempotencyKey
    ? asString(body.idempotencyKey, "Idempotency Key", 4, 150)
    : undefined;
  const restoreStock = body.restoreStock !== undefined ? Boolean(body.restoreStock) : undefined;
  const mode = body.mode === "REQUEST" ? "REQUEST" : "EXECUTE";
  return { reason, idempotencyKey, restoreStock, mode };
}

const VALID_STATUSES: OrderStatus[] = [
  "PAID",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "REFUND_REQUESTED",
  "REFUNDED",
];

export function validateOrderStatus(val: unknown): OrderStatus {
  if (typeof val !== "string" || !VALID_STATUSES.includes(val as OrderStatus)) {
    throw new ValidationError(`Geçersiz sipariş durumu: ${String(val)}`, "status");
  }
  return val as OrderStatus;
}
