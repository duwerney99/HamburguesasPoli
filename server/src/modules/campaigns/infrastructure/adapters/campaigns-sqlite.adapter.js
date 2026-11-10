import { getCampaign, listCampaigns } from '../../../../db.js';
import { DomainException } from '../../../shared/domain/exceptions/domain.exception.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Campaigns & Votes Repository
 */
export function createCampaignsSqliteAdapter(db) {
  return {
    async list({ userId = null } = {}) {
      return listCampaigns(db, userId);
    },

    async findById(id, { userId = null } = {}) {
      return getCampaign(db, Number(id), userId);
    },

    async findActive({ userId = null } = {}) {
      const campaigns = listCampaigns(db, userId);
      return campaigns.find(c => c.status === 'ACTIVE') || null;
    },

    async hasOverlappingPublished({ startsAt, endsAt, excludeId = null }) {
      const row = db
        .prepare(
          `SELECT id FROM campaigns
           WHERE published=1
             AND (? IS NULL OR id != ?)
             AND datetime(starts_at) < datetime(?)
             AND datetime(ends_at) > datetime(?)
           LIMIT 1`
        )
        .get(excludeId, excludeId, endsAt, startsAt);
      return Boolean(row);
    },

    async create({ name, startsAt, endsAt, published = true, status = 'PUBLISHED', burgerIds = [] }) {
      const uniqueIds = [...new Set(burgerIds.map(Number))];
      const tx = db.transaction(() => {
        const result = db
          .prepare(
            'INSERT INTO campaigns(name,starts_at,ends_at,published,status) VALUES(?,?,?,?,?)'
          )
          .run(name, startsAt, endsAt, published ? 1 : 0, status);
        const campaignId = Number(result.lastInsertRowid);
        const link = db.prepare(
          'INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)'
        );
        for (const burgerId of uniqueIds) {
          link.run(campaignId, burgerId);
        }
        return campaignId;
      });
      const id = tx();
      return getCampaign(db, id);
    },

    async update(id, { name, startsAt, endsAt, published = true, status = 'PUBLISHED', burgerIds = [] }) {
      const numericId = Number(id);
      const uniqueIds = [...new Set(burgerIds.map(Number))];
      const tx = db.transaction(() => {
        db.prepare(
          'UPDATE campaigns SET name=?,starts_at=?,ends_at=?,published=?,status=? WHERE id=?'
        ).run(name, startsAt, endsAt, published ? 1 : 0, status, numericId);
        db.prepare('DELETE FROM campaign_burgers WHERE campaign_id=?').run(numericId);
        const link = db.prepare(
          'INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)'
        );
        for (const burgerId of uniqueIds) {
          link.run(numericId, burgerId);
        }
      });
      tx();
      return getCampaign(db, numericId);
    },

    async close(id) {
      const numericId = Number(id);
      const current = getCampaign(db, numericId);
      if (!current) return null;
      const top = [...current.candidates].sort(
        (a, b) => b.voteCount - a.voteCount || a.id - b.id
      )[0];
      db.prepare(
        "UPDATE campaigns SET status='CLOSED',published=0,winner_burger_id=? WHERE id=?"
      ).run(top?.id ?? null, numericId);
      return getCampaign(db, numericId);
    },

    async remove(id) {
      const numericId = Number(id);
      db.prepare('DELETE FROM campaigns WHERE id=?').run(numericId);
      return true;
    }
  };
}

export function createVotesSqliteAdapter(db) {
  return {
    async castVote({ campaignId, userId, burgerId, quantity = 1 }) {
      try {
        const result = db
          .prepare('INSERT INTO votes(user_id,campaign_id,burger_id,quantity) VALUES(?,?,?,?)')
          .run(Number(userId), Number(campaignId), Number(burgerId), Number(quantity));
        return { id: Number(result.lastInsertRowid) };
      } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed')) {
          throw DomainException.conflict(
            'Ya registraste tu voto en esta campaña.',
            'DUPLICATE_VOTE'
          );
        }
        throw error;
      }
    },

    async listByCampaign(campaignId) {
      return db
        .prepare(
          `SELECT v.id voteId,
                  v.user_id userId,
                  u.name customerName,
                  u.email customerEmail,
                  v.burger_id burgerId,
                  b.name burgerName,
                  v.quantity quantity,
                  COALESCE(v.payment_status, 'UNPAID') paymentStatus,
                  v.order_id orderId,
                  v.created_at votedAt
           FROM votes v
           JOIN users u ON u.id = v.user_id
           JOIN burgers b ON b.id = v.burger_id
           WHERE v.campaign_id = ?
           ORDER BY v.created_at DESC, v.id DESC`
        )
        .all(Number(campaignId));
    },

    async listAllWithDetails() {
      return db
        .prepare(
          `SELECT v.id voteId,
                  v.campaign_id campaignId,
                  c.name campaignName,
                  c.status campaignLifecycleStatus,
                  c.starts_at startsAt,
                  c.ends_at endsAt,
                  c.published published,
                  v.user_id userId,
                  u.name customerName,
                  u.email customerEmail,
                  v.burger_id burgerId,
                  b.name burgerName,
                  b.ingredients ingredients,
                  b.price_cop unitPriceCop,
                  v.quantity quantity,
                  (v.quantity * b.price_cop) totalCop,
                  COALESCE(v.payment_status, 'UNPAID') paymentStatus,
                  v.order_id orderId,
                  o.status orderStatus,
                  v.created_at createdAt
           FROM votes v
           JOIN campaigns c ON c.id = v.campaign_id
           JOIN users u ON u.id = v.user_id
           JOIN burgers b ON b.id = v.burger_id
           LEFT JOIN orders o ON o.id = v.order_id
           ORDER BY v.created_at DESC, v.id DESC`
        )
        .all();
    },

    async findById(voteId) {
      return (
        db
          .prepare(
            `SELECT v.id voteId,
                    v.campaign_id campaignId,
                    c.name campaignName,
                    v.user_id userId,
                    u.name customerName,
                    u.email customerEmail,
                    v.burger_id burgerId,
                    b.name burgerName,
                    b.ingredients ingredients,
                    b.price_cop unitPriceCop,
                    v.quantity quantity,
                    COALESCE(v.payment_status, 'UNPAID') paymentStatus,
                    v.order_id orderId,
                    v.created_at createdAt
             FROM votes v
             JOIN campaigns c ON c.id = v.campaign_id
             JOIN users u ON u.id = v.user_id
             JOIN burgers b ON b.id = v.burger_id
             WHERE v.id = ?`
          )
          .get(Number(voteId)) || null
      );
    },

    async updatePaymentAndSyncOrder(
      voteId,
      { paymentStatus, status, phone, deliveryAddress, notes },
      ordersPort
    ) {
      const voteRow = await this.findById(voteId);
      if (!voteRow) return null;

      let orderId = voteRow.orderId ? Number(voteRow.orderId) : null;
      const resolvedPhone = phone || '3000000000';
      const resolvedAddress = deliveryAddress || `Pedido de campaña: ${voteRow.campaignName}`;
      const resolvedNotes = notes !== undefined ? notes : `Voto #${voteRow.voteId} - ${voteRow.campaignName}`;

      const tx = db.transaction(() => {
        if (paymentStatus === 'CANCELLED') {
          db.prepare("UPDATE votes SET payment_status='CANCELLED' WHERE id=?").run(Number(voteId));
          if (orderId) {
            db.prepare(
              "UPDATE orders SET payment_status='CANCELLED',status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?"
            ).run(orderId);
          }
        } else if (paymentStatus === 'UNPAID') {
          db.prepare("UPDATE votes SET payment_status='UNPAID' WHERE id=?").run(Number(voteId));
          if (orderId) {
            db.prepare(
              "UPDATE orders SET payment_status='UNPAID',status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
            ).run(status || 'PENDING', orderId);
          }
        } else if (paymentStatus === 'PAID') {
          const nextOrderStatus = status && status !== 'CANCELLED' ? status : 'CONFIRMED';
          const totalCop = Number(voteRow.quantity) * Number(voteRow.unitPriceCop);

          if (!orderId) {
            const ins = db
              .prepare(
                `INSERT INTO orders(user_id,campaign_id,status,payment_status,phone,delivery_address,notes,total_cop)
                 VALUES(?,?,?,'PAID',?,?,?,?)`
              )
              .run(
                voteRow.userId,
                voteRow.campaignId,
                nextOrderStatus,
                resolvedPhone,
                resolvedAddress,
                resolvedNotes,
                totalCop
              );
            orderId = Number(ins.lastInsertRowid);
            db.prepare(
              'INSERT INTO order_items(order_id,burger_id,quantity,unit_price_cop) VALUES(?,?,?,?)'
            ).run(orderId, voteRow.burgerId, voteRow.quantity, voteRow.unitPriceCop);
          } else {
            db.prepare(
              `UPDATE orders
               SET payment_status='PAID',
                   status=?,
                   phone=COALESCE(?, phone),
                   delivery_address=COALESCE(?, delivery_address),
                   notes=COALESCE(?, notes),
                   updated_at=CURRENT_TIMESTAMP
               WHERE id=?`
            ).run(nextOrderStatus, phone || null, deliveryAddress || null, notes ?? null, orderId);
          }

          db.prepare("UPDATE votes SET payment_status='PAID',order_id=? WHERE id=?").run(
            orderId,
            Number(voteId)
          );
        }
      });

      tx();
      const updatedVote = await this.findById(voteId);
      const syncedOrder = orderId && ordersPort ? await ordersPort.findById(orderId) : null;
      return { voteOrder: updatedVote, order: syncedOrder };
    }
  };
}

