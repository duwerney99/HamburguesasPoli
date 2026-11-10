import { COLLECTIONS, SUBCOLLECTIONS, documentIds } from '../../../../firestore/collections.js';
import { normalizeTimestamp } from '../../../../firestore/audit.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Orders Repository
 */
export function createOrdersFirestoreAdapter(firestore, { usersAdapter, burgersAdapter, campaignsAdapter }) {
  const col = name => firestore.collection(name);

  return {
    async create({
      userId,
      campaignId = null,
      status = 'CONFIRMED',
      paymentStatus = 'PAID',
      phone,
      deliveryAddress,
      notes = '',
      items = []
    }) {
      const id = String(Date.now());
      const now = new Date().toISOString();
      const totalCop = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPriceCop),
        0
      );
      const orderRef = col(COLLECTIONS.orders).doc(id);
      const batch = firestore.batch();

      batch.set(orderRef, {
        userId: String(userId),
        campaignId: campaignId == null ? null : String(campaignId),
        status,
        paymentStatus,
        phone,
        deliveryAddress,
        notes,
        totalCop,
        createdAt: now,
        updatedAt: now
      });

      items.forEach((item, idx) => {
        const itemRef = orderRef.collection(SUBCOLLECTIONS.orderItems).doc(String(idx + 1));
        batch.set(itemRef, {
          burgerId: String(item.burgerId),
          quantity: Number(item.quantity),
          unitPriceCop: Number(item.unitPriceCop)
        });
      });

      await batch.commit();
      return this.findById(id);
    },

    async listAll() {
      const [ordersSnap, usersResult, burgers, campaigns] = await Promise.all([
        col(COLLECTIONS.orders).get(),
        usersAdapter.listPaginated({ pageSize: 1000 }),
        burgersAdapter.list({ includeInactive: true }),
        campaignsAdapter.list()
      ]);

      const userMap = new Map(usersResult.users.map(u => [String(u.id), u]));
      const burgerMap = new Map(burgers.map(b => [String(b.id), b]));
      const campaignMap = new Map(campaigns.map(c => [String(c.id), c]));

      const orders = await Promise.all(
        ordersSnap.docs.map(async doc => {
          const data = doc.data() || {};
          const itemsSnap = await doc.ref.collection(SUBCOLLECTIONS.orderItems).get();
          const items = itemsSnap.docs.map(itemDoc => {
            const itemData = itemDoc.data() || {};
            const burger = burgerMap.get(String(itemData.burgerId)) || {};
            return {
              id: itemDoc.id,
              burgerId: itemData.burgerId,
              burgerName: burger.name || 'Hamburguesa',
              ingredients: burger.ingredients || '',
              quantity: Number(itemData.quantity || 1),
              unitPriceCop: Number(itemData.unitPriceCop || burger.priceCop || 0)
            };
          });

          const user = userMap.get(String(data.userId)) || {};
          const campaign = campaignMap.get(String(data.campaignId)) || null;
          const numericId = Number(doc.id);

          return {
            id: Number.isFinite(numericId) ? numericId : doc.id,
            userId: data.userId,
            campaignId: data.campaignId ?? null,
            campaignName: campaign?.name || null,
            status: data.status || 'CONFIRMED',
            paymentStatus: data.paymentStatus || 'PAID',
            phone: data.phone || '',
            deliveryAddress: data.deliveryAddress || '',
            notes: data.notes || '',
            totalCop: Number(data.totalCop || 0),
            createdAt: normalizeTimestamp(data.createdAt),
            updatedAt: normalizeTimestamp(data.updatedAt),
            customerName: user.name || 'Cliente',
            customerEmail: user.email || '',
            items
          };
        })
      );

      return orders.sort((a, b) => Number(b.id) - Number(a.id));
    },

    async listByUser(userId) {
      const all = await this.listAll();
      return all.filter(o => String(o.userId) === String(userId));
    },

    async listPaidForKitchen() {
      const all = await this.listAll();
      return all.filter(o => o.paymentStatus === 'PAID' && o.status !== 'CANCELLED');
    },

    async findById(orderId) {
      const all = await this.listAll();
      return all.find(o => String(o.id) === String(orderId)) || null;
    },

    async updateStatus(orderId, nextStatus) {
      const docRef = col(COLLECTIONS.orders).doc(documentIds.order(orderId));
      const snap = await docRef.get();
      if (!snap.exists) return null;
      await docRef.update({
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
      return this.findById(orderId);
    },

    async updateSaleStatus(orderId, { paymentStatus, status }) {
      const current = await this.findById(orderId);
      if (!current) return null;
      const nextPaymentStatus = paymentStatus || current.paymentStatus || 'PAID';
      let nextStatus = status || current.status;
      if (nextPaymentStatus === 'CANCELLED') nextStatus = 'CANCELLED';
      else if (nextPaymentStatus === 'PAID' && nextStatus === 'PENDING') nextStatus = 'CONFIRMED';

      await col(COLLECTIONS.orders)
        .doc(documentIds.order(orderId))
        .update({
          paymentStatus: nextPaymentStatus,
          status: nextStatus,
          updatedAt: new Date().toISOString()
        });
      return this.findById(orderId);
    }
  };
}

