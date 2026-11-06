import { DatabaseSync } from "node:sqlite";
import { generateId } from "./cryptoUtils.ts";
import { AuthenticatedUser } from "./authService.ts";

export interface AuditLogRecord {
  id: string;
  actorUserId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
}

export function writeAuditLog(
  db: DatabaseSync,
  params: {
    actor: Pick<AuthenticatedUser, "id" | "email" | "role">;
    action: string;
    entityType: string;
    entityId: string;
    oldData?: unknown;
    newData?: unknown;
  },
): AuditLogRecord {
  const id = generateId("aud");
  const now = new Date().toISOString();
  const oldJson = params.oldData !== undefined ? JSON.stringify(params.oldData) : null;
  const newJson = params.newData !== undefined ? JSON.stringify(params.newData) : null;

  db.prepare(`
    INSERT INTO audit_logs (
      id, actor_user_id, actor_email, actor_role,
      action, entity_type, entity_id, old_data_json, new_data_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.actor.id,
    params.actor.email,
    params.actor.role,
    params.action,
    params.entityType,
    params.entityId,
    oldJson,
    newJson,
    now,
  );

  return {
    id,
    actorUserId: params.actor.id,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldData: params.oldData ?? null,
    newData: params.newData ?? null,
    createdAt: now,
  };
}

export function listAuditLogs(db: DatabaseSync, limit = 100): AuditLogRecord[] {
  const rows = db.prepare(`
    SELECT
      id, actor_user_id, actor_email, actor_role,
      action, entity_type, entity_id, old_data_json, new_data_json, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string;
    actor_user_id: string;
    actor_email: string;
    actor_role: string;
    action: string;
    entity_type: string;
    entity_id: string;
    old_data_json: string | null;
    new_data_json: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id,
    actorEmail: r.actor_email,
    actorRole: r.actor_role,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    oldData: r.old_data_json ? JSON.parse(r.old_data_json) : null,
    newData: r.new_data_json ? JSON.parse(r.new_data_json) : null,
    createdAt: r.created_at,
  }));
}
