import { listUsersPaginated, publicUser, userWithRole } from '../../../users.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Users Repository
 */
export function createUsersSqliteAdapter(db) {
  return {
    async findById(id) {
      const row = userWithRole(db, 'u.id=?', Number(id));
      if (!row) return null;
      return {
        ...publicUser(row),
        passwordHash: row.password_hash,
        createdAt: row.created_at
      };
    },

    async findByEmail(email) {
      const row = userWithRole(db, 'u.email=?', String(email || '').trim().toLowerCase());
      if (!row) return null;
      return {
        ...publicUser(row),
        passwordHash: row.password_hash,
        createdAt: row.created_at
      };
    },

    async create({ name, email, passwordHash, role = 'CLIENT' }) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const result = db
        .prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)')
        .run(name, normalizedEmail, passwordHash, role);
      const userId = Number(result.lastInsertRowid);
      db.prepare('INSERT OR REPLACE INTO user_roles(user_id,role) VALUES(?,?)').run(userId, role);
      return this.findById(userId);
    },

    async updateRole(userId, role) {
      const numericId = Number(userId);
      const exists = db.prepare('SELECT id FROM users WHERE id=?').get(numericId);
      if (!exists) return null;
      db.prepare(
        `INSERT INTO user_roles(user_id,role) VALUES(?,?)
         ON CONFLICT(user_id) DO UPDATE SET role=excluded.role`
      ).run(numericId, role);
      return publicUser(userWithRole(db, 'u.id=?', numericId));
    },

    async listPaginated(params = {}) {
      return listUsersPaginated(db, params);
    }
  };
}

