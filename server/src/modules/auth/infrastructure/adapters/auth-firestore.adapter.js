/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Auth Tokens Repository
 */
export function createAuthFirestoreAdapter(firestore) {
  return {
    async saveRefreshToken({ jti, userId, expiresAt }) {
      await firestore.collection('refreshTokens').doc(String(jti)).set({
        jti: String(jti),
        userId: String(userId),
        expiresAt: String(expiresAt),
        revoked: false,
        createdAt: new Date().toISOString()
      });
    },

    async findActiveByJti(jti) {
      const snap = await firestore.collection('refreshTokens').doc(String(jti)).get();
      if (!snap.exists) return null;
      const data = snap.data();
      if (data.revoked) return null;
      if (new Date(data.expiresAt).getTime() <= Date.now()) return null;
      return {
        jti: data.jti,
        userId: data.userId,
        expiresAt: data.expiresAt,
        revoked: Boolean(data.revoked)
      };
    },

    async revokeByJti(jti) {
      const ref = firestore.collection('refreshTokens').doc(String(jti));
      const snap = await ref.get();
      if (snap.exists) {
        await ref.set({ ...snap.data(), revoked: true }, { merge: true });
      }
    }
  };
}

