import { COLLECTIONS, documentIds } from '../../../../firestore/collections.js';
import { normalizeTimestamp } from '../../../../firestore/audit.js';
import { campaignLifecycleStatus } from '../../domain/campaign-period.value-object.js';
import { DomainException } from '../../../shared/domain/exceptions/domain.exception.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Campaigns & Votes Repository
 */
export function createCampaignsFirestoreAdapter(firestore, burgersAdapter) {
  const col = name => firestore.collection(name);

  function mapCampaignDoc(doc, candidates = [], userVote = null) {
    if (!doc || !doc.exists) return null;
    const data = doc.data() || {};
    const numericId = Number(doc.id);
    const id = Number.isFinite(numericId) ? numericId : doc.id;
    const startsAt = normalizeTimestamp(data.startsAt);
    const endsAt = normalizeTimestamp(data.endsAt);
    const lifecycleStatus = data.status || (data.published ? 'PUBLISHED' : 'DRAFT');
    const status = campaignLifecycleStatus({
      status: lifecycleStatus,
      published: Boolean(data.published),
      startsAt,
      endsAt
    });

    const winnerCandidate = candidates.find(
      c => String(c.id) === String(data.winnerBurgerId)
    );

    return {
      id,
      name: data.name || '',
      startsAt,
      endsAt,
      published: Boolean(data.published),
      lifecycleStatus,
      status,
      winnerBurgerId: data.winnerBurgerId ?? null,
      winnerName: winnerCandidate?.name || null,
      candidates,
      userVoteBurgerId: userVote ? userVote.burgerId : null,
      userVoteQuantity: userVote ? Number(userVote.quantity || 1) : null
    };
  }

  return {
    async list({ userId = null } = {}) {
      const [campaignsSnap, burgersList, votesSnap] = await Promise.all([
        col(COLLECTIONS.campaigns).get(),
        burgersAdapter.list({ includeInactive: true }),
        col(COLLECTIONS.votes).get()
      ]);

      const burgersMap = new Map(burgersList.map(b => [String(b.id), b]));
      const votes = votesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return campaignsSnap.docs
        .map(doc => {
          const data = doc.data() || {};
          const candidateIds = Array.isArray(data.candidateBurgerIds) ? data.candidateBurgerIds : [];
          const campaignVotes = votes.filter(v => String(v.campaignId) === String(doc.id));

          const candidates = candidateIds
            .map(cid => burgersMap.get(String(cid)))
            .filter(Boolean)
            .map(burger => {
              const burgerVotes = campaignVotes.filter(
                v => String(v.burgerId) === String(burger.id)
              );
              return {
                ...burger,
                voteCount: burgerVotes.length,
                desiredQuantity: burgerVotes.reduce((sum, v) => sum + Number(v.quantity || 1), 0)
              };
            });

          const userVote =
            userId != null
              ? campaignVotes.find(v => String(v.userId) === String(userId)) || null
              : null;

          return mapCampaignDoc(doc, candidates, userVote);
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    },

    async findById(id, { userId = null } = {}) {
      const all = await this.list({ userId });
      return all.find(c => String(c.id) === String(id)) || null;
    },

    async findActive({ userId = null } = {}) {
      const all = await this.list({ userId });
      return all.find(c => c.status === 'ACTIVE') || null;
    },

    async hasOverlappingPublished({ startsAt, endsAt, excludeId = null }) {
      const all = await this.list();
      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();
      return all.some(c => {
        if (!c.published) return false;
        if (excludeId != null && String(c.id) === String(excludeId)) return false;
        return new Date(c.startsAt).getTime() < endMs && new Date(c.endsAt).getTime() > startMs;
      });
    },

    async create({ name, startsAt, endsAt, published = true, status = 'PUBLISHED', burgerIds = [] }) {
      const id = String(Date.now());
      const now = new Date().toISOString();
      await col(COLLECTIONS.campaigns)
        .doc(id)
        .set({
          name: String(name || '').trim(),
          startsAt,
          endsAt,
          published: Boolean(published),
          status,
          winnerBurgerId: null,
          candidateBurgerIds: [...new Set(burgerIds.map(String))],
          createdAt: now,
          updatedAt: now
        });
      return this.findById(id);
    },

    async update(id, { name, startsAt, endsAt, published = true, status = 'PUBLISHED', burgerIds = [] }) {
      const docRef = col(COLLECTIONS.campaigns).doc(documentIds.campaign(id));
      const snap = await docRef.get();
      if (!snap.exists) return null;
      await docRef.update({
        name: String(name || '').trim(),
        startsAt,
        endsAt,
        published: Boolean(published),
        status,
        candidateBurgerIds: [...new Set(burgerIds.map(String))],
        updatedAt: new Date().toISOString()
      });
      return this.findById(id);
    },

    async close(id) {
      const current = await this.findById(id);
      if (!current) return null;
      const top = [...current.candidates].sort(
        (a, b) => b.voteCount - a.voteCount || Number(a.id) - Number(b.id)
      )[0];
      await col(COLLECTIONS.campaigns)
        .doc(documentIds.campaign(id))
        .update({
          status: 'CLOSED',
          published: false,
          winnerBurgerId: top?.id ?? null,
          updatedAt: new Date().toISOString()
        });
      return this.findById(id);
    },

    async remove(id) {
      await col(COLLECTIONS.campaigns).doc(documentIds.campaign(id)).delete();
      return true;
    }
  };
}

export function createVotesFirestoreAdapter(firestore, { campaignsAdapter, usersAdapter, burgersAdapter }) {
  const col = name => firestore.collection(name);

  return {
    async castVote({ campaignId, userId, burgerId, quantity = 1 }) {
      const voteDocId = documentIds.vote(campaignId, userId);
      const voteRef = col(COLLECTIONS.votes).doc(voteDocId);

      await firestore.runTransaction(async tx => {
        const existing = await tx.get(voteRef);
        if (existing.exists) {
          throw DomainException.conflict(
            'Ya registraste tu voto en esta campaña.',
            'DUPLICATE_VOTE'
          );
        }
        tx.create(voteRef, {
          campaignId: String(campaignId),
          userId: String(userId),
          burgerId: String(burgerId),
          quantity: Number(quantity || 1),
          paymentStatus: 'UNPAID',
          orderId: null,
          createdAt: new Date().toISOString()
        });
      });

      return { id: voteDocId };
    },

    async listByCampaign(campaignId) {
      const all = await this.listAllWithDetails();
      return all.filter(v => String(v.campaignId) === String(campaignId));
    },

    async listAllWithDetails() {
      const [votesSnap, campaigns, usersResult, burgers] = await Promise.all([
        col(COLLECTIONS.votes).get(),
        campaignsAdapter.list(),
        usersAdapter.listPaginated({ pageSize: 1000 }),
        burgersAdapter.list({ includeInactive: true })
      ]);

      const campaignMap = new Map(campaigns.map(c => [String(c.id), c]));
      const userMap = new Map(usersResult.users.map(u => [String(u.id), u]));
      const burgerMap = new Map(burgers.map(b => [String(b.id), b]));

      return votesSnap.docs.map(doc => {
        const data = doc.data() || {};
        const campaign = campaignMap.get(String(data.campaignId)) || {};
        const user = userMap.get(String(data.userId)) || {};
        const burger = burgerMap.get(String(data.burgerId)) || {};
        const quantity = Number(data.quantity || 1);
        const unitPriceCop = Number(burger.priceCop || 0);

        return {
          voteId: doc.id,
          campaignId: data.campaignId,
          campaignName: campaign.name || 'Campaña',
          campaignLifecycleStatus: campaign.lifecycleStatus || 'PUBLISHED',
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
          published: Boolean(campaign.published),
          userId: data.userId,
          customerName: user.name || 'Cliente',
          customerEmail: user.email || '',
          burgerId: data.burgerId,
          burgerName: burger.name || 'Hamburguesa',
          ingredients: burger.ingredients || '',
          unitPriceCop,
          quantity,
          totalCop: quantity * unitPriceCop,
          paymentStatus: data.paymentStatus || 'UNPAID',
          orderId: data.orderId || null,
          orderStatus: data.orderStatus || null,
          createdAt: normalizeTimestamp(data.createdAt),
          votedAt: normalizeTimestamp(data.createdAt)
        };
      });
    },

    async findById(voteId) {
      const all = await this.listAllWithDetails();
      return all.find(v => String(v.voteId) === String(voteId)) || null;
    },

    async updatePaymentAndSyncOrder(
      voteId,
      { paymentStatus, status, phone, deliveryAddress, notes },
      ordersPort
    ) {
      const voteRow = await this.findById(voteId);
      if (!voteRow) return null;

      const voteRef = col(COLLECTIONS.votes).doc(String(voteId));
      let orderId = voteRow.orderId;

      if (paymentStatus === 'PAID' && !orderId && ordersPort) {
        const createdOrder = await ordersPort.create({
          userId: voteRow.userId,
          campaignId: voteRow.campaignId,
          status: status || 'CONFIRMED',
          paymentStatus: 'PAID',
          phone: phone || '3000000000',
          deliveryAddress: deliveryAddress || `Pedido de campaña: ${voteRow.campaignName}`,
          notes: notes || `Voto #${voteId}`,
          items: [
            {
              burgerId: voteRow.burgerId,
              quantity: voteRow.quantity,
              unitPriceCop: voteRow.unitPriceCop
            }
          ]
        });
        orderId = createdOrder.id;
      } else if (orderId && ordersPort) {
        await ordersPort.updateSaleStatus(orderId, {
          paymentStatus,
          status: paymentStatus === 'CANCELLED' ? 'CANCELLED' : status
        });
      }

      await voteRef.update({
        paymentStatus,
        orderId: orderId || null,
        updatedAt: new Date().toISOString()
      });

      const updatedVote = await this.findById(voteId);
      const syncedOrder = orderId && ordersPort ? await ordersPort.findById(orderId) : null;
      return { voteOrder: updatedVote, order: syncedOrder };
    }
  };
}

