import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { OrderFsmError } from "./domain/orderFsm.ts";
import {
  validateCheckoutInput,
  validateLoginInput,
  validateOrderStatus,
  validateProductCreateInput,
  validateProductUpdateInput,
  validateRefundInput,
  validateRegisterInput,
  ValidationError,
} from "./domain/validation.ts";
import { listAuditLogs } from "./services/auditService.ts";
import {
  AuthError,
  getAuthenticatedUser,
  loginUser,
  logoutSession,
  registerUser,
  requireAdmin,
  requireAuth,
  updateUserProfile,
} from "./services/authService.ts";
import { EmailEventType, listOutboxEmails, processEmailOutbox } from "./services/emailService.ts";
import {
  calculateServerCartQuote,
  createOrderAtomic,
  getAdminDashboardStats,
  getOrderById,
  listAllOrdersForAdmin,
  listOrdersForUser,
  refundOrderAtomic,
  StockConflictError,
  updateOrderStatusByAdmin,
} from "./services/orderService.ts";
import {
  createProduct,
  deleteOrArchiveProduct,
  getProductById,
  listProducts,
  updateProduct,
} from "./services/productService.ts";
import {
  deleteRowInSupabase,
  pullFromSupabaseIfNeeded,
  pushAllToSupabase,
} from "./services/supabaseSync.ts";
import { renderIndexHtml } from "./ui/indexHtml.ts";

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(extraHeaders ?? {}),
    },
  });
}

async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError("İstek gövdesi geçerli bir JSON nesnesi olmalıdır.");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError("Geçersiz JSON formatı.");
  }
}

export function createApp(
  db: DatabaseSync,
  options?: { enableSupabaseSync?: boolean },
) {
  const syncEnabled = options?.enableSupabaseSync ?? false;

  async function handleCoreRequest(req: Request): Promise<Response> {
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
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (method === "GET" && path === "/default-food.svg") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><rect width="600" height="400" fill="#9a3412"/><text x="300" y="220" font-size="96" text-anchor="middle">🍲</text></svg>`;
        return new Response(svg, {
          status: 200,
          headers: { "content-type": "image/svg+xml; charset=utf-8" },
        });
      }

      // 1.b Yüklenen Ürün Görsellerini Sunma (/uploads/*)
      const uploadMatch = path.match(/^\/uploads\/([a-zA-Z0-9._-]+)$/);
      if (method === "GET" && uploadMatch) {
        const filename = uploadMatch[1];
        try {
          const fileBytes = await readFile(`./public/uploads/${filename}`);
          const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
          const mimeMap: Record<string, string> = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
            svg: "image/svg+xml",
          };
          return new Response(new Uint8Array(fileBytes), {
            status: 200,
            headers: {
              "content-type": mimeMap[ext] ?? "application/octet-stream",
              "cache-control": "public, max-age=86400",
            },
          });
        } catch {
          return jsonResponse({ error: "Görsel bulunamadı." }, 404);
        }
      }

      // 2. Kimlik Doğrulama (Auth) Uç Noktaları
      if (method === "POST" && path === "/api/auth/register") {
        const body = await parseJsonBody(req);
        const input = validateRegisterInput(body);
        const { user, sessionToken, setCookieHeader } = registerUser(db, input);
        return jsonResponse(
          { user, sessionToken },
          201,
          { "set-cookie": setCookieHeader },
        );
      }

      if (method === "POST" && path === "/api/auth/login") {
        const body = await parseJsonBody(req);
        const input = validateLoginInput(body);
        const { user, sessionToken, setCookieHeader } = loginUser(db, input);
        return jsonResponse(
          { user, sessionToken },
          200,
          { "set-cookie": setCookieHeader },
        );
      }

      if (method === "POST" && path === "/api/auth/logout") {
        const clearCookie = logoutSession(db, req);
        return jsonResponse({ ok: true }, 200, { "set-cookie": clearCookie });
      }

      if (method === "GET" && path === "/api/auth/me") {
        const user = getAuthenticatedUser(db, req);
        if (!user) {
          return jsonResponse({ user: null }, 401);
        }
        return jsonResponse({ user }, 200);
      }

      if (method === "PUT" && path === "/api/auth/profile") {
        const user = requireAuth(db, req);
        const body = await parseJsonBody(req);
        const updatedUser = updateUserProfile(db, user, body);
        return jsonResponse({ user: updatedUser }, 200);
      }

      // 3. Vitrin Ürün Uç Noktaları
      if (method === "GET" && path === "/api/products") {
        const category = url.searchParams.get("category") ?? undefined;
        const search = url.searchParams.get("search") ?? undefined;
        const products = listProducts(db, { includeArchived: false, category, search });
        return jsonResponse({ products }, 200);
      }

      const productDetailMatch = path.match(/^\/api\/products\/([^/]+)$/);
      if (method === "GET" && productDetailMatch) {
        const product = getProductById(db, decodeURIComponent(productDetailMatch[1]));
        if (!product || product.isArchived) {
          return jsonResponse({ error: "Ürün bulunamadı." }, 404);
        }
        return jsonResponse({ product }, 200);
      }

      // 4. Sunucu Tarafı Sepet Doğrulama & Sipariş Uç Noktaları
      if (method === "POST" && path === "/api/cart/quote") {
        const body = await parseJsonBody(req);
        const input = validateCheckoutInput(body);
        const quote = calculateServerCartQuote(db, input.items);
        return jsonResponse({ quote }, 200);
      }

      if (method === "POST" && path === "/api/orders") {
        const user = requireAuth(db, req);
        const body = await parseJsonBody(req);
        const input = validateCheckoutInput(body);
        const order = createOrderAtomic(db, user, input);
        return jsonResponse({ order }, 201);
      }

      if (method === "GET" && path === "/api/orders/my") {
        const user = requireAuth(db, req);
        const orders = listOrdersForUser(db, user.id);
        return jsonResponse({ orders }, 200);
      }

      const orderDetailMatch = path.match(/^\/api\/orders\/([^/]+)$/);
      if (method === "GET" && orderDetailMatch) {
        const user = requireAuth(db, req);
        const order = getOrderById(db, decodeURIComponent(orderDetailMatch[1]));
        if (!order) {
          return jsonResponse({ error: "Sipariş bulunamadı." }, 404);
        }
        if (user.role !== "ADMIN" && order.userId !== user.id) {
          return jsonResponse({ error: "Bu siparişi görüntüleme yetkiniz yok." }, 403);
        }
        return jsonResponse({ order }, 200);
      }

      const orderRefundMatch = path.match(/^\/api\/orders\/([^/]+)\/refund$/);
      if (method === "POST" && orderRefundMatch) {
        const user = requireAuth(db, req);
        const orderId = decodeURIComponent(orderRefundMatch[1]);
        const body = await parseJsonBody(req);
        const input = validateRefundInput(body);
        const order = refundOrderAtomic(db, user, orderId, input);
        return jsonResponse({ order }, 200);
      }

      // 5. E-Posta Kuyruğu (Transactional Outbox) Görüntüleme
      if (method === "GET" && path === "/api/emails") {
        const user = requireAuth(db, req);
        processEmailOutbox(db);
        const orderId = url.searchParams.get("orderId") ?? undefined;
        const eventType = (url.searchParams.get("eventType") as EmailEventType | null) ?? undefined;

        if (user.role === "ADMIN") {
          const emails = listOutboxEmails(db, { orderId, eventType, limit: 200 });
          return jsonResponse({ emails }, 200);
        } else {
          const emails = listOutboxEmails(db, {
            recipientEmail: user.email,
            orderId,
            eventType,
            limit: 100,
          });
          return jsonResponse({ emails }, 200);
        }
      }

      // 6. YÖNETİCİ PANELİ (ADMIN) UÇ NOKTALARI — KATI RBAC KORUMALI
      if (path.startsWith("/api/admin/")) {
        const admin = requireAdmin(db, req);

        if (method === "GET" && path === "/api/admin/stats") {
          const stats = getAdminDashboardStats(db);
          return jsonResponse({ stats }, 200);
        }

        if (method === "GET" && path === "/api/admin/products") {
          const products = listProducts(db, { includeArchived: true });
          return jsonResponse({ products }, 200);
        }

        if (method === "POST" && path === "/api/admin/products") {
          const body = await parseJsonBody(req);
          const input = validateProductCreateInput(body);
          const product = createProduct(db, admin, input);
          return jsonResponse({ product }, 201);
        }

        const adminProductMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
        if (adminProductMatch) {
          const productId = decodeURIComponent(adminProductMatch[1]);
          if (method === "PUT" || method === "PATCH") {
            const body = await parseJsonBody(req);
            const input = validateProductUpdateInput(body);
            const product = updateProduct(db, admin, productId, input);
            return jsonResponse({ product }, 200);
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
          const orders = listAllOrdersForAdmin(db, { status, search });
          return jsonResponse({ orders }, 200);
        }

        const adminOrderStatusMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
        if (method === "POST" && adminOrderStatusMatch) {
          const orderId = decodeURIComponent(adminOrderStatusMatch[1]);
          const body = await parseJsonBody(req);
          const targetStatus = validateOrderStatus(body.status);
          const reason = typeof body.reason === "string" ? body.reason : undefined;
          const order = updateOrderStatusByAdmin(db, admin, orderId, targetStatus, reason);
          return jsonResponse({ order }, 200);
        }

        const adminOrderRefundMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/refund$/);
        if (method === "POST" && adminOrderRefundMatch) {
          const orderId = decodeURIComponent(adminOrderRefundMatch[1]);
          const body = await parseJsonBody(req);
          const input = validateRefundInput(body);
          const order = refundOrderAtomic(db, admin, orderId, input);
          return jsonResponse({ order }, 200);
        }

        if (method === "GET" && path === "/api/admin/audit-logs") {
          const logs = listAuditLogs(db, 150);
          return jsonResponse({ logs }, 200);
        }
      }

      return jsonResponse({ error: `Uç nokta bulunamadı: ${method} ${path}` }, 404);
    } catch (err) {
      if (err instanceof ValidationError) {
        return jsonResponse({ error: err.message, field: err.field }, 400);
      }
      if (err instanceof AuthError) {
        return jsonResponse({ error: err.message }, err.statusCode);
      }
      if (err instanceof StockConflictError) {
        return jsonResponse({ error: err.message, code: err.code }, err.statusCode);
      }
      if (err instanceof OrderFsmError) {
        return jsonResponse({ error: err.message, code: err.code }, err.statusCode);
      }
      console.error("Unhandled API Error:", err);
      return jsonResponse(
        { error: err instanceof Error ? err.message : "Beklenmeyen sunucu hatası." },
        500,
      );
    }
  }

  async function handleRequest(req: Request): Promise<Response> {
    const res = await handleCoreRequest(req);
    const method = req.method.toUpperCase();
    const url = new URL(req.url);
    if (
      syncEnabled &&
      url.pathname.startsWith("/api/") &&
      method !== "GET" &&
      method !== "HEAD" &&
      res.status >= 200 &&
      res.status < 300
    ) {
      await pushAllToSupabase(db);
    }
    return res;
  }

  return {
    fetch: handleRequest,
  };
}
