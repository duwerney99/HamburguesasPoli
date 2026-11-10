/**
 * ADAPTADOR SECUNDARIO / SALIDA: SQLITE (Arquitectura Hexagonal Modular)
 * Implementa todos los puertos de salida sobre node:sqlite.
 * Si en el futuro se cambia a PostgreSQL, MySQL, MongoDB o Cloud Firestore,
 * basta con usar otro adaptador sin modificar los casos de uso ni los controladores HTTP.
 */

import { getCampaign, listCampaigns } from '../../../db.js';
import { listAudit, listAuditPaginated, writeAudit } from '../../../modules/audit.js';
import { getOrder, resolvePaymentStatus } from '../../../modules/orders.js';
import { listUsersPaginated, userWithRole } from '../../../modules/users.js';

function getCampaignOrdersForSqlite(db, campaignId) {
  if (!campaignId) return [];
  const rows = db
    .prepare(
      `SELECT v.id voteId,
              v.campaign_id campaignId,
              c.name campaignName,
              v.quantity,
              v.payment_status votePaymentStatus,
              v.order_id orderId,
              v.created_at createdAt,
              u.id userId,
              u.name customerName,
              u.email customerEmail,
              b.id burgerId,
              b.name burgerName,
              b.image_url burgerImageUrl,
              b.ingredients burgerIngredients,
              b.price_cop unitPriceCop,
              o.status orderStatus,
              o.payment_status orderPaymentStatus,
              o.phone,
              o.delivery_address deliveryAddress,
              o.notes,
              o.updated_at orderUpdatedAt
       FROM votes v
       JOIN campaigns c ON c.id = v.campaign_id
       JOIN users u ON u.id = v.user_id
       JOIN burgers b ON b.id = v.burger_id
       LEFT JOIN orders o ON o.id = v.order_id
       WHERE v.campaign_id = ?
       ORDER BY v.created_at DESC, v.id DESC`
    )
    .all(Number(campaignId));

  return rows.map(row => {
    const quantity = Number(row.quantity || 1);
    const unitPriceCop = Number(row.unitPriceCop || 0);
    const totalCop = quantity * unitPriceCop;
    const paymentStatus = row.orderId
      ? resolvePaymentStatus(row.orderPaymentStatus || row.votePaymentStatus, row.orderStatus)
      : row.votePaymentStatus === 'PAID' || row.votePaymentStatus === 'CANCELLED'
        ? row.votePaymentStatus
        : 'UNPAID';
    const kitchenStatus =
      row.orderStatus ||
      (paymentStatus === 'CANCELLED'
        ? 'CANCELLED'
        : paymentStatus === 'PAID'
          ? 'CONFIRMED'
          : 'PENDING');

    return {
      voteId: row.voteId,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      orderId: row.orderId || null,
      userId: row.userId,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      burgerId: row.burgerId,
      burgerName: row.burgerName,
      burgerImageUrl: row.burgerImageUrl || '/assets/hero-burger.jpeg',
      burgerIngredients: row.burgerIngredients,
      quantity,
      unitPriceCop,
      totalCop,
      paymentStatus,
      isPaid: paymentStatus === 'PAID',
      kitchenStatus,
      phone: row.phone || 'Pedido Campaña',
      deliveryAddress: row.deliveryAddress || `Campaña: ${row.campaignName}`,
      notes: row.notes || '',
      createdAt: row.createdAt,
      updatedAt: row.orderUpdatedAt || row.createdAt
    };
  });
}

export function createSqliteRepositoryAdapter(db) {
  if (!db) throw new Error('Se requiere una instancia de SQLite para el adaptador.');

  return {
    provider: 'sqlite',

    authTokens: {
      async saveRefreshToken({ jti, userId, tokenHash, expiresAt }) {
        db.prepare(
          'INSERT INTO refresh_tokens(jti,user_id,token_hash,expires_at,revoked) VALUES(?,?,?,?,0)'
        ).run(jti, Number(userId), tokenHash, expiresAt);
      },
      async findRefreshToken(jti) {
        return (
          db
            .prepare(
              'SELECT jti,user_id userId,token_hash tokenHash,expires_at expiresAt,revoked FROM refresh_tokens WHERE jti=?'
            )
            .get(jti) || null
        );
      },
      async revokeByJti(jti) {
        db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE jti=?').run(jti);
      },
      async revokeByHash(tokenHash) {
        db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE token_hash=?').run(tokenHash);
      },
      async revokeByUser(userId) {
        db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(Number(userId));
      }
    },

    users: {
      async findById(id) {
        return userWithRole(db, 'u.id=?', Number(id)) || null;
      },
      async findByEmail(email) {
        return userWithRole(db, 'u.email=?', String(email || '').trim().toLowerCase()) || null;
      },
      async createClient({ name, email, passwordHash }) {
        try {
          const result = db
            .prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'CLIENT')")
            .run(name, String(email).toLowerCase(), passwordHash);
          db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'CLIENT')").run(
            result.lastInsertRowid
          );
          return userWithRole(db, 'u.id=?', Number(result.lastInsertRowid));
        } catch (error) {
          if (String(error).includes('UNIQUE')) {
            throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'), {
              status: 409,
              publicMessage: 'Ese correo ya está registrado.'
            });
          }
          throw error;
        }
      },
      async setRole({ userId, role, actorUserId }) {
        const uid = Number(userId);
        const existing = db.prepare('SELECT id FROM users WHERE id=?').get(uid);
        if (!existing) return null;
        db.prepare(
          `INSERT INTO user_roles(user_id,role) VALUES(?,?)
           ON CONFLICT(user_id) DO UPDATE SET role=excluded.role`
        ).run(uid, role);
        writeAudit(db, {
          actorUserId: Number(actorUserId),
          action: 'USER_ROLE_CHANGED',
          entityType: 'USER',
          entityId: uid,
          metadata: { role }
        });
        return userWithRole(db, 'u.id=?', uid);
      },
      async listPaginated(params) {
        return listUsersPaginated(db, params);
      }
    },

    burgers: {
      async list({ includeInactive = false } = {}) {
        const sql = includeInactive
          ? 'SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active,created_at createdAt FROM burgers WHERE deleted=0 ORDER BY id DESC'
          : 'SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active,created_at createdAt FROM burgers WHERE deleted=0 AND active=1 ORDER BY id DESC';
        return db
          .prepare(sql)
          .all()
          .map(item => ({ ...item, active: Boolean(item.active) }));
      },
      async get(id) {
        const row = db
          .prepare(
            'SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active,deleted,created_at createdAt FROM burgers WHERE id=? AND deleted=0'
          )
          .get(Number(id));
        return row ? { ...row, active: Boolean(row.active), deleted: Boolean(row.deleted) } : null;
      },
      async countActiveByIds(ids = []) {
        if (!ids.length) return 0;
        const placeholders = ids.map(() => '?').join(',');
        const row = db
          .prepare(
            `SELECT COUNT(*) total FROM burgers WHERE active=1 AND deleted=0 AND id IN (${placeholders})`
          )
          .get(...ids.map(Number));
        return Number(row?.total || 0);
      },
      async create(data, actorUserId) {
        const result = db
          .prepare(
            'INSERT INTO burgers(name,description,ingredients,image_url,price_cop,active) VALUES(?,?,?,?,?,?)'
          )
          .run(
            data.name,
            data.description,
            data.ingredients,
            data.imageUrl || '/assets/hero-burger.jpeg',
            Number(data.priceCop),
            Number(Boolean(data.active))
          );
        writeAudit(db, {
          actorUserId: Number(actorUserId),
          action: 'BURGER_CREATED',
          entityType: 'BURGER',
          entityId: result.lastInsertRowid
        });
        return db
          .prepare(
            'SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active FROM burgers WHERE id=?'
          )
          .get(result.lastInsertRowid);
      },
      async update(id, data, actorUserId) {
        const burgerId = Number(id);
        const result = db
          .prepare(
            'UPDATE burgers SET name=?,description=?,ingredients=?,image_url=?,price_cop=?,active=? WHERE id=? AND deleted=0'
          )
          .run(
            data.name,
            data.description,
            data.ingredients,
            data.imageUrl || '/assets/hero-burger.jpeg',
            Number(data.priceCop),
            Number(Boolean(data.active)),
            burgerId
          );
        if (!result.changes) return null;
        writeAudit(db, {
          actorUserId: Number(actorUserId),
          action: 'BURGER_UPDATED',
          entityType: 'BURGER',
          entityId: burgerId
        });
        return { id: burgerId, ...data };
      },
      async delete(id, actorUserId) {
        const burgerId = Number(id);
        const existing = db
          .prepare('SELECT id,name FROM burgers WHERE id=? AND deleted=0')
          .get(burgerId);
        if (!existing) return null;
        db.prepare(
          "DELETE FROM campaign_burgers WHERE burger_id=? AND campaign_id IN (SELECT id FROM campaigns WHERE status='DRAFT')"
        ).run(burgerId);
        let mode = 'hard';
        try {
          db.prepare('DELETE FROM burgers WHERE id=?').run(burgerId);
        } catch (error) {
          if (String(error).includes('FOREIGN KEY')) {
            mode = 'soft';
            db.prepare('UPDATE burgers SET active=0,deleted=1 WHERE id=?').run(burgerId);
          } else {
            throw error;
          }
        }
        writeAudit(db, {
          actorUserId: Number(actorUserId),
          action: 'BURGER_DELETED',
          entityType: 'BURGER',
          entityId: burgerId,
          metadata: { name: existing.name, mode }
        });
        return true;
      }
    },

    campaigns: {
      async list(userId) {
        return listCampaigns(db, userId ? Number(userId) : undefined);
      },
      async get(id, userId) {
        return getCampaign(db, Number(id), userId ? Number(userId) : undefined);
      },
      async findOverlappingPublished({ excludeId = 0, startsAt, endsAt }) {
        return (
          db
            .prepare(
              "SELECT id FROM campaigns WHERE status='PUBLISHED' AND id<>? AND starts_at < ? AND ends_at > ? LIMIT 1"
            )
            .get(Number(excludeId || 0), endsAt, startsAt) || null
        );
      },
      async getMetaForUpdate(id) {
        return (
          db
            .prepare(
              'SELECT id,starts_at startsAt,status,(SELECT COUNT(*) FROM votes WHERE campaign_id=campaigns.id) voteCount FROM campaigns WHERE id=?'
            )
            .get(Number(id)) || null
        );
      },
      async create(data, actorUserId) {
        db.exec('BEGIN IMMEDIATE');
        try {
          const campaignId = Number(
            db
              .prepare(
                'INSERT INTO campaigns(name,starts_at,ends_at,published,status) VALUES(?,?,?,?,?)'
              )
              .run(
                data.name,
                data.startsAt,
                data.endsAt,
                Number(data.status === 'PUBLISHED'),
                data.status
              ).lastInsertRowid
          );
          const add = db.prepare(
            'INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)'
          );
          data.burgerIds.forEach(bid => add.run(campaignId, Number(bid)));
          writeAudit(db, {
            actorUserId: Number(actorUserId),
            action: 'CAMPAIGN_CREATED',
            entityType: 'CAMPAIGN',
            entityId: campaignId,
            metadata: { status: data.status }
          });
          db.exec('COMMIT');
          return getCampaign(db, campaignId);
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* ignore */
          }
          throw error;
        }
      },
      async update(id, data, actorUserId) {
        const campaignId = Number(id);
        db.exec('BEGIN IMMEDIATE');
        try {
          const update = db
            .prepare(
              'UPDATE campaigns SET name=?,starts_at=?,ends_at=?,published=?,status=? WHERE id=?'
            )
            .run(
              data.name,
              data.startsAt,
              data.endsAt,
              Number(data.status === 'PUBLISHED'),
              data.status,
              campaignId
            );
          if (!update.changes) {
            db.exec('ROLLBACK');
            return null;
          }
          db.prepare('DELETE FROM campaign_burgers WHERE campaign_id=?').run(campaignId);
          const add = db.prepare(
            'INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)'
          );
          data.burgerIds.forEach(bid => add.run(campaignId, Number(bid)));
          writeAudit(db, {
            actorUserId: Number(actorUserId),
            action: 'CAMPAIGN_UPDATED',
            entityType: 'CAMPAIGN',
            entityId: campaignId,
            metadata: { status: data.status }
          });
          db.exec('COMMIT');
          return getCampaign(db, campaignId);
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* ignore */
          }
          throw error;
        }
      },
      async close(id, winnerBurgerId, actorUserId) {
        const campaignId = Number(id);
        db.prepare(
          "UPDATE campaigns SET status='CLOSED',published=0,winner_burger_id=?,closed_at=CURRENT_TIMESTAMP WHERE id=?"
        ).run(Number(winnerBurgerId), campaignId);
        writeAudit(db, {
          actorUserId: Number(actorUserId),
          action: 'CAMPAIGN_CLOSED',
          entityType: 'CAMPAIGN',
          entityId: campaignId,
          metadata: {
            winnerBurgerId: Number(winnerBurgerId),
            tieRule: 'voteCount then desiredQuantity then candidate id'
          }
        });
        return getCampaign(db, campaignId);
      },
      async listVotes(campaignId) {
        return db
          .prepare(
            `SELECT v.id,
                    v.quantity,
                    v.payment_status paymentStatus,
                    v.order_id orderId,
                    v.created_at createdAt,
                    u.id userId,
                    u.name userName,
                    u.email userEmail,
                    b.id burgerId,
                    b.name burgerName,
                    b.image_url burgerImageUrl,
                    b.price_cop burgerPriceCop
             FROM votes v
             JOIN users u ON u.id = v.user_id
             JOIN burgers b ON b.id = v.burger_id
             WHERE v.campaign_id = ?
             ORDER BY v.created_at DESC`
          )
          .all(Number(campaignId));
      }
    },

    votes: {
      async create({ campaignId, burgerId, quantity = 1, userId }) {
        const cid = Number(campaignId);
        const bid = Number(burgerId);
        const uid = Number(userId);
        const qty = Number(quantity || 1);
        db.exec('BEGIN IMMEDIATE');
        try {
          const campaign = db
            .prepare(
              'SELECT starts_at startsAt,ends_at endsAt,published,status FROM campaigns WHERE id=?'
            )
            .get(cid);
          const nowMs = Date.now();
          if (!campaign || !campaign.published || campaign.status !== 'PUBLISHED') {
            db.exec('ROLLBACK');
            throw Object.assign(new Error('CAMPAIGN_NOT_FOUND'), {
              status: 404,
              publicMessage: 'Campaña no encontrada.'
            });
          }
          if (nowMs < Date.parse(campaign.startsAt) || nowMs >= Date.parse(campaign.endsAt)) {
            db.exec('ROLLBACK');
            throw Object.assign(new Error('CAMPAIGN_NOT_OPEN'), {
              status: 409,
              publicMessage: 'La campaña no está abierta para votación.'
            });
          }
          const candidate = db
            .prepare(
              'SELECT 1 FROM campaign_burgers cb JOIN burgers b ON b.id=cb.burger_id WHERE cb.campaign_id=? AND cb.burger_id=? AND b.active=1 AND b.deleted=0'
            )
            .get(cid, bid);
          if (!candidate) {
            db.exec('ROLLBACK');
            throw Object.assign(new Error('INVALID_CANDIDATE'), {
              status: 400,
              publicMessage: 'La hamburguesa no pertenece a esta campaña o ya no está disponible.'
            });
          }
          db.prepare('INSERT INTO votes(user_id,campaign_id,burger_id,quantity) VALUES(?,?,?,?)').run(
            uid,
            cid,
            bid,
            qty
          );
          writeAudit(db, {
            actorUserId: uid,
            action: 'VOTE_CAST',
            entityType: 'CAMPAIGN',
            entityId: cid,
            metadata: { burgerId: bid, quantity: qty }
          });
          db.exec('COMMIT');
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* transacción ya cerrada */
          }
          if (String(error).includes('UNIQUE')) {
            writeAudit(db, {
              actorUserId: uid,
              action: 'DUPLICATE_VOTE_REJECTED',
              entityType: 'CAMPAIGN',
              entityId: cid
            });
            throw Object.assign(new Error('DUPLICATE_VOTE'), {
              status: 409,
              publicMessage: 'Ya votaste en esta campaña.'
            });
          }
          throw error;
        }
      }
    },

    orders: {
      async get(id) {
        return getOrder(db, Number(id));
      },
      async create({ userId, phone, deliveryAddress, notes, items, totalCop }) {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = db
            .prepare(
              "INSERT INTO orders(user_id,status,payment_status,phone,delivery_address,notes,total_cop) VALUES(?,'PENDING','UNPAID',?,?,?,?)"
            )
            .run(Number(userId), phone, deliveryAddress, notes || '', Number(totalCop || 0));
          const orderId = Number(result.lastInsertRowid);
          const insert = db.prepare(
            'INSERT INTO order_items(order_id,burger_id,burger_name,ingredients_snapshot,removed_ingredients,notes,quantity,unit_price_cop) VALUES(?,?,?,?,?,?,?,?)'
          );
          for (const item of items) {
            insert.run(
              orderId,
              Number(item.burgerId),
              item.burgerName,
              Array.isArray(item.ingredients) ? item.ingredients.join(', ') : item.ingredients,
              JSON.stringify(item.removedIngredients || []),
              item.notes || '',
              Number(item.quantity || 1),
              Number(item.unitPriceCop || 0)
            );
          }
          writeAudit(db, {
            actorUserId: Number(userId),
            action: 'ORDER_CREATED',
            entityType: 'ORDER',
            entityId: orderId,
            metadata: { totalCop }
          });
          db.exec('COMMIT');
          return getOrder(db, orderId);
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* ignore */
          }
          throw error;
        }
      },
      async listByUser(userId) {
        const ids = db
          .prepare('SELECT id FROM orders WHERE user_id=? ORDER BY id DESC')
          .all(Number(userId));
        return ids.map(({ id }) => getOrder(db, id));
      },
      async listKitchen() {
        const ids = db
          .prepare(
            `SELECT id FROM orders ORDER BY CASE status
             WHEN 'CONFIRMED' THEN 1 WHEN 'PREPARING' THEN 2 WHEN 'PENDING' THEN 3 WHEN 'READY' THEN 4 ELSE 5 END, id`
          )
          .all();
        return ids.map(({ id }) => getOrder(db, id)).filter(Boolean);
      },
      async changeStatus({ orderId, from, to, actorUserId }) {
        const oid = Number(orderId);
        const order = getOrder(db, oid);
        if (!order) return null;
        const nextPaymentStatus =
          to === 'CANCELLED'
            ? 'CANCELLED'
            : ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(to)
              ? 'PAID'
              : order.paymentStatus;
        db.prepare(
          'UPDATE orders SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
        ).run(to, nextPaymentStatus, oid);
        if (order.voteId) {
          db.prepare('UPDATE votes SET payment_status=? WHERE id=?').run(
            nextPaymentStatus,
            order.voteId
          );
        }
        writeAudit(db, {
          actorUserId: Number(actorUserId),
          action: 'ORDER_STATUS_CHANGED',
          entityType: 'ORDER',
          entityId: oid,
          metadata: { from, to, paymentStatus: nextPaymentStatus }
        });
        return getOrder(db, oid);
      },
      async cancelByClient({ orderId, userId }) {
        const oid = Number(orderId);
        const order = getOrder(db, oid);
        if (!order || order.userId !== Number(userId)) return null;
        db.prepare(
          "UPDATE orders SET status='CANCELLED',payment_status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).run(oid);
        if (order.voteId) {
          db.prepare("UPDATE votes SET payment_status='CANCELLED' WHERE id=?").run(order.voteId);
        }
        writeAudit(db, {
          actorUserId: Number(userId),
          action: 'ORDER_CANCELLED',
          entityType: 'ORDER',
          entityId: oid
        });
        return getOrder(db, oid);
      },
      async getSalesDashboard({ campaignId } = {}) {
        const campaigns = listCampaigns(db);
        const requestedCampaignId = Number(campaignId) || null;
        const currentCampaign =
          (requestedCampaignId && campaigns.find(c => c.id === requestedCampaignId)) ||
          campaigns.find(c => c.status === 'ACTIVE') ||
          campaigns.find(c => c.published) ||
          campaigns[0] ||
          null;

        const campaignOrders = currentCampaign
          ? getCampaignOrdersForSqlite(db, currentCampaign.id)
          : [];
        const orderIds = db.prepare('SELECT id FROM orders ORDER BY id DESC').all();
        const orders = orderIds.map(({ id }) => getOrder(db, id)).filter(Boolean);

        const paidOrders = orders.filter(o => o.isPaid && o.status !== 'CANCELLED');
        const unpaidOrders = orders.filter(
          o => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED'
        );
        const cancelledOrders = orders.filter(
          o => o.status === 'CANCELLED' || o.paymentStatus === 'CANCELLED'
        );

        const unlinkedCampaignUnpaid = campaignOrders.filter(
          co => !co.orderId && co.paymentStatus === 'UNPAID'
        );
        const unlinkedCampaignCancelled = campaignOrders.filter(
          co => !co.orderId && co.paymentStatus === 'CANCELLED'
        );

        const summary = {
          totalRevenuePaidCop: paidOrders.reduce((sum, o) => sum + o.totalCop, 0),
          paidOrdersCount: paidOrders.length,
          paidBurgersCount: paidOrders.reduce((sum, o) => sum + o.totalBurgers, 0),
          unpaidOrdersCount: unpaidOrders.length + unlinkedCampaignUnpaid.length,
          unpaidTotalCop:
            unpaidOrders.reduce((sum, o) => sum + o.totalCop, 0) +
            unlinkedCampaignUnpaid.reduce((sum, co) => sum + co.totalCop, 0),
          cancelledCount: cancelledOrders.length + unlinkedCampaignCancelled.length,
          totalOrdersCount: orders.length,
          campaignId: currentCampaign?.id || null,
          campaignName: currentCampaign?.name || null,
          campaignStatus: currentCampaign?.status || null,
          campaignVotesTotal: campaignOrders.length,
          campaignBurgersTotal: campaignOrders
            .filter(co => co.paymentStatus !== 'CANCELLED')
            .reduce((sum, co) => sum + co.quantity, 0),
          campaignPaidCount: campaignOrders.filter(co => co.paymentStatus === 'PAID').length,
          campaignPaidBurgers: campaignOrders
            .filter(co => co.paymentStatus === 'PAID')
            .reduce((sum, co) => sum + co.quantity, 0),
          campaignUnpaidCount: campaignOrders.filter(co => co.paymentStatus === 'UNPAID').length,
          campaignCancelledCount: campaignOrders.filter(co => co.paymentStatus === 'CANCELLED')
            .length,
          campaignPaidRevenueCop: campaignOrders
            .filter(co => co.paymentStatus === 'PAID')
            .reduce((sum, co) => sum + co.totalCop, 0),
          campaignProjectedRevenueCop: campaignOrders
            .filter(co => co.paymentStatus !== 'CANCELLED')
            .reduce((sum, co) => sum + co.totalCop, 0)
        };

        return {
          summary,
          currentCampaign,
          campaigns: campaigns.map(c => ({
            id: c.id,
            name: c.name,
            status: c.status,
            totalVotes: c.totalVotes,
            totalDesiredQuantity: c.totalDesiredQuantity
          })),
          campaignOrders,
          orders
        };
      },
      async updateSaleOrder({ orderId, paymentStatus, status, actorUserId }) {
        const oid = Number(orderId);
        const order = getOrder(db, oid);
        if (!order) return null;

        let nextPaymentStatus = paymentStatus || order.paymentStatus;
        let nextStatus = status || order.status;

        if (paymentStatus === 'CANCELLED' || status === 'CANCELLED') {
          nextPaymentStatus = 'CANCELLED';
          nextStatus = 'CANCELLED';
        } else if (paymentStatus === 'PAID') {
          nextPaymentStatus = 'PAID';
          if (!status && (order.status === 'PENDING' || order.status === 'CANCELLED')) {
            nextStatus = 'CONFIRMED';
          }
        } else if (paymentStatus === 'UNPAID') {
          nextPaymentStatus = 'UNPAID';
          if (!status) {
            nextStatus = 'PENDING';
          }
        } else if (status && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(status)) {
          nextPaymentStatus = 'PAID';
        }

        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(
            'UPDATE orders SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
          ).run(nextStatus, nextPaymentStatus, oid);
          if (order.voteId) {
            db.prepare('UPDATE votes SET payment_status=? WHERE id=?').run(
              nextPaymentStatus,
              order.voteId
            );
          }
          writeAudit(db, {
            actorUserId: Number(actorUserId),
            action: 'ORDER_SALE_UPDATED',
            entityType: 'ORDER',
            entityId: oid,
            metadata: {
              fromStatus: order.status,
              toStatus: nextStatus,
              fromPaymentStatus: order.paymentStatus,
              toPaymentStatus: nextPaymentStatus
            }
          });
          db.exec('COMMIT');
          return getOrder(db, oid);
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* ignore */
          }
          throw error;
        }
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
        const vid = Number(voteId);
        const vote = db
          .prepare(
            `SELECT v.id,
                    v.user_id userId,
                    v.campaign_id campaignId,
                    v.burger_id burgerId,
                    v.quantity,
                    v.payment_status paymentStatus,
                    v.order_id orderId,
                    c.name campaignName,
                    b.name burgerName,
                    b.ingredients burgerIngredients,
                    b.price_cop priceCop
             FROM votes v
             JOIN campaigns c ON c.id = v.campaign_id
             JOIN burgers b ON b.id = v.burger_id
             WHERE v.id = ?`
          )
          .get(vid);

        if (!vote) return null;

        let nextPaymentStatus = paymentStatus || vote.paymentStatus || 'UNPAID';
        let nextStatus = status || null;

        if (paymentStatus === 'CANCELLED' || status === 'CANCELLED') {
          nextPaymentStatus = 'CANCELLED';
          nextStatus = 'CANCELLED';
        } else if (
          paymentStatus === 'PAID' ||
          (status && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(status))
        ) {
          nextPaymentStatus = 'PAID';
          if (!nextStatus || nextStatus === 'PENDING') {
            nextStatus = 'CONFIRMED';
          }
        } else if (paymentStatus === 'UNPAID') {
          nextPaymentStatus = 'UNPAID';
          nextStatus = 'PENDING';
        }

        db.exec('BEGIN IMMEDIATE');
        try {
          let linkedOrderId = vote.orderId ? Number(vote.orderId) : null;
          const existingOrder = linkedOrderId ? getOrder(db, linkedOrderId) : null;

          if (nextPaymentStatus === 'PAID') {
            if (!existingOrder) {
              const totalCop = Number(vote.quantity || 1) * Number(vote.priceCop || 0);
              const insertOrder = db
                .prepare(
                  `INSERT INTO orders(user_id,status,payment_status,campaign_id,vote_id,phone,delivery_address,notes,total_cop)
                   VALUES(?,?,?,?,?,?,?,?,?)`
                )
                .run(
                  vote.userId,
                  nextStatus || 'CONFIRMED',
                  'PAID',
                  vote.campaignId,
                  vote.id,
                  phone || 'Pedido Campaña',
                  deliveryAddress || `Campaña: ${vote.campaignName}`,
                  notes || `Pedido generado desde campaña ${vote.campaignName}`,
                  totalCop
                );
              linkedOrderId = Number(insertOrder.lastInsertRowid);
              db.prepare(
                `INSERT INTO order_items(order_id,burger_id,burger_name,ingredients_snapshot,removed_ingredients,notes,quantity,unit_price_cop)
                 VALUES(?,?,?,?,?,?,?,?)`
              ).run(
                linkedOrderId,
                vote.burgerId,
                vote.burgerName,
                vote.burgerIngredients,
                '[]',
                '',
                Number(vote.quantity || 1),
                Number(vote.priceCop || 0)
              );
            } else {
              const targetStatus =
                status ||
                (existingOrder.status === 'PENDING' || existingOrder.status === 'CANCELLED'
                  ? 'CONFIRMED'
                  : existingOrder.status);
              db.prepare(
                'UPDATE orders SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
              ).run(targetStatus, 'PAID', linkedOrderId);
            }
            db.prepare('UPDATE votes SET payment_status=?,order_id=? WHERE id=?').run(
              'PAID',
              linkedOrderId,
              vote.id
            );
          } else if (nextPaymentStatus === 'CANCELLED') {
            if (existingOrder) {
              db.prepare(
                "UPDATE orders SET status='CANCELLED',payment_status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?"
              ).run(linkedOrderId);
            }
            db.prepare("UPDATE votes SET payment_status='CANCELLED' WHERE id=?").run(vote.id);
          } else {
            if (existingOrder) {
              db.prepare(
                "UPDATE orders SET status='PENDING',payment_status='UNPAID',updated_at=CURRENT_TIMESTAMP WHERE id=?"
              ).run(linkedOrderId);
            }
            db.prepare("UPDATE votes SET payment_status='UNPAID' WHERE id=?").run(vote.id);
          }

          writeAudit(db, {
            actorUserId: Number(actorUserId),
            action: 'CAMPAIGN_SALE_UPDATED',
            entityType: 'CAMPAIGN',
            entityId: vote.campaignId,
            metadata: {
              voteId: vote.id,
              orderId: linkedOrderId,
              paymentStatus: nextPaymentStatus,
              status: nextStatus
            }
          });

          db.exec('COMMIT');
          const updatedCampaignOrders = getCampaignOrdersForSqlite(db, vote.campaignId);
          const voteOrder = updatedCampaignOrders.find(item => item.voteId === vote.id) || null;
          const order = linkedOrderId ? getOrder(db, linkedOrderId) : null;
          return { voteOrder, order };
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* ignore */
          }
          throw error;
        }
      }
    },

    audit: {
      async write(entry) {
        writeAudit(db, entry);
      },
      async list(limit = 100) {
        return listAudit(db, limit);
      },
      async listPaginated(params) {
        return listAuditPaginated(db, params);
      }
    },

    stats: {
      async getDashboardStats() {
        const totals = {
          users: db.prepare("SELECT COUNT(*) total FROM users WHERE role='CLIENT'").get().total,
          staff: db.prepare("SELECT COUNT(*) total FROM user_roles WHERE role IN ('ADMIN','CHEF')")
            .get().total,
          totalUsers: db.prepare('SELECT COUNT(*) total FROM users').get().total,
          burgers: db.prepare('SELECT COUNT(*) total FROM burgers WHERE active=1 AND deleted=0')
            .get().total,
          totalBurgers: db.prepare('SELECT COUNT(*) total FROM burgers WHERE deleted=0').get()
            .total,
          campaigns: db.prepare('SELECT COUNT(*) total FROM campaigns').get().total,
          votes: db.prepare('SELECT COUNT(*) total FROM votes').get().total,
          desiredBurgers: db
            .prepare('SELECT COALESCE(SUM(quantity), 0) total FROM votes')
            .get().total,
          orders: db
            .prepare("SELECT COUNT(*) total FROM orders WHERE status NOT IN ('DELIVERED','CANCELLED')")
            .get().total,
          totalOrders: db.prepare('SELECT COUNT(*) total FROM orders').get().total,
          revenueCop: db
            .prepare("SELECT COALESCE(SUM(total_cop), 0) total FROM orders WHERE status <> 'CANCELLED'")
            .get().total
        };

        const orderStatusRows = db
          .prepare(
            'SELECT status, COUNT(*) count, COALESCE(SUM(total_cop), 0) totalCop FROM orders GROUP BY status'
          )
          .all();

        const topBurgers = db
          .prepare(
            `SELECT b.id,
                    b.name,
                    b.image_url imageUrl,
                    b.price_cop priceCop,
                    b.active,
                    (SELECT COUNT(*) FROM votes v WHERE v.burger_id = b.id) voteCount,
                    (SELECT COALESCE(SUM(v.quantity), 0) FROM votes v WHERE v.burger_id = b.id) desiredQuantity,
                    (SELECT COALESCE(SUM(oi.quantity), 0)
                     FROM order_items oi
                     JOIN orders o ON o.id = oi.order_id
                     WHERE oi.burger_id = b.id AND o.status <> 'CANCELLED') orderedQuantity
             FROM burgers b
             WHERE b.deleted = 0
             ORDER BY voteCount DESC, desiredQuantity DESC, orderedQuantity DESC, b.id ASC`
          )
          .all()
          .map(b => ({
            ...b,
            active: Boolean(b.active),
            voteCount: Number(b.voteCount || 0),
            desiredQuantity: Number(b.desiredQuantity || 0),
            orderedQuantity: Number(b.orderedQuantity || 0)
          }));

        const auditByEntity = db
          .prepare(
            'SELECT entity_type entityType, COUNT(*) count FROM audit_logs GROUP BY entity_type ORDER BY count DESC'
          )
          .all();

        return {
          totals,
          campaigns: listCampaigns(db),
          charts: {
            ordersByStatus: orderStatusRows,
            topBurgers,
            auditByEntity
          }
        };
      }
    }
  };
}
