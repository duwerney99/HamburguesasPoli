import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { appendAudit } from './audit.js';
import { COLLECTIONS, SUBCOLLECTIONS, documentIds } from './collections.js';

const now = () => FieldValue.serverTimestamp();

export function createFirestoreRepositories(db) {
  const ref = (collection, id) => db.collection(collection).doc(String(id));

  return {
    users: {
      async findById(id) {
        const [user, role] = await Promise.all([ref(COLLECTIONS.users, id).get(), ref(COLLECTIONS.roles, id).get()]);
        return user.exists ? { id: user.id, ...user.data(), role: role.data()?.role || 'CLIENT' } : null;
      },
      async findByEmail(email) {
        const result = await db.collection(COLLECTIONS.users).where('email', '==', email.toLowerCase()).limit(1).get();
        if (result.empty) return null;
        return this.findById(result.docs[0].id);
      },
      async setRole({ userId, role, actorUserId }) {
        const batch = db.batch();
        batch.set(ref(COLLECTIONS.roles, userId), { role, updatedAt: now(), updatedBy: String(actorUserId) }, { merge: true });
        appendAudit(db, { actorUserId, action: 'USER_ROLE_CHANGED', entityType: 'USER', entityId: userId, metadata: { role } }, batch);
        await batch.commit();
      }
    },
    burgers: {
      async list() {
        const result = await db.collection(COLLECTIONS.burgers).orderBy('createdAt', 'desc').get();
        return result.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      async get(id) {
        const doc = await ref(COLLECTIONS.burgers, id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
      }
    },
    votes: {
      async create({ campaignId, burgerId, userId }) {
        const voteRef = ref(COLLECTIONS.votes, documentIds.vote(campaignId, userId));
        const campaignRef = ref(COLLECTIONS.campaigns, campaignId);
        const candidateRef = campaignRef.collection(SUBCOLLECTIONS.campaignCandidates).doc(String(burgerId));
        await db.runTransaction(async transaction => {
          const [campaign, candidate, existing] = await Promise.all([
            transaction.get(campaignRef), transaction.get(candidateRef), transaction.get(voteRef)
          ]);
          if (!campaign.exists || campaign.data().status !== 'PUBLISHED') throw Object.assign(new Error('CAMPAIGN_NOT_OPEN'), { status: 409 });
          const data = campaign.data();
          if (Date.now() < data.startsAt.toMillis() || Date.now() >= data.endsAt.toMillis()) throw Object.assign(new Error('CAMPAIGN_NOT_OPEN'), { status: 409 });
          if (!candidate.exists) throw Object.assign(new Error('INVALID_CANDIDATE'), { status: 400 });
          if (existing.exists) throw Object.assign(new Error('DUPLICATE_VOTE'), { status: 409 });
          transaction.create(voteRef, { campaignId: String(campaignId), burgerId: String(burgerId), userId: String(userId), createdAt: now() });
          transaction.update(candidateRef, { voteCount: FieldValue.increment(1), updatedAt: now() });
        });
      }
    },
    orders: {
      async create({ userId, phone, deliveryAddress, notes, items, totalCop }) {
        const orderRef = db.collection(COLLECTIONS.orders).doc();
        const batch = db.batch();
        batch.create(orderRef, { userId: String(userId), phone, deliveryAddress, notes, totalCop, status: 'PENDING', createdAt: now(), updatedAt: now() });
        items.forEach(item => batch.create(orderRef.collection(SUBCOLLECTIONS.orderItems).doc(), item));
        batch.create(orderRef.collection(SUBCOLLECTIONS.orderEvents).doc(), { type: 'ORDER_CREATED', from: null, to: 'PENDING', actorUserId: String(userId), createdAt: now() });
        appendAudit(db, { actorUserId: userId, action: 'ORDER_CREATED', entityType: 'ORDER', entityId: orderRef.id, metadata: { totalCop } }, batch);
        await batch.commit();
        return orderRef.id;
      },
      async changeStatus({ orderId, from, to, actorUserId }) {
        const orderRef = ref(COLLECTIONS.orders, orderId);
        await db.runTransaction(async transaction => {
          const snapshot = await transaction.get(orderRef);
          if (!snapshot.exists) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
          if (snapshot.data().status !== from) throw Object.assign(new Error('ORDER_STATUS_CONFLICT'), { status: 409 });
          transaction.update(orderRef, { status: to, updatedAt: now() });
          transaction.create(orderRef.collection(SUBCOLLECTIONS.orderEvents).doc(), { type: 'STATUS_CHANGED', from, to, actorUserId: String(actorUserId), createdAt: now() });
          transaction.create(db.collection(COLLECTIONS.auditLogs).doc(), {
            actorUserId: String(actorUserId), action: 'ORDER_STATUS_CHANGED', entityType: 'ORDER', entityId: String(orderId), metadata: { from, to }, createdAt: now()
          });
        });
      }
    },
    campaigns: {
      async create(data, actorUserId) {
        const campaignRef = db.collection(COLLECTIONS.campaigns).doc();
        const batch = db.batch();
        batch.create(campaignRef, { ...data, startsAt: Timestamp.fromDate(new Date(data.startsAt)), endsAt: Timestamp.fromDate(new Date(data.endsAt)), createdAt: now(), updatedAt: now() });
        data.burgerIds.forEach(burgerId => batch.create(campaignRef.collection(SUBCOLLECTIONS.campaignCandidates).doc(String(burgerId)), { burgerId: String(burgerId), voteCount: 0, createdAt: now() }));
        appendAudit(db, { actorUserId, action: 'CAMPAIGN_CREATED', entityType: 'CAMPAIGN', entityId: campaignRef.id, metadata: { status: data.status } }, batch);
        await batch.commit();
        return campaignRef.id;
      }
    }
  };
}
