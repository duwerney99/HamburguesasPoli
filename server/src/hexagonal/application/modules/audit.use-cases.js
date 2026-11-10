/**
 * MÓDULO DE APLICACIÓN: TRAZABILIDAD Y AUDITORÍA (Arquitectura Hexagonal)
 */

export function createAuditUseCases({ ports }) {
  return {
    async listPaginated(params) {
      return ports.audit.listPaginated(params);
    },

    async listRecent(limit = 100) {
      return ports.audit.list(limit);
    },

    async write(entry) {
      return ports.audit.write(entry);
    }
  };
}

