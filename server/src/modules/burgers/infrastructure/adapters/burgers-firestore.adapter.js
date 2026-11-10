import { COLLECTIONS, documentIds } from '../../../../firestore/collections.js';
import { normalizeTimestamp } from '../../../../firestore/audit.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Burgers Repository
 */
export function createBurgersFirestoreAdapter(firestore) {
  const col = name => firestore.collection(name);

  function mapBurgerDoc(doc) {
    if (!doc || !doc.exists) return null;
    const data = doc.data() || {};
    const numericId = Number(doc.id);
    return {
      id: Number.isFinite(numericId) ? numericId : doc.id,
      name: data.name || '',
      description: data.description || '',
      ingredients: data.ingredients || '',
      priceCop: Number(data.priceCop || 0),
      imageUrl: data.imageUrl || '',
      active: Boolean(data.active),
      deletedAt: normalizeTimestamp(data.deletedAt)
    };
  }

  return {
    async list({ includeInactive = false } = {}) {
      const snap = await col(COLLECTIONS.burgers).get();
      return snap.docs
        .map(mapBurgerDoc)
        .filter(b => b && !b.deletedAt && (includeInactive || b.active))
        .sort((a, b) => Number(b.id) - Number(a.id));
    },

    async findById(id) {
      const snap = await col(COLLECTIONS.burgers).doc(documentIds.burger(id)).get();
      const burger = mapBurgerDoc(snap);
      return burger && !burger.deletedAt ? burger : null;
    },

    async create({ name, description, ingredients, priceCop = 28000, imageUrl, active = true }) {
      const id = String(Date.now());
      const now = new Date().toISOString();
      await col(COLLECTIONS.burgers)
        .doc(id)
        .set({
          name: String(name || '').trim(),
          description: String(description || '').trim(),
          ingredients: String(ingredients || '').trim(),
          priceCop: Number(priceCop || 28000),
          imageUrl: String(imageUrl || '').trim(),
          active: Boolean(active),
          deletedAt: null,
          createdAt: now,
          updatedAt: now
        });
      return this.findById(id);
    },

    async update(id, { name, description, ingredients, priceCop = 28000, imageUrl, active = true }) {
      const docRef = col(COLLECTIONS.burgers).doc(documentIds.burger(id));
      const snap = await docRef.get();
      if (!snap.exists || snap.data()?.deletedAt) return null;
      await docRef.update({
        name: String(name || '').trim(),
        description: String(description || '').trim(),
        ingredients: String(ingredients || '').trim(),
        priceCop: Number(priceCop || 28000),
        imageUrl: String(imageUrl || '').trim(),
        active: Boolean(active),
        updatedAt: new Date().toISOString()
      });
      return this.findById(id);
    },

    async softDelete(id) {
      const docRef = col(COLLECTIONS.burgers).doc(documentIds.burger(id));
      const snap = await docRef.get();
      if (!snap.exists || snap.data()?.deletedAt) return false;
      const now = new Date().toISOString();
      await docRef.update({ active: false, deletedAt: now, updatedAt: now });
      return true;
    }
  };
}

