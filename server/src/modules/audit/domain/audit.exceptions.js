import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Audit
 */
export class InvalidAuditQueryException extends DomainException {
  constructor(message = 'Parámetros de consulta de auditoría inválidos.') {
    super(message, { code: 'INVALID_AUDIT_QUERY', status: 400 });
  }
}

