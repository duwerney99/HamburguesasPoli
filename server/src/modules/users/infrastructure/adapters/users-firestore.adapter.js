import { COLLECTIONS, ROLES, documentIds } from '../../../../firestore/collections.js';
import { normalizeTimestamp } from '../../../../firestore/audit.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Users Repository
 */
export function createUsersFirestoreAdapter(firestore) {
  const col = name => firestore.collection(name);

  function mapUserDoc(doc) {
    if (!doc || !doc.exists) return null;
    const data = doc.data() || {};
    const numericId = Number(doc.id);
    return {
      id: Number.isFinite(numericId) ? numericId : doc.id,
      name: data.name || '',
      email: data.email || '',
      role: data.role || 'CLIENT',
      passwordHash: data.passwordHash || null,
      createdAt: normalizeTimestamp(data.createdAt)
    };
  }

  return {
    async findById(id) {
      const snap = await col(COLLECTIONS.users).doc(documentIds.user(id)).get();
      return mapUserDoc(snap);
    },

    async findByEmail(email) {
      const normalized = String(email || '').trim().toLowerCase();
      const snap = await col(COLLECTIONS.users).where('email', '==', normalized).limit(1).get();
      if (snap.empty) return null;
      return mapUserDoc(snap.docs[0]);
    },

    async create({ name, email, passwordHash, role = 'CLIENT' }) {
      const id = String(Date.now());
      const now = new Date().toISOString();
      const docRef = col(COLLECTIONS.users).doc(id);
      await docRef.set({
        name: String(name || '').trim(),
        email: String(email || '').trim().toLowerCase(),
        passwordHash,
        role: ROLES.includes(role) ? role : 'CLIENT',
        createdAt: now,
        updatedAt: now
      });
      return this.findById(id);
    },

    async updateRole(userId, role) {
      const docRef = col(COLLECTIONS.users).doc(documentIds.user(userId));
      const snap = await docRef.get();
      if (!snap.exists) return null;
      await docRef.update({
        role,
        updatedAt: new Date().toISOString()
      });
      return this.findById(userId);
    },

    async listPaginated({ page = 1, pageSize = 10, q = '', scope = 'ALL', role = 'ALL' } = {}) {
      const snap = await col(COLLECTIONS.users).get();
      const allUsers = snap.docs.map(mapUserDoc).filter(Boolean);
      const counts = { ALL: 0, STAFF: 0, ADMIN: 0, CHEF: 0, CLIENT: 0 };

      for (const u of allUsers) {
        counts.ALL += 1;
        counts[u.role] = (counts[u.role] || 0) + 1;
        if (u.role === 'ADMIN' || u.role === 'CHEF') counts.STAFF += 1;
      }

      const search = String(q || '').trim().toLowerCase();
      const normalizedScope = String(scope || 'ALL').trim().toUpperCase();
      const normalizedRole = String(role || 'ALL').trim().toUpperCase();

      const filtered = allUsers.filter(u => {
        if (normalizedScope === 'STAFF' && u.role !== 'ADMIN' && u.role !== 'CHEF') return false;
        if (normalizedScope === 'CLIENTS' && u.role !== 'CLIENT') return false;
        if (normalizedRole !== 'ALL' && u.role !== normalizedRole) return false;
        if (search) {
          return (
            u.name.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search) ||
            String(u.id).includes(search)
          );
        }
        return true;
      });

      const parsedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / parsedPageSize));
      const currentPage = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), totalPages);
      const offset = (currentPage - 1) * parsedPageSize;

      return {
        users: filtered.slice(offset, offset + parsedPageSize),
        roles: ROLES,
        counts,
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

