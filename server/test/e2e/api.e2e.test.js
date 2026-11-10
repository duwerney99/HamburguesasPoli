import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../../src/db.js';
import { seedDatabase } from '../../src/seed-data.js';
import { createApp, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from '../../src/app.js';

function createTestEnvironment() {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const app = createApp({
    db,
    jwtSecret: 'e2e-test-secret-with-enough-entropy',
    rateLimits: false
  });
  return { db, app };
}

async function loginAs(app, email, password) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return response.body.token;
}

describe('E2E Tests - Plataforma Secret Bite API', () => {
  let db;
  let app;

  beforeEach(() => {
    ({ db, app } = createTestEnvironment());
  });

  afterEach(() => {
    db.close();
  });

  describe('Healthcheck y Rutas inexsitentes', () => {
    it('GET /api/health responde 200 ok y rutas desconocidas responden 404', async () => {
      const health = await request(app).get('/api/health').expect(200);
      expect(health.body).toEqual({ status: 'ok' });

      const notFound = await request(app).get('/api/ruta-inexistente').expect(404);
      expect(notFound.body.error).toMatch(/no encontrada/i);
    });
  });

  describe('Autenticación y Sesión (/api/auth)', () => {
    it('flujo completo de registro, inicio de sesión, consulta de perfil y rechazo de duplicados', async () => {
      const registered = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana Prueba', email: 'ana@example.com', password: 'Segura123!' })
        .expect(201);

      expect(registered.body.user).toMatchObject({
        name: 'Ana Prueba',
        email: 'ana@example.com',
        role: 'CLIENT'
      });
      expect(registered.body.token).toBeTypeOf('string');

      // Rechaza correo duplicado
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana Clon', email: 'ANA@example.com', password: 'Segura123!' })
        .expect(409);

      // Consulta de usuario autenticado
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${registered.body.token}`)
        .expect(200);
      expect(me.body.user.email).toBe('ana@example.com');

      // Rechaza credenciales inválidas
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'PasswordIncorrecto1!' })
        .expect(401);
    });

    it('emite accessToken de 15 minutos y refreshToken de 1 día, permite rotar con /api/auth/refresh y revocar en /api/auth/logout', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'cliente@secretbite.co', password: 'Cliente123!' })
        .expect(200);

      expect(loginRes.body.accessToken).toBeTypeOf('string');
      expect(loginRes.body.refreshToken).toBeTypeOf('string');
      expect(loginRes.body.expiresIn).toBe(15 * 60);
      expect(loginRes.body.refreshExpiresIn).toBe(24 * 60 * 60);
      expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
      expect(REFRESH_TOKEN_TTL_SECONDS).toBe(86400);

      const accessPayload = jwt.decode(loginRes.body.accessToken);
      const refreshPayload = jwt.decode(loginRes.body.refreshToken);
      expect(accessPayload.exp - accessPayload.iat).toBe(15 * 60);
      expect(refreshPayload.exp - refreshPayload.iat).toBe(24 * 60 * 60);

      // No permite usar el refreshToken directamente como Bearer accessToken
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.refreshToken}`)
        .expect(401);

      // Rota tokens usando /api/auth/refresh
      const refreshed = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      expect(refreshed.body.accessToken).toBeTypeOf('string');
      expect(refreshed.body.refreshToken).toBeTypeOf('string');
      expect(refreshed.body.refreshToken).not.toBe(loginRes.body.refreshToken);

      // El refreshToken anterior queda revocado y no puede reutilizarse
      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(401);

      // Al cerrar sesión se revoca el nuevo refreshToken
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .send({ refreshToken: refreshed.body.refreshToken })
        .expect(204);

      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshed.body.refreshToken })
        .expect(401);
    });
  });

  describe('Catálogo de Hamburguesas (/api/burgers)', () => {
    it('permite al ADMIN crear, actualizar y eliminar una hamburguesa sin campaña asociada', async () => {
      const adminToken = await loginAs(app, 'admin@secretbite.co', 'Admin123!');

      const sampleDataImage = `data:image/webp;base64,${'A'.repeat(1200)}`;
      const created = await request(app)
        .post('/api/burgers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: ' Gaucha Especial ',
          description: 'Hamburguesa artesanal con chimichurri y provolone.',
          ingredients: 'Carne Angus, provolone, chimichurri, pan brioche',
          imageUrl: sampleDataImage,
          priceCop: 35000,
          active: true
        })
        .expect(201);

      const burgerId = created.body.burger.id;
      expect(created.body.burger.name).toBe('Gaucha Especial');
      expect(created.body.burger.imageUrl).toBe(sampleDataImage);

      const updated = await request(app)
        .put(`/api/burgers/${burgerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Gaucha Especial 2.0',
          description: 'Hamburguesa artesanal con chimichurri y doble provolone.',
          ingredients: 'Carne Angus, doble provolone, chimichurri, pan brioche',
          priceCop: 36000,
          active: false
        })
        .expect(200);

      expect(updated.body.burger.active).toBe(false);

      await request(app)
        .delete(`/api/burgers/${burgerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('al eliminar una hamburguesa que participa en campaña, la oculta para el cliente en menú y votación', async () => {
      const adminToken = await loginAs(app, 'admin@secretbite.co', 'Admin123!');
      const clientToken = await loginAs(app, 'cliente@secretbite.co', 'Cliente123!');

      const activeBefore = (await request(app).get('/api/campaigns/active').expect(200)).body.campaign;
      const targetBurgerId = activeBefore.candidates[0].id;

      await request(app)
        .delete(`/api/burgers/${targetBurgerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const publicBurgers = (await request(app).get('/api/burgers').expect(200)).body.burgers;
      expect(publicBurgers.some(b => b.id === targetBurgerId)).toBe(false);

      const activeAfter = (await request(app).get('/api/campaigns/active').expect(200)).body.campaign;
      expect(activeAfter.candidates.some(c => c.id === targetBurgerId)).toBe(false);

      await request(app)
        .post(`/api/campaigns/${activeAfter.id}/votes`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ burgerId: targetBurgerId })
        .expect(400);
    });
  });

  describe('Campañas y Votación Concurrente (/api/campaigns)', () => {
    it('TC-01: rechaza el voto cuando la campaña ya cerró', async () => {
      const token = await loginAs(app, 'cliente@secretbite.co', 'Cliente123!');
      const campaignId = Number(
        db
          .prepare("INSERT INTO campaigns(name,starts_at,ends_at,published) VALUES('Cerrada',?,?,1)")
          .run(new Date(Date.now() - 2000).toISOString(), new Date(Date.now() - 1000).toISOString())
          .lastInsertRowid
      );
      const burgerId = db.prepare('SELECT id FROM burgers LIMIT 1').get().id;
      db.prepare('INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)').run(campaignId, burgerId);

      const response = await request(app)
        .post(`/api/campaigns/${campaignId}/votes`)
        .set('Authorization', `Bearer ${token}`)
        .send({ burgerId })
        .expect(409);

      expect(response.body.error).toMatch(/no está abierta/i);
      expect(db.prepare('SELECT COUNT(*) total FROM votes WHERE campaign_id=?').get(campaignId).total).toBe(0);
    });

    it('TC-02: diez solicitudes concurrentes del mismo cliente registran un único voto', async () => {
      const token = await loginAs(app, 'cliente@secretbite.co', 'Cliente123!');
      const campaign = (await request(app).get('/api/campaigns/active').expect(200)).body.campaign;

      const attempts = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app)
            .post(`/api/campaigns/${campaign.id}/votes`)
            .set('Authorization', `Bearer ${token}`)
            .send({ burgerId: campaign.candidates[0].id })
        )
      );

      expect(attempts.filter(r => r.status === 201)).toHaveLength(1);
      expect(attempts.filter(r => r.status === 409)).toHaveLength(9);
      expect(db.prepare('SELECT COUNT(*) total FROM votes').get().total).toBe(1);
    });

    it('TC-03: un cliente no puede crear campañas y el admin no puede publicar campañas superpuestas', async () => {
      const clientToken = await loginAs(app, 'cliente@secretbite.co', 'Cliente123!');
      const adminToken = await loginAs(app, 'admin@secretbite.co', 'Admin123!');
      const burgerIds = db
        .prepare('SELECT id FROM burgers WHERE active=1 LIMIT 2')
        .all()
        .map(row => row.id);

      await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          name: 'No autorizada',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'PUBLISHED',
          burgerIds
        })
        .expect(403);

      const active = (await request(app).get('/api/campaigns/active').expect(200)).body.campaign;
      await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Campaña cruzada',
          startsAt: active.startsAt,
          endsAt: active.endsAt,
          status: 'PUBLISHED',
          burgerIds
        })
        .expect(409);
    });

    it('permite cerrar una campaña publicada y declara la hamburguesa ganadora', async () => {
      const clientToken = await loginAs(app, 'cliente@secretbite.co', 'Cliente123!');
      const adminToken = await loginAs(app, 'admin@secretbite.co', 'Admin123!');
      const active = (await request(app).get('/api/campaigns/active').expect(200)).body.campaign;
      const chosenBurgerId = active.candidates[1].id;

      const voteRes = await request(app)
        .post(`/api/campaigns/${active.id}/votes`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ burgerId: chosenBurgerId, quantity: 4 })
        .expect(201);

      expect(voteRes.body.campaign.userVoteBurgerId).toBe(chosenBurgerId);
      expect(voteRes.body.campaign.userVoteQuantity).toBe(4);
      const votedCand = voteRes.body.campaign.candidates.find(c => c.id === chosenBurgerId);
      expect(votedCand.voteCount).toBe(1);
      expect(votedCand.desiredQuantity).toBe(4);

      const closed = await request(app)
        .post(`/api/campaigns/${active.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(closed.body.winner.id).toBe(chosenBurgerId);
      expect(closed.body.winner.desiredQuantity).toBe(4);
      expect(closed.body.campaign.lifecycleStatus).toBe('CLOSED');
    });
  });

  describe('Pedidos y Flujo de Cocina (/api/orders & /api/kitchen)', () => {
    it('completa el ciclo de vida del pedido desde creación hasta entrega', async () => {
      const clientToken = await loginAs(app, 'cliente@secretbite.co', 'Cliente123!');
      const chefToken = await loginAs(app, 'chef@secretbite.co', 'Chef123!');
      const burger = db.prepare('SELECT id,ingredients FROM burgers WHERE active=1 LIMIT 1').get();
      const removedIngredient = burger.ingredients.split(',')[0].trim();

      const created = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          phone: '3001234567',
          deliveryAddress: 'Calle 10 # 20-30 Medellín',
          notes: 'Portería',
          items: [
            {
              burgerId: burger.id,
              quantity: 2,
              removedIngredients: [removedIngredient],
              notes: 'Bien asada'
            }
          ]
        })
        .expect(201);

      const orderId = created.body.order.id;
      expect(created.body.order.status).toBe('PENDING');
      expect(created.body.order.items[0].removedIngredients).toEqual([removedIngredient]);

      for (const nextStatus of ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED']) {
        const res = await request(app)
          .put(`/api/kitchen/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${chefToken}`)
          .send({ status: nextStatus })
          .expect(200);
        expect(res.body.order.status).toBe(nextStatus);
      }

      // Un pedido entregado no puede ser cancelado por el cliente
      await request(app)
        .put(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(409);
    });

    it('permite al cliente cancelar su propio pedido mientras está en estado PENDING', async () => {
      const clientToken = await loginAs(app, 'cliente@secretbite.co', 'Cliente123!');
      const burger = db.prepare('SELECT id FROM burgers WHERE active=1 LIMIT 1').get();

      const created = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          phone: '3009876543',
          deliveryAddress: 'Carrera 43A # 1-50 Medellín',
          items: [{ burgerId: burger.id, quantity: 1 }]
        })
        .expect(201);

      const cancelled = await request(app)
        .put(`/api/orders/${created.body.order.id}/cancel`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(cancelled.body.order.status).toBe('CANCELLED');
    });
  });

  describe('Administración, Roles y Auditoría (/api/admin)', () => {
    it('asigna el rol CHEF, impide que el admin se quite su propio rol y registra auditoría', async () => {
      const adminToken = await loginAs(app, 'admin@secretbite.co', 'Admin123!');
      const client = db.prepare("SELECT id FROM users WHERE email='cliente@secretbite.co'").get();
      const admin = db.prepare("SELECT id FROM users WHERE email='admin@secretbite.co'").get();

      const roleChange = await request(app)
        .put(`/api/admin/users/${client.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'CHEF' })
        .expect(200);

      expect(roleChange.body.user.role).toBe('CHEF');

      // Impide que el administrador se retire su propio rol
      await request(app)
        .put(`/api/admin/users/${admin.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'CLIENT' })
        .expect(409);

      const stats = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(stats.body.totals).toHaveProperty('burgers');

      const audit = await request(app)
        .get('/api/admin/audit?page=1&pageSize=5&entityType=USER')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(audit.body.entries.some(e => e.action === 'USER_ROLE_CHANGED')).toBe(true);
      expect(audit.body.pagination).toMatchObject({
        page: 1,
        pageSize: 5
      });

      const staffRes = await request(app)
        .get('/api/admin/users?scope=STAFF&page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(staffRes.body.users.every(u => u.role === 'ADMIN' || u.role === 'CHEF')).toBe(true);

      const clientsRes = await request(app)
        .get('/api/admin/clients?page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(clientsRes.body.clients.every(u => u.role === 'CLIENT')).toBe(true);
      expect(clientsRes.body.pagination).toMatchObject({
        page: 1,
        pageSize: 5
      });
    });
  });
});

