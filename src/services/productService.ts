import { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../db/database.ts";
import { formatKurus } from "../domain/money.ts";
import { ProductCreateInput, ProductUpdateInput, ValidationError } from "../domain/validation.ts";
import { AuthenticatedUser } from "./authService.ts";
import { writeAuditLog } from "./auditService.ts";
import { generateId } from "./cryptoUtils.ts";

export interface ProductRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  portionInfo: string;
  allergens: string[];
  prepTimeMinutes: number;
  dailyStock: number;
  priceKurus: number;
  priceFormatted: string;
  isFeatured: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RawProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  image_url: string;
  portion_info: string;
  allergens_json: string;
  prep_time_minutes: number;
  daily_stock: number;
  price_kurus: number;
  is_featured: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

function mapProductRow(row: RawProductRow): ProductRecord {
  let allergens: string[] = [];
  try {
    allergens = JSON.parse(row.allergens_json);
  } catch {
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
    updatedAt: row.updated_at,
  };
}

function slugifyTurkish(text: string): string {
  const trMap: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
    ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  };
  const replaced = text
    .split("")
    .map((c) => trMap[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${replaced || "urun"}-${Math.random().toString(36).slice(2, 6)}`;
}

export function listProducts(
  db: DatabaseSync,
  options?: { includeArchived?: boolean; category?: string; search?: string },
): ProductRecord[] {
  const includeArchived = options?.includeArchived ?? false;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

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
  const rows = db
    .prepare(`
      SELECT * FROM products
      ${whereClause}
      ORDER BY is_archived ASC, is_featured DESC, created_at DESC
    `)
    .all(...params) as unknown as RawProductRow[];

  return rows.map(mapProductRow);
}

export function getProductById(db: DatabaseSync, id: string): ProductRecord | null {
  const row = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(id) as RawProductRow | undefined;
  return row ? mapProductRow(row) : null;
}

export function createProduct(
  db: DatabaseSync,
  actor: AuthenticatedUser,
  input: ProductCreateInput,
): ProductRecord {
  return withTransaction(db, () => {
    const id = generateId("prd");
    const slug = slugifyTurkish(input.name);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO products (
        id, slug, name, description, category, image_url, portion_info,
        allergens_json, prep_time_minutes, daily_stock, price_kurus,
        is_featured, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      slug,
      input.name,
      input.description,
      input.category,
      input.imageUrl,
      input.portionInfo,
      JSON.stringify(input.allergens),
      input.prepTimeMinutes,
      input.dailyStock,
      input.priceKurus,
      input.isFeatured ? 1 : 0,
      now,
      now,
    );

    const created = getProductById(db, id)!;

    writeAuditLog(db, {
      actor,
      action: "PRODUCT_CREATED",
      entityType: "PRODUCT",
      entityId: id,
      oldData: null,
      newData: created,
    });

    return created;
  });
}

export function updateProduct(
  db: DatabaseSync,
  actor: AuthenticatedUser,
  productId: string,
  input: ProductUpdateInput,
): ProductRecord {
  return withTransaction(db, () => {
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
    `).run(
      updatedName,
      updatedDescription,
      updatedCategory,
      updatedImageUrl,
      updatedPortionInfo,
      JSON.stringify(updatedAllergens),
      updatedPrepTime,
      updatedDailyStock,
      updatedPriceKurus,
      updatedIsFeatured ? 1 : 0,
      updatedIsArchived ? 1 : 0,
      now,
      productId,
    );

    const updated = getProductById(db, productId)!;

    writeAuditLog(db, {
      actor,
      action: "PRODUCT_UPDATED",
      entityType: "PRODUCT",
      entityId: productId,
      oldData: existing,
      newData: updated,
    });

    return updated;
  });
}

/**
 * Ürünü vitrinden kaldırır / siler (Soft-delete / Arşivleme + opsiyonel kalıcı silme).
 * Geçmiş siparişlerin (order_items snapshot) tutar ve veri bütünlüğü asla bozulmaz.
 */
export function deleteOrArchiveProduct(
  db: DatabaseSync,
  actor: AuthenticatedUser,
  productId: string,
  hardDelete = false,
): { archived: boolean; deleted: boolean; product: ProductRecord } {
  return withTransaction(db, () => {
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
        newData: { deleted: true },
      });
      return { archived: true, deleted: true, product: { ...existing, isArchived: true } };
    }

    db.prepare(`
      UPDATE products
      SET is_archived = 1, daily_stock = 0, updated_at = ?
      WHERE id = ?
    `).run(now, productId);

    const updated = getProductById(db, productId)!;

    writeAuditLog(db, {
      actor,
      action: "PRODUCT_ARCHIVED",
      entityType: "PRODUCT",
      entityId: productId,
      oldData: existing,
      newData: updated,
    });

    return { archived: true, deleted: false, product: updated };
  });
}
