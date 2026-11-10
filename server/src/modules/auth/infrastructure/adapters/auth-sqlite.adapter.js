/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Auth Tokens Repository
 */
export function createAuthSqliteAdapter(db) {
  return {
    async saveRefreshToken({ jti, userId, expiresAt }) {
      db.prepare('INSERT INTO refresh_tokens(jti,user_id,expires_at) VALUES(?,?,?)').run(
        String(jti),
        Number(userId),
        String(expiresAt)
      );
    },

    async findActiveByJti(jti) {
      const row = db
        .prepare('SELECT jti,user_id userId,expires_at expiresAt,revoked FROM refresh_tokens WHERE jti=?')
        .get(String(jti));
      if (!row || row.revoked) return null;
      if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
      return {
        jti: row.jti,
        userId: Number(row.userId),
        expiresAt: row.expiresAt,
        revoked: Boolean(row.revoked)
      };
    },

    async revokeByJti(jti) {
      db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE jti=?').run(String(jti));
    }
  };
}

