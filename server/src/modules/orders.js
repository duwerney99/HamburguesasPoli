import { z } from 'zod';
import { listCampaigns } from '../db.js';
import { writeAudit } from './audit.js';

const orderItemSchema = z.object({
  burgerId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(10),
  removedIngredients: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  notes: z.string().trim().max(250).default('')
});
const orderSchema = z.object({
  phone: z.string().trim().min(7).max(30),
  deliveryAddress: z.string().trim().min(8).max(250),
  notes: z.string().trim().max(500).default(''),
  items: z.array(orderItemSchema).min(1).max(20)
});

const saleOrderUpdateSchema = z.object({
  paymentStatus: z.enum(['PAID', 'UNPAID', 'CANCELLED']).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']).optional()
});

const campaignVoteOrderUpdateSchema = z.object({
  paymentStatus: z.enum(['PAID', 'UNPAID', 'CANCELLED']).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']).optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  deliveryAddress: z.string().trim().min(5).max(250).optional(),
  notes: z.string().trim().max(500).optional()
});

const transitions = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: []
};

function parseJson(value, fallback = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function resolvePaymentStatus(rawPaymentStatus, orderStatus) {
  if (orderStatus === 'CANCELLED' || rawPaymentStatus === 'CANCELLED') return 'CANCELLED';
  if (rawPaymentStatus === 'PAID' || ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(orderStatus)) return 'PAID';
  return 'UNPAID';
}

export function getOrder(db, id) {
  const order = db.prepare(`SELECT o.id,o.user_id userId,o.status,o.payment_status rawPaymentStatus,
    o.campaign_id campaignId,o.vote_id voteId,o.phone,o.delivery_address deliveryAddress,
    o.notes,o.total_cop totalCop,o.created_at createdAt,o.updated_at updatedAt,
    u.name customerName,u.email customerEmail,c.name campaignName
    FROM orders o
    JOIN users u ON u.id=o.user_id
    LEFT JOIN campaigns c ON c.id=o.campaign_id
    WHERE o.id=?`).get(id);
  if (!order) return null;
  const items = db.prepare(`SELECT oi.id,oi.burger_id burgerId,oi.burger_name burgerName,
    oi.ingredients_snapshot ingredients,oi.removed_ingredients removedIngredients,
    oi.notes,oi.quantity,oi.unit_price_cop unitPriceCop,
    COALESCE(b.image_url, '/assets/hero-burger.jpeg') burgerImageUrl
    FROM order_items oi
    LEFT JOIN burgers b ON b.id=oi.burger_id
    WHERE oi.order_id=? ORDER BY oi.id`).all(id).map(item => ({
    ...item,
    quantity: Number(item.quantity || 0),
    unitPriceCop: Number(item.unitPriceCop || 0),
    removedIngredients: parseJson(item.removedIngredients)
  }));
  const paymentStatus = resolvePaymentStatus(order.rawPaymentStatus, order.status);
  const totalBurgers = items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    ...order,
    totalCop: Number(order.totalCop || 0),
    paymentStatus,
    isPaid: paymentStatus === 'PAID',
    totalBurgers,
    items
  };
}

function buildKitchenInsights(allOrders) {
  const paidOrders = allOrders.filter(order => order.isPaid && order.status !== 'CANCELLED');
  const byBurgerMap = new Map();
  const byClientMap = new Map();

  let totalBurgersToMake = 0;
  let totalBurgersQueued = 0;
  let totalBurgersInGrill = 0;
  let totalBurgersReady = 0;
  let totalBurgersDelivered = 0;
  let totalBurgersPaid = 0;

  for (const order of paidOrders) {
    const isQueued = order.status === 'CONFIRMED' || order.status === 'PENDING';
    const isPreparing = order.status === 'PREPARING';
    const isToMake = isQueued || isPreparing;
    const isReady = order.status === 'READY';
    const isDelivered = order.status === 'DELIVERED';

    let clientEntry = byClientMap.get(order.userId);
    if (!clientEntry) {
      clientEntry = {
        userId: order.userId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        phone: order.phone,
        deliveryAddress: order.deliveryAddress,
        paidOrdersCount: 0,
        totalBurgers: 0,
        burgersToMake: 0,
        burgersReady: 0,
        burgersDelivered: 0,
        totalPaidCop: 0,
        latestOrderAt: order.createdAt,
        latestStatus: order.status,
        itemsMap: new Map(),
        orders: []
      };
      byClientMap.set(order.userId, clientEntry);
    }

    clientEntry.paidOrdersCount += 1;
    clientEntry.totalPaidCop += Number(order.totalCop || 0);
    if (String(order.createdAt) > String(clientEntry.latestOrderAt)) {
      clientEntry.latestOrderAt = order.createdAt;
      clientEntry.latestStatus = order.status;
    }
    clientEntry.orders.push({
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalCop: order.totalCop,
      totalBurgers: order.totalBurgers,
      campaignName: order.campaignName || null,
      createdAt: order.createdAt
    });

    for (const item of order.items) {
      const qty = Number(item.quantity || 0);
      totalBurgersPaid += qty;
      if (isToMake) totalBurgersToMake += qty;
      if (isQueued) totalBurgersQueued += qty;
      if (isPreparing) totalBurgersInGrill += qty;
      if (isReady) totalBurgersReady += qty;
      if (isDelivered) totalBurgersDelivered += qty;

      clientEntry.totalBurgers += qty;
      if (isToMake) clientEntry.burgersToMake += qty;
      if (isReady) clientEntry.burgersReady += qty;
      if (isDelivered) clientEntry.burgersDelivered += qty;

      const existingClientBurger = clientEntry.itemsMap.get(item.burgerId) || {
        burgerId: item.burgerId,
        burgerName: item.burgerName,
        burgerImageUrl: item.burgerImageUrl,
        quantity: 0
      };
      existingClientBurger.quantity += qty;
      clientEntry.itemsMap.set(item.burgerId, existingClientBurger);

      let burgerEntry = byBurgerMap.get(item.burgerId);
      if (!burgerEntry) {
        burgerEntry = {
          burgerId: item.burgerId,
          burgerName: item.burgerName,
          burgerImageUrl: item.burgerImageUrl,
          ingredients: item.ingredients,
          toMakeQuantity: 0,
          queuedQuantity: 0,
          preparingQuantity: 0,
          readyQuantity: 0,
          deliveredQuantity: 0,
          totalPaidQuantity: 0,
          ordersCount: 0,
          requests: []
        };
        byBurgerMap.set(item.burgerId, burgerEntry);
      }

      burgerEntry.totalPaidQuantity += qty;
      if (isToMake) burgerEntry.toMakeQuantity += qty;
      if (isQueued) burgerEntry.queuedQuantity += qty;
      if (isPreparing) burgerEntry.preparingQuantity += qty;
      if (isReady) burgerEntry.readyQuantity += qty;
      if (isDelivered) burgerEntry.deliveredQuantity += qty;
      burgerEntry.ordersCount += 1;
      burgerEntry.requests.push({
        orderId: order.id,
        customerName: order.customerName,
        quantity: qty,
        status: order.status,
        removedIngredients: item.removedIngredients || [],
        notes: item.notes || ''
      });
    }
  }

  const byBurger = Array.from(byBurgerMap.values()).sort(
    (a, b) =>
      b.toMakeQuantity - a.toMakeQuantity ||
      b.readyQuantity - a.readyQuantity ||
      b.totalPaidQuantity - a.totalPaidQuantity ||
      a.burgerId - b.burgerId
  );

  const clientBreakdown = Array.from(byClientMap.values())
    .map(({ itemsMap, ...client }) => ({
      ...client,
      itemsSummary: Array.from(itemsMap.values()).sort((a, b) => b.quantity - a.quantity)
    }))
    .sort((a, b) => b.burgersToMake - a.burgersToMake || b.totalBurgers - a.totalBurgers || b.totalPaidCop - a.totalPaidCop);

  return {
    paidOrders,
    productionSummary: {
      totalPaidOrders: paidOrders.length,
      activePaidOrders: paidOrders.filter(order => order.status !== 'DELIVERED').length,
      totalBurgersToMake,
      totalBurgersQueued,
      totalBurgersInGrill,
      totalBurgersReady,
      totalBurgersDelivered,
      totalBurgersPaid,
      byBurger
    },
    clientBreakdown
  };
}

function getCampaignOrdersForCampaign(db, campaignId) {
  if (!campaignId) return [];
  const rows = db.prepare(`
    SELECT v.id voteId,
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
    ORDER BY v.created_at DESC, v.id DESC
  `).all(campaignId);

  return rows.map(row => {
    const quantity = Number(row.quantity || 1);
    const unitPriceCop = Number(row.unitPriceCop || 0);
    const totalCop = quantity * unitPriceCop;
    const paymentStatus = row.orderId
      ? resolvePaymentStatus(row.orderPaymentStatus || row.votePaymentStatus, row.orderStatus)
      : (row.votePaymentStatus === 'PAID' || row.votePaymentStatus === 'CANCELLED' ? row.votePaymentStatus : 'UNPAID');
    const kitchenStatus = row.orderStatus || (paymentStatus === 'CANCELLED' ? 'CANCELLED' : paymentStatus === 'PAID' ? 'CONFIRMED' : 'PENDING');

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

export function installOrderRoutes(app, { db, requireAuth, requireRole, requireAnyRole, parse }) {
  const adminGuard = requireRole ? requireRole('ADMIN') : requireAnyRole('ADMIN');

  app.post('/api/orders', requireAuth, requireAnyRole('CLIENT'), (req, res) => {
    const data = parse(orderSchema, req.body, res);
    if (!data) return;
    db.exec('BEGIN IMMEDIATE');
    try {
      const preparedItems = data.items.map(item => {
        const burger = db.prepare('SELECT id,name,ingredients,price_cop priceCop,active,deleted FROM burgers WHERE id=?').get(item.burgerId);
        if (!burger || !burger.active || burger.deleted) throw Object.assign(new Error('BURGER_UNAVAILABLE'), { status: 409, publicMessage: 'Una hamburguesa ya no está disponible.' });
        const ingredients = burger.ingredients.split(',').map(value => value.trim()).filter(Boolean);
        const allowed = new Set(ingredients.map(value => value.toLocaleLowerCase('es')));
        if (item.removedIngredients.some(value => !allowed.has(value.toLocaleLowerCase('es')))) throw Object.assign(new Error('INVALID_INGREDIENT'), { status: 400, publicMessage: `Solo puedes retirar ingredientes existentes de ${burger.name}.` });
        return { ...item, burger, ingredients };
      });
      const total = preparedItems.reduce((sum, item) => sum + item.burger.priceCop * item.quantity, 0);
      const result = db.prepare(`INSERT INTO orders(user_id,status,payment_status,phone,delivery_address,notes,total_cop)
        VALUES(?,'PENDING','UNPAID',?,?,?,?)`).run(Number(req.auth.sub), data.phone, data.deliveryAddress, data.notes, total);
      const orderId = Number(result.lastInsertRowid);
      const insert = db.prepare(`INSERT INTO order_items(order_id,burger_id,burger_name,ingredients_snapshot,removed_ingredients,notes,quantity,unit_price_cop)
        VALUES(?,?,?,?,?,?,?,?)`);
      for (const item of preparedItems) insert.run(orderId, item.burger.id, item.burger.name, item.ingredients.join(', '), JSON.stringify(item.removedIngredients), item.notes, item.quantity, item.burger.priceCop);
      writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'ORDER_CREATED', entityType: 'ORDER', entityId: orderId, metadata: { totalCop: total } });
      db.exec('COMMIT');
      res.status(201).json({ order: getOrder(db, orderId) });
    } catch (error) {
      db.exec('ROLLBACK');
      if (error.status) return res.status(error.status).json({ error: error.publicMessage });
      throw error;
    }
  });

  app.get('/api/orders/mine', requireAuth, requireAnyRole('CLIENT'), (req, res) => {
    const ids = db.prepare('SELECT id FROM orders WHERE user_id=? ORDER BY id DESC').all(Number(req.auth.sub));
    res.json({ orders: ids.map(({ id }) => getOrder(db, id)) });
  });

  app.get('/api/kitchen/orders', requireAuth, requireAnyRole('CHEF', 'ADMIN'), (_req, res) => {
    const ids = db.prepare(`SELECT id FROM orders ORDER BY CASE status
      WHEN 'CONFIRMED' THEN 1 WHEN 'PREPARING' THEN 2 WHEN 'PENDING' THEN 3 WHEN 'READY' THEN 4 ELSE 5 END, id`).all();
    const orders = ids.map(({ id }) => getOrder(db, id)).filter(Boolean);
    const { paidOrders, productionSummary, clientBreakdown } = buildKitchenInsights(orders);
    res.json({
      orders,
      paidOrders,
      productionSummary,
      clientBreakdown,
      transitions
    });
  });

  app.put('/api/kitchen/orders/:id/status', requireAuth, requireAnyRole('CHEF', 'ADMIN'), (req, res) => {
    const data = parse(z.object({ status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']) }), req.body, res);
    if (!data) return;
    const order = getOrder(db, Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!transitions[order.status]?.includes(data.status)) return res.status(409).json({ error: `No se puede cambiar de ${order.status} a ${data.status}.` });

    const nextPaymentStatus = data.status === 'CANCELLED'
      ? 'CANCELLED'
      : ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(data.status)
        ? 'PAID'
        : order.paymentStatus;

    db.prepare('UPDATE orders SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(data.status, nextPaymentStatus, order.id);
    if (order.voteId) {
      db.prepare('UPDATE votes SET payment_status=? WHERE id=?').run(nextPaymentStatus, order.voteId);
    }
    writeAudit(db, {
      actorUserId: Number(req.auth.sub),
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: { from: order.status, to: data.status, paymentStatus: nextPaymentStatus }
    });
    res.json({ order: getOrder(db, order.id) });
  });

  app.put('/api/orders/:id/cancel', requireAuth, requireAnyRole('CLIENT'), (req, res) => {
    const order = getOrder(db, Number(req.params.id));
    if (!order || order.userId !== Number(req.auth.sub)) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (order.status !== 'PENDING') return res.status(409).json({ error: 'Sólo puedes cancelar un pedido pendiente.' });
    db.prepare("UPDATE orders SET status='CANCELLED',payment_status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
    if (order.voteId) {
      db.prepare("UPDATE votes SET payment_status='CANCELLED' WHERE id=?").run(order.voteId);
    }
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'ORDER_CANCELLED', entityType: 'ORDER', entityId: order.id });
    res.json({ order: getOrder(db, order.id) });
  });

  app.get('/api/admin/sales', requireAuth, adminGuard, (req, res) => {
    const campaigns = listCampaigns(db);
    const requestedCampaignId = Number(req.query.campaignId) || null;
    const currentCampaign =
      (requestedCampaignId && campaigns.find(c => c.id === requestedCampaignId)) ||
      campaigns.find(c => c.status === 'ACTIVE') ||
      campaigns.find(c => c.published) ||
      campaigns[0] ||
      null;

    const campaignOrders = currentCampaign ? getCampaignOrdersForCampaign(db, currentCampaign.id) : [];
    const orderIds = db.prepare('SELECT id FROM orders ORDER BY id DESC').all();
    const orders = orderIds.map(({ id }) => getOrder(db, id)).filter(Boolean);

    const paidOrders = orders.filter(o => o.isPaid && o.status !== 'CANCELLED');
    const unpaidOrders = orders.filter(o => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED');
    const cancelledOrders = orders.filter(o => o.status === 'CANCELLED' || o.paymentStatus === 'CANCELLED');

    const unlinkedCampaignUnpaid = campaignOrders.filter(co => !co.orderId && co.paymentStatus === 'UNPAID');
    const unlinkedCampaignCancelled = campaignOrders.filter(co => !co.orderId && co.paymentStatus === 'CANCELLED');

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
      campaignCancelledCount: campaignOrders.filter(co => co.paymentStatus === 'CANCELLED').length,
      campaignPaidRevenueCop: campaignOrders
        .filter(co => co.paymentStatus === 'PAID')
        .reduce((sum, co) => sum + co.totalCop, 0),
      campaignProjectedRevenueCop: campaignOrders
        .filter(co => co.paymentStatus !== 'CANCELLED')
        .reduce((sum, co) => sum + co.totalCop, 0)
    };

    res.json({
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
    });
  });

  app.put('/api/admin/sales/orders/:id', requireAuth, adminGuard, (req, res) => {
    const data = parse(saleOrderUpdateSchema, req.body, res);
    if (!data) return;
    const order = getOrder(db, Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });

    let nextPaymentStatus = data.paymentStatus || order.paymentStatus;
    let nextStatus = data.status || order.status;

    if (data.paymentStatus === 'CANCELLED' || data.status === 'CANCELLED') {
      nextPaymentStatus = 'CANCELLED';
      nextStatus = 'CANCELLED';
    } else if (data.paymentStatus === 'PAID') {
      nextPaymentStatus = 'PAID';
      if (!data.status && (order.status === 'PENDING' || order.status === 'CANCELLED')) {
        nextStatus = 'CONFIRMED';
      }
    } else if (data.paymentStatus === 'UNPAID') {
      nextPaymentStatus = 'UNPAID';
      if (!data.status) {
        nextStatus = 'PENDING';
      }
    } else if (data.status && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(data.status)) {
      nextPaymentStatus = 'PAID';
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE orders SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
        nextStatus,
        nextPaymentStatus,
        order.id
      );
      if (order.voteId) {
        db.prepare('UPDATE votes SET payment_status=? WHERE id=?').run(nextPaymentStatus, order.voteId);
      }
      writeAudit(db, {
        actorUserId: Number(req.auth.sub),
        action: 'ORDER_SALE_UPDATED',
        entityType: 'ORDER',
        entityId: order.id,
        metadata: {
          fromStatus: order.status,
          toStatus: nextStatus,
          fromPaymentStatus: order.paymentStatus,
          toPaymentStatus: nextPaymentStatus
        }
      });
      db.exec('COMMIT');
      res.json({ order: getOrder(db, order.id) });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  app.put('/api/admin/sales/campaign-votes/:voteId', requireAuth, adminGuard, (req, res) => {
    const data = parse(campaignVoteOrderUpdateSchema, req.body, res);
    if (!data) return;
    const voteId = Number(req.params.voteId);
    const vote = db.prepare(`
      SELECT v.id,
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
      WHERE v.id = ?
    `).get(voteId);

    if (!vote) return res.status(404).json({ error: 'Solicitud de campaña no encontrada.' });

    let nextPaymentStatus = data.paymentStatus || vote.paymentStatus || 'UNPAID';
    let nextStatus = data.status || null;

    if (data.paymentStatus === 'CANCELLED' || data.status === 'CANCELLED') {
      nextPaymentStatus = 'CANCELLED';
      nextStatus = 'CANCELLED';
    } else if (data.paymentStatus === 'PAID' || (data.status && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(data.status))) {
      nextPaymentStatus = 'PAID';
      if (!nextStatus || nextStatus === 'PENDING') {
        nextStatus = 'CONFIRMED';
      }
    } else if (data.paymentStatus === 'UNPAID') {
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
          const phone = data.phone || 'Pedido Campaña';
          const deliveryAddress = data.deliveryAddress || `Campaña: ${vote.campaignName}`;
          const notes = data.notes || `Pedido generado desde campaña ${vote.campaignName}`;
          const insertOrder = db.prepare(`
            INSERT INTO orders(user_id,status,payment_status,campaign_id,vote_id,phone,delivery_address,notes,total_cop)
            VALUES(?,?,?,?,?,?,?,?,?)
          `).run(
            vote.userId,
            nextStatus || 'CONFIRMED',
            'PAID',
            vote.campaignId,
            vote.id,
            phone,
            deliveryAddress,
            notes,
            totalCop
          );
          linkedOrderId = Number(insertOrder.lastInsertRowid);
          db.prepare(`
            INSERT INTO order_items(order_id,burger_id,burger_name,ingredients_snapshot,removed_ingredients,notes,quantity,unit_price_cop)
            VALUES(?,?,?,?,?,?,?,?)
          `).run(
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
          const targetStatus = data.status || (existingOrder.status === 'PENDING' || existingOrder.status === 'CANCELLED' ? 'CONFIRMED' : existingOrder.status);
          db.prepare('UPDATE orders SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
            targetStatus,
            'PAID',
            linkedOrderId
          );
        }
        db.prepare('UPDATE votes SET payment_status=?,order_id=? WHERE id=?').run('PAID', linkedOrderId, vote.id);
      } else if (nextPaymentStatus === 'CANCELLED') {
        if (existingOrder) {
          db.prepare("UPDATE orders SET status='CANCELLED',payment_status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(linkedOrderId);
        }
        db.prepare("UPDATE votes SET payment_status='CANCELLED' WHERE id=?").run(vote.id);
      } else {
        if (existingOrder) {
          db.prepare("UPDATE orders SET status='PENDING',payment_status='UNPAID',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(linkedOrderId);
        }
        db.prepare("UPDATE votes SET payment_status='UNPAID' WHERE id=?").run(vote.id);
      }

      writeAudit(db, {
        actorUserId: Number(req.auth.sub),
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
      const updatedCampaignOrders = getCampaignOrdersForCampaign(db, vote.campaignId);
      const voteOrder = updatedCampaignOrders.find(item => item.voteId === vote.id) || null;
      const order = linkedOrderId ? getOrder(db, linkedOrderId) : null;
      res.json({ voteOrder, order });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}
