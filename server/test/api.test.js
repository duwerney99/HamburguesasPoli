import { test, expect } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db.js';
import { seedDatabase } from '../src/seed-data.js';
import { createApp } from '../src/app.js';
import { ADMIN_ROUTES, normalizePath } from '../../client/src/router.js';

function fixture() {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const app = createApp({ db, jwtSecret: 'test-secret-with-enough-entropy', rateLimits: false });
  return { db, app };
}

async function login(app, email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return response.body.token;
}

test('TC-02: diez solicitudes concurrentes del mismo cliente registran un único voto', async () => {
  const { db, app } = fixture();
  try {
    const token = await login(app, 'cliente@secretbite.co', 'Cliente123!');
    const campaign = (await request(app).get('/api/campaigns/active').expect(200)).body.campaign;
    const attempts = await Promise.all(Array.from({ length: 10 }, () => request(app).post(`/api/campaigns/${campaign.id}/votes`).set('Authorization', `Bearer ${token}`).send({ burgerId: campaign.candidates[0].id })));
    expect(attempts.filter(response => response.status === 201).length).toBe(1);
    expect(attempts.filter(response => response.status === 409).length).toBe(9);
    expect(db.prepare('SELECT COUNT(*) total FROM votes').get().total).toBe(1);
  } finally { db.close(); }
});

test('TC-01: rechaza el voto cuando la campaña ya cerró', async () => {
  const { db, app } = fixture();
  try {
    const token = await login(app, 'cliente@secretbite.co', 'Cliente123!');
    const campaignId = Number(db.prepare("INSERT INTO campaigns(name,starts_at,ends_at,published) VALUES('Cerrada',?,?,1)").run(new Date(Date.now() - 2000).toISOString(), new Date(Date.now() - 1000).toISOString()).lastInsertRowid);
    const burgerId = db.prepare('SELECT id FROM burgers LIMIT 1').get().id;
    db.prepare('INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)').run(campaignId, burgerId);
    const response = await request(app).post(`/api/campaigns/${campaignId}/votes`).set('Authorization', `Bearer ${token}`).send({ burgerId }).expect(409);
    expect(response.body.error).toMatch(/no está abierta/i);
    expect(db.prepare('SELECT COUNT(*) total FROM votes WHERE campaign_id=?').get(campaignId).total).toBe(0);
  } finally { db.close(); }
});

test('TC-03: un cliente no puede crear campañas', async () => {
  const { db, app } = fixture();
  try {
    const token = await login(app, 'cliente@secretbite.co', 'Cliente123!');
    const burgerIds = db.prepare('SELECT id FROM burgers LIMIT 2').all().map(row => row.id);
    await request(app).post('/api/campaigns').set('Authorization', `Bearer ${token}`).send({ name: 'No autorizada', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), published: true, burgerIds }).expect(403);
  } finally { db.close(); }
});

test('registro, sesión y consulta del usuario autenticado', async () => {
  const { db, app } = fixture();
  try {
    const register = await request(app).post('/api/auth/register').send({ name: 'Ana Prueba', email: 'ana@example.com', password: 'Segura123!' }).expect(201);
    expect(register.body.user.role).toBe('CLIENT');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${register.body.token}`).expect(200);
    expect(me.body.user.email).toBe('ana@example.com');
  } finally { db.close(); }
});

test('un cliente crea un pedido personalizado y cocina avanza su estado', async () => {
  const { db, app } = fixture();
  try {
    const clientToken = await login(app, 'cliente@secretbite.co', 'Cliente123!');
    const chefToken = await login(app, 'chef@secretbite.co', 'Chef123!');
    const burger = db.prepare('SELECT id,ingredients FROM burgers WHERE active=1 LIMIT 1').get();
    const removedIngredient = burger.ingredients.split(',')[0].trim();
    const created = await request(app).post('/api/orders').set('Authorization', `Bearer ${clientToken}`).send({
      phone: '3001234567', deliveryAddress: 'Calle 10 # 20-30 Medellín', notes: 'Portería',
      items: [{ burgerId: burger.id, quantity: 2, removedIngredients: [removedIngredient], notes: 'Bien asada' }]
    }).expect(201);
    expect(created.body.order.status).toBe('PENDING');
    expect(created.body.order.items[0].removedIngredients).toEqual([removedIngredient]);
    const updated = await request(app).put(`/api/kitchen/orders/${created.body.order.id}/status`).set('Authorization', `Bearer ${chefToken}`).send({ status: 'CONFIRMED' }).expect(200);
    expect(updated.body.order.status).toBe('CONFIRMED');
  } finally { db.close(); }
});

test('rechaza campañas publicadas con fechas superpuestas', async () => {
  const { db, app } = fixture();
  try {
    const adminToken = await login(app, 'admin@secretbite.co', 'Admin123!');
    const active = (await request(app).get('/api/campaigns/active').expect(200)).body.campaign;
    const burgerIds = db.prepare('SELECT id FROM burgers WHERE active=1 LIMIT 2').all().map(row => row.id);
    await request(app).post('/api/campaigns').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Campaña cruzada', startsAt: active.startsAt, endsAt: active.endsAt, status: 'PUBLISHED', burgerIds
    }).expect(409);
  } finally { db.close(); }
});

test('el administrador puede asignar el rol CHEF y queda auditado', async () => {
  const { db, app } = fixture();
  try {
    const adminToken = await login(app, 'admin@secretbite.co', 'Admin123!');
    const client = db.prepare("SELECT id FROM users WHERE email='cliente@secretbite.co'").get();
    const response = await request(app).put(`/api/admin/users/${client.id}/role`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'CHEF' }).expect(200);
    expect(response.body.user.role).toBe('CHEF');
    expect(db.prepare("SELECT COUNT(*) total FROM audit_logs WHERE action='USER_ROLE_CHANGED'").get().total).toBe(1);
  } finally { db.close(); }
});

test('el dashboard administrativo entrega KPIs y series para gráficas y el router normaliza las rutas de módulos', async () => {
  const { db, app } = fixture();
  try {
    const adminToken = await login(app, 'admin@secretbite.co', 'Admin123!');
    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(statsRes.body.totals).toEqual(
      expect.objectContaining({
        users: expect.any(Number),
        staff: expect.any(Number),
        burgers: expect.any(Number),
        campaigns: expect.any(Number),
        votes: expect.any(Number),
        desiredBurgers: expect.any(Number),
        orders: expect.any(Number),
        totalOrders: expect.any(Number),
        revenueCop: expect.any(Number)
      })
    );
    expect(statsRes.body.charts).toEqual(
      expect.objectContaining({
        ordersByStatus: expect.any(Array),
        topBurgers: expect.any(Array),
        auditByEntity: expect.any(Array)
      })
    );

    expect(normalizePath('/admin')).toBe('/admin/dashboard');
    expect(normalizePath('/admin/')).toBe('/admin/dashboard');
    expect(normalizePath('/admin/clientes/')).toBe('/admin/clientes');
    expect(ADMIN_ROUTES.map(r => r.path)).toEqual([
      '/admin/dashboard',
      '/admin/productos',
      '/admin/votaciones',
      '/admin/usuarios',
      '/admin/clientes',
      '/admin/trazabilidad'
    ]);
  } finally {
    db.close();
  }
});
