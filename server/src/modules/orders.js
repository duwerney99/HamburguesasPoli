import { z } from 'zod';
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

function getOrder(db, id) {
  const order = db.prepare(`SELECT o.id,o.user_id userId,o.status,o.phone,o.delivery_address deliveryAddress,
    o.notes,o.total_cop totalCop,o.created_at createdAt,o.updated_at updatedAt,u.name customerName,u.email customerEmail
    FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?`).get(id);
  if (!order) return null;
  const items = db.prepare(`SELECT id,burger_id burgerId,burger_name burgerName,ingredients_snapshot ingredients,
    removed_ingredients removedIngredients,notes,quantity,unit_price_cop unitPriceCop
    FROM order_items WHERE order_id=? ORDER BY id`).all(id).map(item => ({ ...item, removedIngredients: parseJson(item.removedIngredients) }));
  return { ...order, items };
}

export function installOrderRoutes(app, { db, requireAuth, requireAnyRole, parse }) {
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
      const result = db.prepare(`INSERT INTO orders(user_id,status,phone,delivery_address,notes,total_cop)
        VALUES(?,'PENDING',?,?,?,?)`).run(Number(req.auth.sub), data.phone, data.deliveryAddress, data.notes, total);
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
    res.json({ orders: ids.map(({ id }) => getOrder(db, id)), transitions });
  });

  app.put('/api/kitchen/orders/:id/status', requireAuth, requireAnyRole('CHEF', 'ADMIN'), (req, res) => {
    const data = parse(z.object({ status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']) }), req.body, res);
    if (!data) return;
    const order = getOrder(db, Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!transitions[order.status]?.includes(data.status)) return res.status(409).json({ error: `No se puede cambiar de ${order.status} a ${data.status}.` });
    db.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(data.status, order.id);
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'ORDER_STATUS_CHANGED', entityType: 'ORDER', entityId: order.id, metadata: { from: order.status, to: data.status } });
    res.json({ order: getOrder(db, order.id) });
  });

  app.put('/api/orders/:id/cancel', requireAuth, requireAnyRole('CLIENT'), (req, res) => {
    const order = getOrder(db, Number(req.params.id));
    if (!order || order.userId !== Number(req.auth.sub)) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (order.status !== 'PENDING') return res.status(409).json({ error: 'Sólo puedes cancelar un pedido pendiente.' });
    db.prepare("UPDATE orders SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'ORDER_CANCELLED', entityType: 'ORDER', entityId: order.id });
    res.json({ order: getOrder(db, order.id) });
  });
}
