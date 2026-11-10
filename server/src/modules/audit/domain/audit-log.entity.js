import { AuditActionValueObject } from './audit-action.value-object.js';

/**
 * ENTIDAD DE DOMINIO: Registro de Auditoría (Módulo Audit)
 */
export class AuditLogEntity {
  constructor({
    id = null,
    actorUserId = null,
    actorName = null,
    actorEmail = null,
    action,
    entityType,
    entityId = null,
    metadata = {},
    createdAt = null
  }) {
    this.id = id;
    this.actorUserId = actorUserId;
    this.actorName = actorName;
    this.actorEmail = actorEmail;
    this.actionVO = new AuditActionValueObject(action);
    this.action = this.actionVO.toString();
    this.entityType = String(entityType || '').trim().toUpperCase();
    this.entityId = entityId == null ? null : String(entityId);
    this.metadata = metadata || {};
    this.createdAt = createdAt || new Date().toISOString();
  }
}

