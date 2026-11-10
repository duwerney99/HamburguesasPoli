/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Orders Repository
 */
export function createOrdersSqliteAdapter(db) {
  function getOrderItems(orderId) {
    return db
      .prepare(
        `SELECT oi.id,
                oi.burger_id burgerId,
                b.name burgerName,
                b.ingredients ingredients,
                oi.quantity,
                oi.unit_price_cop unitPriceCop
         FROM order_items oi
         JOIN burgers b ON b.id = oi.burger_id
         WHERE oi.order_id = ?`
      )
      .all(Number(orderId));
  }

  function mapOrderRow(row) {
    if (!row) return null;
    return {
      ...row,
      paymentStatus: row.paymentStatus || 'PAID',
      items: getOrderItems(row.id)
    };
  }

  const baseSelect = `
    SELECT o.id,
           o.user_id userId,
           o.campaign_id campaignId,
           o.status,
           COALESCE(o.payment_status, 'PAID') paymentStatus,
           o.phone,
           o.delivery_address deliveryAddress,
           o.notes,
           o.total_cop totalCop,
           o.created_at createdAt,
           o.updated_at updatedAt,
           u.name customerName,
           u.email customerEmail,
           c.name campaignName
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN campaigns c ON c.id = o.campaign_id
  `;

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
      const totalCop = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPriceCop),
        0
      );

      const tx = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO orders(user_id,campaign_id,status,payment_status,phone,delivery_address,notes,total_cop)
             VALUES(?,?,?,?,?,?,?,?)`
          )
          .run(userId, campaignId, status, paymentStatus, phone, deliveryAddress, notes, totalCop);
        const orderId = Number(result.lastInsertRowid);
        const insItem = db.prepare(
          'INSERT INTO order_items(order_id,burger_id,quantity,unit_price_cop) VALUES(?,?,?,?)'
        );
        for (const item of items) {
          insItem.run(orderId, item.burgerId, item.quantity, item.unitPriceCop);
        }
        return orderId;
      });

      const orderId = tx();
      return this.findById(orderId);
    },

    async listAll() {
      const rows = db.prepare(`${baseSelect} ORDER BY o.id DESC`).all();
      return rows.map(mapOrderRow);
    },

    async listByUser(userId) {
      const rows = db
        .prepare(`${baseSelect} WHERE o.user_id = ? ORDER BY o.id DESC`)
        .all(Number(userId));
      return rows.map(mapOrderRow);
    },

    async listPaidForKitchen() {
      const rows = db
        .prepare(
          `${baseSelect}
           WHERE COALESCE(o.payment_status, 'PAID') = 'PAID'
             AND o.status != 'CANCELLED'
           ORDER BY o.id DESC`
        )
        .all();
      return rows.map(mapOrderRow);
    },

    async findById(orderId) {
      const row = db.prepare(`${baseSelect} WHERE o.id = ?`).get(Number(orderId));
      return mapOrderRow(row);
    },

    async updateStatus(orderId, nextStatus) {
      const numericId = Number(orderId);
      const exists = await this.findById(numericId);
      if (!exists) return null;
      db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
        nextStatus,
        numericId
      );
      return this.findById(numericId);
    },

    async updateSaleStatus(orderId, { paymentStatus, status }) {
      const numericId = Number(orderId);
      const current = await this.findById(numericId);
      if (!current) return null;

      const nextPaymentStatus = paymentStatus || current.paymentStatus || 'PAID';
      let nextStatus = status || current.status;
      if (nextPaymentStatus === 'CANCELLED') {
        nextStatus = 'CANCELLED';
      } else if (nextPaymentStatus === 'PAID' && nextStatus === 'PENDING') {
        nextStatus = 'CONFIRMED';
      }

      db.prepare(
        'UPDATE orders SET payment_status=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
      ).run(nextPaymentStatus, nextStatus, numericId);

      db.prepare('UPDATE votes SET payment_status=? WHERE order_id=?').run(
        nextPaymentStatus,
        numericId
      );

      return this.findById(numericId);
    }
  };
}

