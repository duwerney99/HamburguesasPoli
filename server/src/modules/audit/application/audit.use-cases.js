/**
 * APPLICATION LAYER: Casos de Uso del Módulo Audit
 * Ubicación: server/src/modules/audit/application/audit.use-cases.js
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
