import { AUDIT_REPOSITORY_INTERFACE } from './audit.interfaces.js';

/**
 * REPOSITORY PORT: Puerto de persistencia de Auditoría
 */
export function assertAuditRepositoryPort(port) {
  for (const method of AUDIT_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`AuditRepositoryPort incumple el método requerido: audit.${method}()`);
    }
  }
  return port;
}

