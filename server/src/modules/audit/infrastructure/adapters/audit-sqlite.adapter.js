import { listAudit, listAuditPaginated, writeAudit } from '../../../audit.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Audit Repository
 */
export function createAuditSqliteAdapter(db) {
  return {
    async write(entry) {
      writeAudit(db, entry);
    },

    async list(limit = 100) {
      return listAudit(db, limit);
    },

    async listPaginated(params = {}) {
      return listAuditPaginated(db, params);
    }
  };
}

