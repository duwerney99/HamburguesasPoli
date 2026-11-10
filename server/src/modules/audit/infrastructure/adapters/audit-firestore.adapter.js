import { COLLECTIONS } from '../../../../firestore/collections.js';
import { auditDocument, normalizeTimestamp } from '../../../../firestore/audit.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Audit Repository
 */
export function createAuditFirestoreAdapter(firestore) {
  const col = name => firestore.collection(name);

  return {
    async write(entry) {
      const id = String(Date.now());
      await col(COLLECTIONS.auditLogs).doc(id).set(auditDocument(entry));
    },

    async list(limit = 100) {
      const snap = await col(COLLECTIONS.auditLogs).get();
      return snap.docs
        .map(d => {
          const data = d.data() || {};
          return {
            id: d.id,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            metadata: data.metadata || {},
            createdAt: normalizeTimestamp(data.createdAt)
          };
        })
        .slice(0, limit);
    },

    async listPaginated({ page = 1, pageSize = 10, q = '', entityType = 'ALL' } = {}) {
      const entries = await this.list(500);
      const search = String(q || '').trim().toLowerCase();
      const normalizedEntity = String(entityType || 'ALL').trim().toUpperCase();

      const filtered = entries.filter(e => {
        if (normalizedEntity !== 'ALL' && String(e.entityType).toUpperCase() !== normalizedEntity) {
          return false;
        }
        if (search) {
          return JSON.stringify(e).toLowerCase().includes(search);
        }
        return true;
      });

      const parsedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / parsedPageSize));
      const currentPage = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), totalPages);
      const offset = (currentPage - 1) * parsedPageSize;

      return {
        entries: filtered.slice(offset, offset + parsedPageSize),
        pagination: {
          page: currentPage,
          pageSize: parsedPageSize,
          total,
          totalPages,
          hasPrev: currentPage > 1,
          hasNext: currentPage < totalPages
        }
      };
    }
  };
}

