/**
 * PROYECCIONES DE DOMINIO: Módulo Audit
 */
export function toAuditEntryProjection(entry) {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    actorName: entry.actorName || null,
    actorEmail: entry.actorEmail || null,
    metadata:
      typeof entry.metadata === 'string'
        ? JSON.parse(entry.metadata || '{}')
        : entry.metadata || {},
    createdAt: entry.createdAt
  };
}

