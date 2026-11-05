import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../src/db.js';
import { seedDatabase } from '../../src/seed-data.js';
import { createApp } from '../../src/app.js';

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
  });

  describe('Catálogo de Hamburguesas (/api/burgers)', () => {
    it('permite al ADMIN crear, actualizar y eliminar una hamburguesa sin campaña asociada', async () => {
      const adminToken = await loginAs(app, 'admin@secretbite.co', 'Admin123!');

      const created = await request(app)
        .post('/api/burgers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: ' Gaucha Especial ',
          description: 'Hamburguesa artesanal con chimichurri y provolone.',
          ingredients: 'Carne Angus, provolone, chimichurri, pan brioche',
          priceCop: 35000,
          active: true
        })
        .expect(201);

      const burgerId = created.body.burger.id;
      expect(created.body.burger.name).toBe('Gaucha Especial');

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

      await request(app)
        .post(`/api/campaigns/${active.id}/votes`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ burgerId: chosenBurgerId })
        .expect(201);

      const closed = await request(app)
        .post(`/api/campaigns/${active.id}/close`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(closed.body.winner.id).toBe(chosenBurgerId);
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
        .get('/api/admin/audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(audit.body.entries.some(e => e.action === 'USER_ROLE_CHANGED')).toBe(true);
    });
  });
});

