export function writeAudit(db, { actorUserId = null, action, entityType, entityId = null, metadata = {} }) {
  db.prepare(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    VALUES(?,?,?,?,?)`).run(actorUserId, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(metadata));
}

export function listAudit(db, limit = 100) {
  return db.prepare(`SELECT a.id,a.action,a.entity_type entityType,a.entity_id entityId,a.metadata,a.created_at createdAt,
    u.name actorName,u.email actorEmail
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
    ORDER BY a.id DESC LIMIT ?`).all(limit).map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}') }));
}
