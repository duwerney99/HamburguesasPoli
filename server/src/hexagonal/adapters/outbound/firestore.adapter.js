/**
 * ADAPTADOR SECUNDARIO / SALIDA: FIREBASE CLOUD FIRESTORE (Arquitectura Hexagonal Modular)
 * Implementa los 8 puertos del contrato de persistencia sobre Firebase Admin SDK (Cloud Firestore).
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { appendAudit, auditDocument, normalizeTimestamp } from '../../../firestore/audit.js';
import {
  COLLECTIONS,
  SUBCOLLECTIONS,
  documentIds,
  ROLES,
  ORDER_STATUSES
} from '../../../firestore/collections.js';
import {
  computeCampaignStatus,
  computeNextOrderAndPaymentState,
  resolveOrderPaymentStatus
} from '../../domain/entities.js';

const now = () => FieldValue.serverTimestamp();
const REFRESH_TOKENS_COLLECTION = COLLECTIONS.refreshTokens;

function normalizedEmailKey(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

function toDateMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return Date.parse(value) || 0;
}

export function createFirestoreRepositoryAdapter(db) {
  if (!db) throw new Error('Se requiere una instancia de Firestore para el adaptador.');
  const ref = (collection, id) => db.collection(collection).doc(String(id));

  const adapter = {
    provider: 'firestore',

    authTokens: {
      async saveRefreshToken({ jti, userId, tokenHash, expiresAt }) {
        await ref(REFRESH_TOKENS_COLLECTION, jti).set({
          jti,
          userId: String(userId),
          tokenHash,
          expiresAt,
          revoked: false,
          createdAt: now()
        });
      },
      async findRefreshToken(jti) {
        const doc = await ref(REFRESH_TOKENS_COLLECTION, jti).get();
        if (!doc.exists) return null;
        return { jti: doc.id, ...doc.data() };
      },
      async revokeByJti(jti) {
        await ref(REFRESH_TOKENS_COLLECTION, jti).set({ revoked: true, updatedAt: now() }, { merge: true });
      },
      async revokeByHash(tokenHash) {
        const snap = await db
          .collection(REFRESH_TOKENS_COLLECTION)
          .where('tokenHash', '==', tokenHash)
          .get();
        if (snap.empty) return;
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { revoked: true, updatedAt: now() }));
        await batch.commit();
      },
      async revokeByUser(userId) {
        const snap = await db
          .collection(REFRESH_TOKENS_COLLECTION)
          .where('userId', '==', String(userId))
          .get();
        if (snap.empty) return;
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { revoked: true, updatedAt: now() }));
        await batch.commit();
      }
    },

    users: {
      async findById(id) {
        const [userDoc, roleDoc] = await Promise.all([
          ref(COLLECTIONS.users, id).get(),
          ref(COLLECTIONS.roles, id).get()
        ]);
        if (!userDoc.exists) return null;
        const data = userDoc.data();
        const role = roleDoc.exists ? roleDoc.data()?.role || 'CLIENT' : data.role || 'CLIENT';
        return {
          id: data.legacyId ?? userDoc.id,
          docId: userDoc.id,
          name: data.name,
          email: data.email,
          password_hash: data.passwordHash || data.password_hash,
          passwordHash: data.passwordHash || data.password_hash,
          role,
          app_role: role,
          createdAt: normalizeTimestamp(data.createdAt)
        };
      },

      async findByEmail(email) {
        const normalized = String(email || '').trim().toLowerCase();
        const snapshot = await db
          .collection(COLLECTIONS.users)
          .where('email', '==', normalized)
          .limit(1)
          .get();
        if (snapshot.empty) return null;
        return this.findById(snapshot.docs[0].id);
      },

      async createClient({ name, email, passwordHash }) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const existing = await this.findByEmail(normalizedEmail);
        if (existing) {
          throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'), {
            status: 409,
            publicMessage: 'Ese correo ya está registrado.'
          });
        }
        const userRef = db.collection(COLLECTIONS.users).doc();
        const roleRef = ref(COLLECTIONS.roles, userRef.id);
        const emailRef = ref(COLLECTIONS.userEmails, normalizedEmailKey(normalizedEmail));
        try {
          await db.runTransaction(async transaction => {
            const reservedEmail = await transaction.get(emailRef);
            if (reservedEmail.exists) {
              throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'), {
                status: 409,
                publicMessage: 'Ese correo ya está registrado.'
              });
            }
            transaction.create(emailRef, {
              email: normalizedEmail,
              userId: userRef.id,
              createdAt: now()
            });
            transaction.create(userRef, {
              name,
              email: normalizedEmail,
              passwordHash,
              role: 'CLIENT',
              createdAt: now(),
              updatedAt: now()
            });
            transaction.create(roleRef, {
              userId: userRef.id,
              role: 'CLIENT',
              updatedAt: now(),
              updatedBy: 'SELF_REGISTER'
            });
          });
        } catch (error) {
          if (error?.status === 409 || error?.code === 6 || error?.code === 'already-exists') {
            throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'), {
              status: 409,
              publicMessage: 'Ese correo ya está registrado.'
            });
          }
          throw error;
        }
        return this.findById(userRef.id);
      },

      async setRole({ userId, role, actorUserId }) {
        const userDoc = await ref(COLLECTIONS.users, userId).get();
        if (!userDoc.exists) return null;
        const batch = db.batch();
        batch.set(
          ref(COLLECTIONS.roles, userId),
          { userId: String(userId), role, updatedAt: now(), updatedBy: String(actorUserId) },
          { merge: true }
        );
        appendAudit(
          db,
          {
            actorUserId,
            action: 'USER_ROLE_CHANGED',
            entityType: 'USER',
            entityId: userId,
            metadata: { role }
          },
          batch
        );
        await batch.commit();
        return this.findById(userId);
      },

      async listPaginated({
        page = 1,
        pageSize = 10,
        q = '',
        scope = 'ALL',
        role = 'ALL',
        sortBy = 'id',
        sortDir = 'desc'
      } = {}) {
        const [usersSnap, rolesSnap, votesSnap, ordersSnap] = await Promise.all([
          db.collection(COLLECTIONS.users).get(),
          db.collection(COLLECTIONS.roles).get(),
          db.collection(COLLECTIONS.votes).get(),
          db.collection(COLLECTIONS.orders).get()
        ]);

        const roleMap = new Map();
        rolesSnap.docs.forEach(doc => roleMap.set(doc.id, doc.data()?.role || 'CLIENT'));

        const voteStatsMap = new Map();
        votesSnap.docs.forEach(doc => {
          const v = doc.data();
          const uid = String(v.userId);
          const current = voteStatsMap.get(uid) || { votesCount: 0, desiredBurgersCount: 0 };
          current.votesCount += 1;
          current.desiredBurgersCount += Number(v.quantity || 1);
          voteStatsMap.set(uid, current);
        });

        const orderCountMap = new Map();
        ordersSnap.docs.forEach(doc => {
          const o = doc.data();
          const uid = String(o.userId);
          orderCountMap.set(uid, (orderCountMap.get(uid) || 0) + 1);
        });

        const counts = { ALL: 0, STAFF: 0, ADMIN: 0, CHEF: 0, CLIENT: 0 };
        const allUsers = usersSnap.docs.map(doc => {
          const d = doc.data();
          const resolvedRole = roleMap.get(doc.id) || d.role || 'CLIENT';
          counts[resolvedRole] = (counts[resolvedRole] || 0) + 1;
          counts.ALL += 1;
          if (resolvedRole === 'ADMIN' || resolvedRole === 'CHEF') counts.STAFF += 1;

          const vStats = voteStatsMap.get(doc.id) || { votesCount: 0, desiredBurgersCount: 0 };
          return {
            id: d.legacyId ?? doc.id,
            name: d.name,
            email: d.email,
            role: resolvedRole,
            createdAt: normalizeTimestamp(d.createdAt),
            votesCount: vStats.votesCount,
            desiredBurgersCount: vStats.desiredBurgersCount,
            ordersCount: orderCountMap.get(doc.id) || 0
          };
        });

        const search = String(q || '').trim().toLowerCase();
        const normalizedScope = String(scope || 'ALL').trim().toUpperCase();
        const normalizedRole = String(role || 'ALL').trim().toUpperCase();

        const filtered = allUsers.filter(u => {
          if (normalizedScope === 'STAFF' && !['ADMIN', 'CHEF'].includes(u.role)) return false;
          if (normalizedScope === 'CLIENTS' && u.role !== 'CLIENT') return false;
          if (normalizedRole !== 'ALL' && u.role !== normalizedRole) return false;
          if (!search) return true;
          return (
            String(u.id).toLowerCase().includes(search) ||
            (u.name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search)
          );
        });

        const dir = String(sortDir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'es') * dir;
          if (sortBy === 'email') return (a.email || '').localeCompare(b.email || '', 'es') * dir;
          if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '', 'es') * dir;
          if (sortBy === 'votesCount') return (a.votesCount - b.votesCount) * dir;
          if (sortBy === 'ordersCount') return (a.ordersCount - b.ordersCount) * dir;
          return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) * dir;
        });

        const parsedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / parsedPageSize));
        const currentPage = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), totalPages);
        const start = (currentPage - 1) * parsedPageSize;

        return {
          users: filtered.slice(start, start + parsedPageSize),
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
    },

    burgers: {
      async list({ includeInactive = false } = {}) {
        const snapshot = await db.collection(COLLECTIONS.burgers).orderBy('createdAt', 'desc').get();
        return snapshot.docs
          .map(doc => {
            const d = doc.data();
            return {
              id: d.legacyId ?? doc.id,
              name: d.name,
              description: d.description,
              ingredients: Array.isArray(d.ingredients) ? d.ingredients.join(', ') : d.ingredients,
              imageUrl: d.imageUrl || '/assets/hero-burger.jpeg',
              priceCop: Number(d.priceCop || 28000),
              active: Boolean(d.active),
              deleted: Boolean(d.deleted),
              createdAt: normalizeTimestamp(d.createdAt)
            };
          })
          .filter(item => !item.deleted && (includeInactive || item.active));
      },

      async get(id) {
        const doc = await ref(COLLECTIONS.burgers, id).get();
        if (!doc.exists) return null;
        const d = doc.data();
        if (d.deleted) return null;
        return {
          id: d.legacyId ?? doc.id,
          name: d.name,
          description: d.description,
          ingredients: Array.isArray(d.ingredients) ? d.ingredients.join(', ') : d.ingredients,
          imageUrl: d.imageUrl || '/assets/hero-burger.jpeg',
          priceCop: Number(d.priceCop || 28000),
          active: Boolean(d.active),
          deleted: Boolean(d.deleted),
          createdAt: normalizeTimestamp(d.createdAt)
        };
      },

      async countActiveByIds(ids = []) {
        if (!ids.length) return 0;
        const docs = await Promise.all(ids.map(id => this.get(id)));
        return docs.filter(b => b && b.active && !b.deleted).length;
      },

      async create(data, actorUserId) {
        const burgerRef = db.collection(COLLECTIONS.burgers).doc();
        const batch = db.batch();
        const ingredientsArr = String(data.ingredients || '')
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);
        batch.create(burgerRef, {
          name: data.name,
          description: data.description,
          ingredients: ingredientsArr,
          imageUrl: data.imageUrl || '/assets/hero-burger.jpeg',
          priceCop: Number(data.priceCop),
          active: Boolean(data.active),
          deleted: false,
          createdAt: now(),
          updatedAt: now()
        });
        appendAudit(
          db,
          {
            actorUserId,
            action: 'BURGER_CREATED',
            entityType: 'BURGER',
            entityId: burgerRef.id
          },
          batch
        );
        await batch.commit();
        return this.get(burgerRef.id);
      },

      async update(id, data, actorUserId) {
        const burgerRef = ref(COLLECTIONS.burgers, id);
        const existing = await burgerRef.get();
        if (!existing.exists || existing.data().deleted) return null;
        const ingredientsArr = String(data.ingredients || '')
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);
        const batch = db.batch();
        batch.update(burgerRef, {
          name: data.name,
          description: data.description,
          ingredients: ingredientsArr,
          imageUrl: data.imageUrl || '/assets/hero-burger.jpeg',
          priceCop: Number(data.priceCop),
          active: Boolean(data.active),
          updatedAt: now()
        });
        appendAudit(
          db,
          {
            actorUserId,
            action: 'BURGER_UPDATED',
            entityType: 'BURGER',
            entityId: id
          },
          batch
        );
        await batch.commit();
        return this.get(id);
      },

      async delete(id, actorUserId) {
        const burgerRef = ref(COLLECTIONS.burgers, id);
        const existing = await burgerRef.get();
        if (!existing.exists || existing.data().deleted) return null;
        const batch = db.batch();
        batch.update(burgerRef, { active: false, deleted: true, updatedAt: now() });
        appendAudit(
          db,
          {
            actorUserId,
            action: 'BURGER_DELETED',
            entityType: 'BURGER',
            entityId: id,
            metadata: { name: existing.data().name, mode: 'soft' }
          },
          batch
        );
        await batch.commit();
        return true;
      }
    },

    campaigns: {
      async get(id, userId) {
        const campaignRef = ref(COLLECTIONS.campaigns, id);
        const doc = await campaignRef.get();
        if (!doc.exists) return null;
        const d = doc.data();
        const startsAt = normalizeTimestamp(d.startsAt);
        const endsAt = normalizeTimestamp(d.endsAt);
        const computedStatus = computeCampaignStatus({ status: d.status, startsAt, endsAt });

        const [candidatesSnap, votesSnap] = await Promise.all([
          campaignRef.collection(SUBCOLLECTIONS.campaignCandidates).get(),
          db.collection(COLLECTIONS.votes).where('campaignId', '==', String(id)).get()
        ]);

        const votesByBurger = new Map();
        let ownVote = null;
        votesSnap.docs.forEach(vDoc => {
          const v = vDoc.data();
          const bId = String(v.burgerId);
          const cur = votesByBurger.get(bId) || { voteCount: 0, desiredQuantity: 0 };
          cur.voteCount += 1;
          cur.desiredQuantity += Number(v.quantity || 1);
          votesByBurger.set(bId, cur);
          if (userId != null && String(v.userId) === String(userId)) {
            ownVote = { burgerId: v.burgerId, quantity: Number(v.quantity || 1) };
          }
        });

        const candidateDocs = await Promise.all(
          candidatesSnap.docs.map(async cDoc => {
            const cData = cDoc.data();
            const burgerDoc = await ref(COLLECTIONS.burgers, cData.burgerId).get();
            if (!burgerDoc.exists) return null;
            const b = burgerDoc.data();
            if (b.deleted || (!b.active && computedStatus !== 'CLOSED')) return null;
            const stats = votesByBurger.get(String(cData.burgerId)) || {
              voteCount: Number(cData.voteCount || 0),
              desiredQuantity: Number(cData.desiredQuantity || cData.voteCount || 0)
            };
            return {
              id: b.legacyId ?? burgerDoc.id,
              name: b.name,
              description: b.description,
              ingredients: Array.isArray(b.ingredients) ? b.ingredients.join(', ') : b.ingredients,
              imageUrl: b.imageUrl || '/assets/hero-burger.jpeg',
              priceCop: Number(b.priceCop || 28000),
              active: Boolean(b.active),
              deleted: Boolean(b.deleted),
              voteCount: stats.voteCount,
              desiredQuantity: stats.desiredQuantity
            };
          })
        );

        const candidates = candidateDocs
          .filter(Boolean)
          .sort((a, b) => b.voteCount - a.voteCount || b.desiredQuantity - a.desiredQuantity);

        return {
          id: d.legacyId ?? doc.id,
          name: d.name,
          startsAt,
          endsAt,
          published: d.status === 'PUBLISHED',
          lifecycleStatus: d.status,
          status: computedStatus,
          winnerBurgerId: d.winnerBurgerId ?? null,
          closedAt: normalizeTimestamp(d.closedAt),
          candidates,
          userVoteBurgerId: ownVote?.burgerId ?? null,
          userVoteQuantity: ownVote?.quantity ?? null
        };
      },

      async list(userId) {
        const snapshot = await db.collection(COLLECTIONS.campaigns).orderBy('startsAt', 'desc').get();
        return Promise.all(snapshot.docs.map(doc => this.get(doc.id, userId)));
      },

      async findOverlappingPublished({ excludeId = 0, startsAt, endsAt }) {
        const snapshot = await db
          .collection(COLLECTIONS.campaigns)
          .where('status', '==', 'PUBLISHED')
          .get();
        const startMs = Date.parse(startsAt);
        const endMs = Date.parse(endsAt);
        const match = snapshot.docs.find(doc => {
          const d = doc.data();
          const docId = String(d.legacyId ?? doc.id);
          if (docId === String(excludeId)) return false;
          return toDateMillis(d.startsAt) < endMs && toDateMillis(d.endsAt) > startMs;
        });
        return match ? { id: match.id } : null;
      },

      async getMetaForUpdate(id) {
        const doc = await ref(COLLECTIONS.campaigns, id).get();
        if (!doc.exists) return null;
        const d = doc.data();
        const votesSnap = await db
          .collection(COLLECTIONS.votes)
          .where('campaignId', '==', String(id))
          .get();
        return {
          id: d.legacyId ?? doc.id,
          startsAt: normalizeTimestamp(d.startsAt),
          status: d.status,
          voteCount: votesSnap.size
        };
      },

      async create(data, actorUserId) {
        const campaignRef = db.collection(COLLECTIONS.campaigns).doc();
        const batch = db.batch();
        batch.create(campaignRef, {
          name: data.name,
          startsAt: Timestamp.fromDate(new Date(data.startsAt)),
          endsAt: Timestamp.fromDate(new Date(data.endsAt)),
          published: data.status === 'PUBLISHED',
          status: data.status,
          winnerBurgerId: null,
          closedAt: null,
          createdAt: now(),
          updatedAt: now()
        });
        data.burgerIds.forEach(burgerId =>
          batch.create(
            campaignRef.collection(SUBCOLLECTIONS.campaignCandidates).doc(String(burgerId)),
            { burgerId: String(burgerId), voteCount: 0, desiredQuantity: 0, createdAt: now() }
          )
        );
        appendAudit(
          db,
          {
            actorUserId,
            action: 'CAMPAIGN_CREATED',
            entityType: 'CAMPAIGN',
            entityId: campaignRef.id,
            metadata: { status: data.status }
          },
          batch
        );
        await batch.commit();
        return this.get(campaignRef.id);
      },

      async update(id, data, actorUserId) {
        const campaignRef = ref(COLLECTIONS.campaigns, id);
        const existing = await campaignRef.get();
        if (!existing.exists) return null;
        const batch = db.batch();
        batch.update(campaignRef, {
          name: data.name,
          startsAt: Timestamp.fromDate(new Date(data.startsAt)),
          endsAt: Timestamp.fromDate(new Date(data.endsAt)),
          published: data.status === 'PUBLISHED',
          status: data.status,
          updatedAt: now()
        });
        const oldCandidates = await campaignRef.collection(SUBCOLLECTIONS.campaignCandidates).get();
        oldCandidates.docs.forEach(doc => batch.delete(doc.ref));
        data.burgerIds.forEach(burgerId =>
          batch.create(
            campaignRef.collection(SUBCOLLECTIONS.campaignCandidates).doc(String(burgerId)),
            { burgerId: String(burgerId), voteCount: 0, desiredQuantity: 0, createdAt: now() }
          )
        );
        appendAudit(
          db,
          {
            actorUserId,
            action: 'CAMPAIGN_UPDATED',
            entityType: 'CAMPAIGN',
            entityId: id,
            metadata: { status: data.status }
          },
          batch
        );
        await batch.commit();
        return this.get(id);
      },

      async close(id, winnerBurgerId, actorUserId) {
        const campaignRef = ref(COLLECTIONS.campaigns, id);
        let resolvedWinnerBurgerId = winnerBurgerId;
        await db.runTransaction(async transaction => {
          const [campaign, candidates] = await Promise.all([
            transaction.get(campaignRef),
            transaction.get(campaignRef.collection(SUBCOLLECTIONS.campaignCandidates))
          ]);
          if (!campaign.exists) {
            throw Object.assign(new Error('CAMPAIGN_NOT_FOUND'), { status: 404 });
          }
          if (campaign.data().status !== 'PUBLISHED') {
            throw Object.assign(new Error('CAMPAIGN_NOT_PUBLISHED'), {
              status: 409,
              publicMessage: 'Sólo se puede cerrar una campaña publicada.'
            });
          }
          const winnerCandidate = [...candidates.docs].sort((a, b) => {
            const aData = a.data();
            const bData = b.data();
            return (
              Number(bData.voteCount || 0) - Number(aData.voteCount || 0) ||
              Number(bData.desiredQuantity || 0) - Number(aData.desiredQuantity || 0) ||
              a.id.localeCompare(b.id, undefined, { numeric: true })
            );
          })[0];
          if (!winnerCandidate) {
            throw Object.assign(new Error('INVALID_WINNER'), {
              status: 409,
              publicMessage: 'La campaña no tiene candidatas.'
            });
          }
          resolvedWinnerBurgerId = winnerCandidate.data().burgerId || winnerCandidate.id;
          transaction.update(campaignRef, {
            status: 'CLOSED',
            published: false,
            winnerBurgerId: String(resolvedWinnerBurgerId),
            closedAt: now(),
            updatedAt: now()
          });
          transaction.create(
            db.collection(COLLECTIONS.auditLogs).doc(),
            auditDocument({
              actorUserId,
              action: 'CAMPAIGN_CLOSED',
              entityType: 'CAMPAIGN',
              entityId: id,
              metadata: {
                winnerBurgerId: resolvedWinnerBurgerId,
                requestedWinnerBurgerId: winnerBurgerId,
                tieRule: 'voteCount, desiredQuantity, candidateId'
              }
            })
          );
        });
        return this.get(id);
      },

      async listVotes(campaignId) {
        const snapshot = await db
          .collection(COLLECTIONS.votes)
          .where('campaignId', '==', String(campaignId))
          .get();
        const votes = await Promise.all(
          snapshot.docs.map(async doc => {
            const v = doc.data();
            const [uDoc, bDoc] = await Promise.all([
              ref(COLLECTIONS.users, v.userId).get(),
              ref(COLLECTIONS.burgers, v.burgerId).get()
            ]);
            const u = uDoc.data() || {};
            const b = bDoc.data() || {};
            return {
              id: v.legacyId ?? doc.id,
              quantity: Number(v.quantity || 1),
              paymentStatus: v.paymentStatus || 'UNPAID',
              orderId: v.orderId || null,
              createdAt: normalizeTimestamp(v.createdAt),
              userId: v.userId,
              userName: u.name || 'Cliente',
              userEmail: u.email || '',
              burgerId: v.burgerId,
              burgerName: b.name || 'Hamburguesa',
              burgerImageUrl: b.imageUrl || '/assets/hero-burger.jpeg',
              burgerPriceCop: Number(b.priceCop || 28000)
            };
          })
        );
        return votes.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      }
    },

    votes: {
      async create({ campaignId, burgerId, quantity = 1, userId }) {
        const voteRef = ref(COLLECTIONS.votes, documentIds.vote(campaignId, userId));
        const campaignRef = ref(COLLECTIONS.campaigns, campaignId);
        const candidateRef = campaignRef
          .collection(SUBCOLLECTIONS.campaignCandidates)
          .doc(String(burgerId));

        await db.runTransaction(async transaction => {
          const [campaign, candidate, existing] = await Promise.all([
            transaction.get(campaignRef),
            transaction.get(candidateRef),
            transaction.get(voteRef)
          ]);
          if (!campaign.exists || campaign.data().status !== 'PUBLISHED') {
            throw Object.assign(new Error('CAMPAIGN_NOT_FOUND'), {
              status: 404,
              publicMessage: 'Campaña no encontrada.'
            });
          }
          const data = campaign.data();
          const nowMs = Date.now();
          if (nowMs < toDateMillis(data.startsAt) || nowMs >= toDateMillis(data.endsAt)) {
            throw Object.assign(new Error('CAMPAIGN_NOT_OPEN'), {
              status: 409,
              publicMessage: 'La campaña no está abierta para votación.'
            });
          }
          if (!candidate.exists) {
            throw Object.assign(new Error('INVALID_CANDIDATE'), {
              status: 400,
              publicMessage: 'La hamburguesa no pertenece a esta campaña o ya no está disponible.'
            });
          }
          if (existing.exists) {
            throw Object.assign(new Error('DUPLICATE_VOTE'), {
              status: 409,
              publicMessage: 'Ya votaste en esta campaña.'
            });
          }
          transaction.create(voteRef, {
            campaignId: String(campaignId),
            burgerId: String(burgerId),
            userId: String(userId),
            quantity: Number(quantity || 1),
            paymentStatus: 'UNPAID',
            orderId: null,
            createdAt: now()
          });
          transaction.update(candidateRef, {
            voteCount: FieldValue.increment(1),
            desiredQuantity: FieldValue.increment(Number(quantity || 1)),
            updatedAt: now()
          });
          transaction.create(
            db.collection(COLLECTIONS.auditLogs).doc(),
            auditDocument({
              actorUserId: userId,
              action: 'VOTE_CAST',
              entityType: 'CAMPAIGN',
              entityId: campaignId,
              metadata: { burgerId, quantity: Number(quantity || 1) }
            })
          );
        });
      }
    },

    orders: {
      async get(id) {
        const orderRef = ref(COLLECTIONS.orders, id);
        const doc = await orderRef.get();
        if (!doc.exists) return null;
        const d = doc.data();
        const [userDoc, itemsSnap, campaignDoc] = await Promise.all([
          ref(COLLECTIONS.users, d.userId).get(),
          orderRef.collection(SUBCOLLECTIONS.orderItems).get(),
          d.campaignId ? ref(COLLECTIONS.campaigns, d.campaignId).get() : Promise.resolve(null)
        ]);
        const user = userDoc.exists ? userDoc.data() : {};
        const items = itemsSnap.docs.map(iDoc => {
          const i = iDoc.data();
          return {
            id: iDoc.id,
            burgerId: i.burgerId,
            burgerName: i.burgerName,
            ingredients: Array.isArray(i.ingredients) ? i.ingredients.join(', ') : i.ingredients,
            removedIngredients: i.removedIngredients || [],
            notes: i.notes || '',
            quantity: Number(i.quantity || 1),
            unitPriceCop: Number(i.unitPriceCop || 0),
            burgerImageUrl: i.burgerImageUrl || '/assets/hero-burger.jpeg'
          };
        });
        const paymentStatus = resolveOrderPaymentStatus(d.paymentStatus, d.status);
        const totalBurgers = items.reduce((sum, item) => sum + item.quantity, 0);

        return {
          id: d.legacyId ?? doc.id,
          userId: d.userId,
          status: d.status,
          rawPaymentStatus: d.paymentStatus || 'UNPAID',
          paymentStatus,
          isPaid: paymentStatus === 'PAID',
          campaignId: d.campaignId || null,
          campaignName: campaignDoc?.exists ? campaignDoc.data().name : null,
          voteId: d.voteId || null,
          phone: d.phone,
          deliveryAddress: d.deliveryAddress,
          notes: d.notes || '',
          totalCop: Number(d.totalCop || 0),
          totalBurgers,
          customerName: user.name || 'Cliente',
          customerEmail: user.email || '',
          createdAt: normalizeTimestamp(d.createdAt),
          updatedAt: normalizeTimestamp(d.updatedAt),
          items
        };
      },

      async create({ userId, phone, deliveryAddress, notes, items, totalCop }) {
        const orderRef = db.collection(COLLECTIONS.orders).doc();
        const batch = db.batch();
        batch.create(orderRef, {
          userId: String(userId),
          phone,
          deliveryAddress,
          notes: notes || '',
          totalCop: Number(totalCop || 0),
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          campaignId: null,
          voteId: null,
          createdAt: now(),
          updatedAt: now()
        });
        items.forEach(item =>
          batch.create(orderRef.collection(SUBCOLLECTIONS.orderItems).doc(), item)
        );
        batch.create(orderRef.collection(SUBCOLLECTIONS.orderEvents).doc(), {
          type: 'ORDER_CREATED',
          from: null,
          to: 'PENDING',
          actorUserId: String(userId),
          createdAt: now()
        });
        appendAudit(
          db,
          {
            actorUserId: userId,
            action: 'ORDER_CREATED',
            entityType: 'ORDER',
            entityId: orderRef.id,
            metadata: { totalCop }
          },
          batch
        );
        await batch.commit();
        return this.get(orderRef.id);
      },

      async listByUser(userId) {
        const snapshot = await db
          .collection(COLLECTIONS.orders)
          .where('userId', '==', String(userId))
          .get();
        return Promise.all(snapshot.docs.map(doc => this.get(doc.id)));
      },

      async listKitchen() {
        const snapshot = await db.collection(COLLECTIONS.orders).get();
        const orders = await Promise.all(snapshot.docs.map(doc => this.get(doc.id)));
        return orders.filter(Boolean);
      },

      async changeStatus({ orderId, from, to, actorUserId }) {
        const orderRef = ref(COLLECTIONS.orders, orderId);
        const nextPaymentStatus =
          to === 'CANCELLED'
            ? 'CANCELLED'
            : ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(to)
              ? 'PAID'
              : 'UNPAID';

        await db.runTransaction(async transaction => {
          const snapshot = await transaction.get(orderRef);
          if (!snapshot.exists) {
            throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
          }
          if (snapshot.data().status !== from) {
            throw Object.assign(new Error('ORDER_STATUS_CONFLICT'), { status: 409 });
          }
          transaction.update(orderRef, {
            status: to,
            paymentStatus: nextPaymentStatus,
            updatedAt: now()
          });
          if (snapshot.data().voteId) {
            transaction.update(ref(COLLECTIONS.votes, snapshot.data().voteId), {
              paymentStatus: nextPaymentStatus
            });
          }
          transaction.create(orderRef.collection(SUBCOLLECTIONS.orderEvents).doc(), {
            type: 'STATUS_CHANGED',
            from,
            to,
            actorUserId: String(actorUserId),
            createdAt: now()
          });
          transaction.create(
            db.collection(COLLECTIONS.auditLogs).doc(),
            auditDocument({
              actorUserId: String(actorUserId),
              action: 'ORDER_STATUS_CHANGED',
              entityType: 'ORDER',
              entityId: String(orderId),
              metadata: { from, to, paymentStatus: nextPaymentStatus }
            })
          );
        });
        return this.get(orderId);
      },

      async cancelByClient({ orderId, userId }) {
        return this.changeStatus({
          orderId,
          from: 'PENDING',
          to: 'CANCELLED',
          actorUserId: userId
        });
      },

      async getSalesDashboard({ campaignId } = {}) {
        const [orders, campaigns] = await Promise.all([
          this.listKitchen(),
          adapter.campaigns.list()
        ]);
        const currentCampaign = campaignId
          ? campaigns.find(campaign => String(campaign.id) === String(campaignId)) || null
          : campaigns.find(campaign => campaign.status === 'ACTIVE') || campaigns[0] || null;
        const campaignOrders = currentCampaign
          ? await adapter.campaigns.listVotes(currentCampaign.id)
          : [];
        const paidOrders = orders.filter(o => o.isPaid && o.status !== 'CANCELLED');
        const unpaidOrders = orders.filter(
          o => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED'
        );
        const cancelledOrders = orders.filter(
          o => o.status === 'CANCELLED' || o.paymentStatus === 'CANCELLED'
        );
        const unlinkedCampaignUnpaid = campaignOrders.filter(
          vote => !vote.orderId && vote.paymentStatus === 'UNPAID'
        );
        const unlinkedCampaignCancelled = campaignOrders.filter(
          vote => !vote.orderId && vote.paymentStatus === 'CANCELLED'
        );
        return {
          summary: {
            totalRevenuePaidCop: paidOrders.reduce((s, o) => s + o.totalCop, 0),
            paidOrdersCount: paidOrders.length,
            paidBurgersCount: paidOrders.reduce((s, o) => s + o.totalBurgers, 0),
            unpaidOrdersCount: unpaidOrders.length + unlinkedCampaignUnpaid.length,
            unpaidTotalCop:
              unpaidOrders.reduce((s, o) => s + o.totalCop, 0) +
              unlinkedCampaignUnpaid.reduce(
                (s, vote) => s + Number(vote.quantity || 1) * Number(vote.burgerPriceCop || 0),
                0
              ),
            cancelledCount: cancelledOrders.length + unlinkedCampaignCancelled.length,
            totalOrdersCount: orders.length,
            campaignId: currentCampaign?.id || null,
            campaignName: currentCampaign?.name || null,
            campaignStatus: currentCampaign?.status || null,
            campaignVotesTotal: campaignOrders.length,
            campaignBurgersTotal: campaignOrders
              .filter(vote => vote.paymentStatus !== 'CANCELLED')
              .reduce((sum, vote) => sum + Number(vote.quantity || 1), 0),
            campaignPaidCount: campaignOrders.filter(vote => vote.paymentStatus === 'PAID')
              .length,
            campaignPaidBurgers: campaignOrders
              .filter(vote => vote.paymentStatus === 'PAID')
              .reduce((sum, vote) => sum + Number(vote.quantity || 1), 0),
            campaignUnpaidCount: campaignOrders.filter(
              vote => vote.paymentStatus === 'UNPAID'
            ).length,
            campaignCancelledCount: campaignOrders.filter(
              vote => vote.paymentStatus === 'CANCELLED'
            ).length,
            campaignPaidRevenueCop: campaignOrders
              .filter(vote => vote.paymentStatus === 'PAID')
              .reduce(
                (sum, vote) =>
                  sum + Number(vote.quantity || 1) * Number(vote.burgerPriceCop || 0),
                0
              ),
            campaignProjectedRevenueCop: campaignOrders
              .filter(vote => vote.paymentStatus !== 'CANCELLED')
              .reduce(
                (sum, vote) =>
                  sum + Number(vote.quantity || 1) * Number(vote.burgerPriceCop || 0),
                0
              )
          },
          currentCampaign,
          campaigns: campaigns.map(campaign => ({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            totalVotes: (campaign.candidates || []).reduce(
              (sum, candidate) => sum + Number(candidate.voteCount || 0),
              0
            ),
            totalDesiredQuantity: (campaign.candidates || []).reduce(
              (sum, candidate) => sum + Number(candidate.desiredQuantity || 0),
              0
            )
          })),
          campaignOrders,
          orders
        };
      },

      async updateSaleOrder({ orderId, paymentStatus, status, actorUserId }) {
        const current = await this.get(orderId);
        if (!current) return null;
        const { nextStatus, nextPaymentStatus } = computeNextOrderAndPaymentState(current, {
          paymentStatus,
          status
        });
        const orderRef = ref(COLLECTIONS.orders, orderId);
        const batch = db.batch();
        batch.update(orderRef, {
          status: nextStatus,
          paymentStatus: nextPaymentStatus,
          updatedAt: now()
        });
        if (current.voteId) {
          batch.update(ref(COLLECTIONS.votes, current.voteId), {
            paymentStatus: nextPaymentStatus
          });
        }
        appendAudit(
          db,
          {
            actorUserId,
            action: 'ORDER_SALE_UPDATED',
            entityType: 'ORDER',
            entityId: orderId,
            metadata: {
              fromStatus: current.status,
              toStatus: nextStatus,
              fromPaymentStatus: current.paymentStatus,
              toPaymentStatus: nextPaymentStatus
            }
          },
          batch
        );
        await batch.commit();
        return this.get(orderId);
      },

      async updateCampaignVoteSale({
        voteId,
        paymentStatus,
        status,
        phone,
        deliveryAddress,
        notes,
        actorUserId
      }) {
        const voteRef = ref(COLLECTIONS.votes, voteId);
        const voteSnap = await voteRef.get();
        if (!voteSnap.exists) return null;
        const vote = voteSnap.data();
        const nextPaymentStatus =
          paymentStatus === 'CANCELLED' || status === 'CANCELLED'
            ? 'CANCELLED'
            : paymentStatus ||
                (status && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(status)
                  ? 'PAID'
                  : vote.paymentStatus || 'UNPAID');
        const burgerRef = ref(COLLECTIONS.burgers, vote.burgerId);
        const campaignRef = ref(COLLECTIONS.campaigns, vote.campaignId);
        const newOrderRef = db.collection(COLLECTIONS.orders).doc();
        let linkedOrderId = vote.orderId || null;

        await db.runTransaction(async transaction => {
          const reads = [transaction.get(voteRef), transaction.get(burgerRef), transaction.get(campaignRef)];
          const [currentVote, burgerDoc, campaignDoc] = await Promise.all(reads);
          if (!currentVote.exists) {
            throw Object.assign(new Error('VOTE_NOT_FOUND'), { status: 404 });
          }
          const currentLinkedOrderId = currentVote.data().orderId || null;
          const linkedOrderRef = currentLinkedOrderId
            ? ref(COLLECTIONS.orders, currentLinkedOrderId)
            : null;
          const existingOrder = linkedOrderRef ? await transaction.get(linkedOrderRef) : null;
          linkedOrderId = currentLinkedOrderId;
          const burger = burgerDoc.exists ? burgerDoc.data() : {};
          const campaign = campaignDoc.exists ? campaignDoc.data() : {};
          const quantity = Number(currentVote.data().quantity || 1);
          const unitPriceCop = Number(burger.priceCop || 0);
          let nextStatus = status || existingOrder?.data()?.status || 'PENDING';

          if (nextPaymentStatus === 'PAID') {
            if (!existingOrder?.exists) {
              linkedOrderId = newOrderRef.id;
              if (!status || status === 'PENDING') nextStatus = 'CONFIRMED';
              transaction.create(newOrderRef, {
                userId: String(currentVote.data().userId),
                status: nextStatus,
                paymentStatus: 'PAID',
                campaignId: String(currentVote.data().campaignId),
                voteId: voteRef.id,
                phone: phone || 'Pedido Campaña',
                deliveryAddress: deliveryAddress || `Campaña: ${campaign.name || 'Secret Bite'}`,
                notes: notes || `Pedido generado desde campaña ${campaign.name || ''}`.trim(),
                totalCop: quantity * unitPriceCop,
                createdAt: now(),
                updatedAt: now()
              });
              transaction.create(
                newOrderRef.collection(SUBCOLLECTIONS.orderItems).doc(),
                {
                  burgerId: String(currentVote.data().burgerId),
                  burgerName: burger.name || 'Hamburguesa',
                  burgerImageUrl: burger.imageUrl || '/assets/hero-burger.jpeg',
                  ingredients: Array.isArray(burger.ingredients)
                    ? burger.ingredients
                    : String(burger.ingredients || '')
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean),
                  removedIngredients: [],
                  notes: '',
                  quantity,
                  unitPriceCop
                }
              );
              transaction.create(newOrderRef.collection(SUBCOLLECTIONS.orderEvents).doc(), {
                type: 'CAMPAIGN_ORDER_CREATED',
                from: null,
                to: nextStatus,
                actorUserId: String(actorUserId),
                createdAt: now()
              });
            } else {
              if (!status && ['PENDING', 'CANCELLED'].includes(existingOrder.data().status)) {
                nextStatus = 'CONFIRMED';
              }
              transaction.update(linkedOrderRef, {
                status: nextStatus,
                paymentStatus: 'PAID',
                updatedAt: now()
              });
              transaction.create(linkedOrderRef.collection(SUBCOLLECTIONS.orderEvents).doc(), {
                type: 'SALE_UPDATED',
                from: existingOrder.data().status,
                to: nextStatus,
                actorUserId: String(actorUserId),
                createdAt: now()
              });
            }
          } else if (linkedOrderRef && existingOrder?.exists) {
            nextStatus = nextPaymentStatus === 'CANCELLED' ? 'CANCELLED' : 'PENDING';
            transaction.update(linkedOrderRef, {
              status: nextStatus,
              paymentStatus: nextPaymentStatus,
              updatedAt: now()
            });
            transaction.create(linkedOrderRef.collection(SUBCOLLECTIONS.orderEvents).doc(), {
              type: 'SALE_UPDATED',
              from: existingOrder.data().status,
              to: nextStatus,
              actorUserId: String(actorUserId),
              createdAt: now()
            });
          }

          transaction.update(voteRef, {
            paymentStatus: nextPaymentStatus,
            orderId: linkedOrderId,
            updatedAt: now()
          });
          transaction.create(
            db.collection(COLLECTIONS.auditLogs).doc(),
            auditDocument({
              actorUserId,
              action: 'CAMPAIGN_SALE_UPDATED',
              entityType: 'CAMPAIGN',
              entityId: currentVote.data().campaignId,
              metadata: {
                voteId,
                orderId: linkedOrderId,
                paymentStatus: nextPaymentStatus,
                status: nextStatus
              }
            })
          );
        });

        const campaignVotes = await adapter.campaigns.listVotes(vote.campaignId);
        return {
          voteOrder: campaignVotes.find(item => String(item.id) === String(voteId)) || {
            voteId,
            paymentStatus: nextPaymentStatus,
            orderId: linkedOrderId
          },
          order: linkedOrderId ? await adapter.orders.get(linkedOrderId) : null
        };
      }
    },

    audit: {
      async write(entry) {
        const { writer } = appendAudit(db, entry);
        await writer.commit();
      },

      async list(limit = 100) {
        const snapshot = await db
          .collection(COLLECTIONS.auditLogs)
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get();
        return snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: d.legacyId ?? doc.id,
            action: d.action,
            entityType: d.entityType,
            entityId: d.entityId,
            metadata: d.metadata || {},
            createdAt: normalizeTimestamp(d.createdAt)
          };
        });
      },

      async listPaginated({ page = 1, pageSize = 10, q = '', entityType = 'ALL' } = {}) {
        const all = await this.list(500);
        const search = String(q || '').trim().toLowerCase();
        const normalizedEntity = String(entityType || 'ALL').trim().toUpperCase();
        const filtered = all.filter(item => {
          if (
            normalizedEntity !== 'ALL' &&
            String(item.entityType).toUpperCase() !== normalizedEntity
          ) {
            return false;
          }
          if (!search) return true;
          return (
            String(item.action).toLowerCase().includes(search) ||
            String(item.entityType).toLowerCase().includes(search) ||
            String(item.entityId || '').toLowerCase().includes(search)
          );
        });
        const parsedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / parsedPageSize));
        const currentPage = Math.min(Math.max(1, Number.parseInt(page, 10) || 1), totalPages);
        const start = (currentPage - 1) * parsedPageSize;
        return {
          entries: filtered.slice(start, start + parsedPageSize),
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
    },

    stats: {
      async getDashboardStats() {
        const [usersSnap, rolesSnap, burgers, campaigns, votesSnap, orders, auditEntries] =
          await Promise.all([
          db.collection(COLLECTIONS.users).get(),
          db.collection(COLLECTIONS.roles).get(),
          adapter.burgers.list({ includeInactive: true }),
          adapter.campaigns.list(),
          db.collection(COLLECTIONS.votes).get(),
          adapter.orders.listKitchen(),
          adapter.audit.list(500)
        ]);
        const roleCounts = { CLIENT: 0, CHEF: 0, ADMIN: 0 };
        const rolesByUser = new Map(rolesSnap.docs.map(doc => [doc.id, doc.data().role]));
        usersSnap.docs.forEach(doc => {
          const role = rolesByUser.get(doc.id) || doc.data().role || 'CLIENT';
          roleCounts[role] = (roleCounts[role] || 0) + 1;
        });
        const votes = votesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeOrders = orders.filter(
          order => !['DELIVERED', 'CANCELLED'].includes(order.status)
        );
        const topBurgers = burgers
          .map(burger => {
            const burgerVotes = votes.filter(v => String(v.burgerId) === String(burger.id));
            const orderedQuantity = orders
              .filter(order => order.status !== 'CANCELLED')
              .flatMap(order => order.items || [])
              .filter(item => String(item.burgerId) === String(burger.id))
              .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return {
              id: burger.id,
              name: burger.name,
              imageUrl: burger.imageUrl,
              priceCop: burger.priceCop,
              active: burger.active,
              voteCount: burgerVotes.length,
              desiredQuantity: burgerVotes.reduce(
                (sum, vote) => sum + Number(vote.quantity || 1),
                0
              ),
              orderedQuantity
            };
          })
          .sort(
            (a, b) =>
              b.voteCount - a.voteCount ||
              b.desiredQuantity - a.desiredQuantity ||
              b.orderedQuantity - a.orderedQuantity
          );
        const auditCounts = new Map();
        auditEntries.forEach(entry =>
          auditCounts.set(entry.entityType, (auditCounts.get(entry.entityType) || 0) + 1)
        );
        return {
          totals: {
            users: roleCounts.CLIENT || 0,
            staff: (roleCounts.ADMIN || 0) + (roleCounts.CHEF || 0),
            totalUsers: usersSnap.size,
            burgers: burgers.filter(burger => burger.active && !burger.deleted).length,
            totalBurgers: burgers.filter(burger => !burger.deleted).length,
            campaigns: campaigns.length,
            votes: votes.length,
            desiredBurgers: votes.reduce((sum, vote) => sum + Number(vote.quantity || 1), 0),
            orders: activeOrders.length,
            totalOrders: orders.length,
            revenueCop: orders
              .filter(order => order.status !== 'CANCELLED')
              .reduce((sum, order) => sum + Number(order.totalCop || 0), 0)
          },
          campaigns,
          charts: {
            ordersByStatus: ORDER_STATUSES.map(status => {
              const matches = orders.filter(order => order.status === status);
              return {
                status,
                count: matches.length,
                totalCop: matches.reduce((sum, order) => sum + Number(order.totalCop || 0), 0)
              };
            }),
            topBurgers,
            auditByEntity: [...auditCounts.entries()]
              .map(([entityType, count]) => ({ entityType, count }))
              .sort((a, b) => b.count - a.count)
          }
        };
      }
    }
  };

  return adapter;
}
