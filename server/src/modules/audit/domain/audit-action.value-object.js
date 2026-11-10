import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * VALUE OBJECT: Acción de Auditoría
 */
export class AuditActionValueObject {
  constructor(rawAction) {
    const normalized = String(rawAction || '').trim().toUpperCase();
    if (!normalized) {
      throw DomainException.badRequest('La acción de auditoría es obligatoria.', 'INVALID_AUDIT_ACTION');
    }
    this.value = normalized;
  }

  toString() {
    return this.value;
  }
}

