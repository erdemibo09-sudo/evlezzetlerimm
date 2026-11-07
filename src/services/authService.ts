import { DatabaseSync } from "node:sqlite";
import {
  createSignedSessionToken,
  generateId,
  hashPassword,
  verifyAndHashSessionToken,
  verifyPassword,
} from "./cryptoUtils.ts";
import { LoginInput, RegisterInput, ValidationError } from "../domain/validation.ts";
import { UserRole } from "../domain/orderFsm.ts";

export const SESSION_COOKIE_NAME = "evyemek_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  address: string;
  role: UserRole;
  createdAt: string;
}

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: 401 | 403 = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export function registerUser(
  db: DatabaseSync,
  input: RegisterInput,
): { user: AuthenticatedUser; sessionToken: string; setCookieHeader: string } {
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(input.email) as { id: string } | undefined;

  if (existing) {
    throw new ValidationError("Bu e-posta adresi ile kayıtlı bir hesap zaten mevcut.", "email");
  }

  const now = new Date().toISOString();
  const userId = generateId("usr");
  const passwordHash = hashPassword(input.password);
  const role: UserRole = "CUSTOMER";

  db.prepare(`
    INSERT INTO users (id, email, full_name, phone, address, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    input.email,
    input.fullName,
    input.phone,
    input.address,
    passwordHash,
    role,
    now,
  );

  const user: AuthenticatedUser = {
    id: userId,
    email: input.email,
    fullName: input.fullName,
    phone: input.phone,
    address: input.address,
    role,
    createdAt: now,
  };

  const { rawToken, setCookieHeader } = issueSessionForUser(db, userId);
  return { user, sessionToken: rawToken, setCookieHeader };
}

export function loginUser(
  db: DatabaseSync,
  input: LoginInput,
): { user: AuthenticatedUser; sessionToken: string; setCookieHeader: string } {
  const adminAliases = [
    "evlezzetlerimm@gmail.com",
    "admin@evlezzetlerimm.com",
    "admin@evlezzetlerim.com",
    "admin@evyemeklerim.com",
    "admin@evyemeklerimm.com",
  ];
  const isAdminAlias = adminAliases.includes(input.email.toLowerCase());
  const row = (isAdminAlias
    ? db
      .prepare(`
        SELECT id, email, full_name, phone, address, password_hash, role, created_at
        FROM users WHERE email = ? OR role = 'ADMIN'
        LIMIT 1
      `)
      .get(input.email)
    : db
      .prepare(`
        SELECT id, email, full_name, phone, address, password_hash, role, created_at
        FROM users WHERE email = ?
      `)
      .get(input.email)) as {
      id: string;
      email: string;
      full_name: string;
      phone: string;
      address: string;
      password_hash: string;
      role: UserRole;
      created_at: string;
    } | undefined;

  if (!row || !verifyPassword(input.password, row.password_hash)) {
    throw new AuthError("E-posta adresi veya şifre hatalı.", 401);
  }

  const user: AuthenticatedUser = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address,
    role: row.role,
    createdAt: row.created_at,
  };

  const { rawToken, setCookieHeader } = issueSessionForUser(db, user.id);
  return { user, sessionToken: rawToken, setCookieHeader };
}

export function issueSessionForUser(
  db: DatabaseSync,
  userId: string,
): { rawToken: string; setCookieHeader: string } {
  const { rawToken, tokenHash } = createSignedSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt.toISOString(), now.toISOString());

  const maxAgeSec = Math.floor(SESSION_DURATION_MS / 1000);
  const setCookieHeader =
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}`;

  return { rawToken, setCookieHeader };
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export function extractRawTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...vParts] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME) {
      return decodeURIComponent(vParts.join("="));
    }
  }
  return null;
}

export function getAuthenticatedUser(
  db: DatabaseSync,
  req: Request,
): AuthenticatedUser | null {
  const rawToken = extractRawTokenFromRequest(req);
  if (!rawToken) return null;

  const tokenHash = verifyAndHashSessionToken(rawToken);
  if (!tokenHash) return null;

  const row = db
    .prepare(`
      SELECT
        s.expires_at,
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.address,
        u.role,
        u.created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash) as {
      expires_at: string;
      id: string;
      email: string;
      full_name: string;
      phone: string;
      address: string;
      role: UserRole;
      created_at: string;
    } | undefined;

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function logoutSession(db: DatabaseSync, req: Request): string {
  const rawToken = extractRawTokenFromRequest(req);
  if (rawToken) {
    const tokenHash = verifyAndHashSessionToken(rawToken);
    if (tokenHash) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    }
  }
  return buildClearSessionCookie();
}

export function requireAuth(db: DatabaseSync, req: Request): AuthenticatedUser {
  const user = getAuthenticatedUser(db, req);
  if (!user) {
    throw new AuthError("Bu işlemi gerçekleştirmek için giriş yapmalısınız.", 401);
  }
  return user;
}

export function requireAdmin(db: DatabaseSync, req: Request): AuthenticatedUser {
  const user = requireAuth(db, req);
  if (user.role !== "ADMIN") {
    throw new AuthError(
      "Yetkisiz erişim: Bu işlem yalnızca YÖNETİCİ (ADMIN) yetkisine sahip kullanıcılar içindir.",
      403,
    );
  }
  return user;
}

export function updateUserProfile(
  db: DatabaseSync,
  user: AuthenticatedUser,
  body: Record<string, unknown>,
): AuthenticatedUser {
  const fullName = typeof body.fullName === "string" && body.fullName.trim().length >= 2
    ? body.fullName.trim()
    : user.fullName;
  const phone = typeof body.phone === "string" ? body.phone.trim() : user.phone;
  const address = typeof body.address === "string" ? body.address.trim() : user.address;

  if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
    if (body.newPassword.length < 6) {
      throw new ValidationError("Yeni şifre en az 6 karakter olmalıdır.", "newPassword");
    }
    const newHash = hashPassword(body.newPassword);
    db.prepare(`
      UPDATE users SET full_name = ?, phone = ?, address = ?, password_hash = ? WHERE id = ?
    `).run(fullName, phone, address, newHash, user.id);
  } else {
    db.prepare(`
      UPDATE users SET full_name = ?, phone = ?, address = ? WHERE id = ?
    `).run(fullName, phone, address, user.id);
  }

  return {
    ...user,
    fullName,
    phone,
    address,
  };
}
