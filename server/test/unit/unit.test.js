import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase, campaignStatus, getCampaign, listCampaigns } from '../../src/db.js';
import { seedDatabase } from '../../src/seed-data.js';
import { publicUser, userWithRole, listUsersPaginated } from '../../src/modules/users.js';
import { writeAudit, listAudit, listAuditPaginated } from '../../src/modules/audit.js';
import { loadEnv } from '../../src/config.js';
import { COLLECTIONS, SUBCOLLECTIONS, ROLES, ORDER_STATUSES, CAMPAIGN_STATUSES, documentIds } from '../../src/firestore/collections.js';
import { auditDocument, normalizeTimestamp } from '../../src/firestore/audit.js';
import { api } from '../../../client/src/api.js';

describe('Unit Tests - Dominio de Campañas (campaignStatus)', () => {
  const startsAt = '2026-05-01T00:00:00.000Z';
  const endsAt = '2026-05-15T00:00:00.000Z';

  it('retorna DRAFT, CLOSED o CANCELLED directamente según el estado del ciclo de vida', () => {
    expect(campaignStatus({ status: 'DRAFT', startsAt, endsAt })).toBe('DRAFT');
    expect(campaignStatus({ status: 'CLOSED', startsAt, endsAt })).toBe('CLOSED');
    expect(campaignStatus({ status: 'CANCELLED', startsAt, endsAt })).toBe('CANCELLED');
  });

  it('retorna SCHEDULED cuando la fecha actual es anterior a startsAt', () => {
    const before = new Date('2026-04-30T12:00:00.000Z');
    expect(campaignStatus({ status: 'PUBLISHED', startsAt, endsAt }, before)).toBe('SCHEDULED');
  });

  it('retorna ACTIVE cuando la fecha actual está dentro del rango [startsAt, endsAt)', () => {
    const during = new Date('2026-05-10T12:00:00.000Z');
    expect(campaignStatus({ status: 'PUBLISHED', startsAt, endsAt }, during)).toBe('ACTIVE');
  });

  it('retorna CLOSED cuando la fecha actual es igual o posterior a endsAt', () => {
    const exactEnd = new Date(endsAt);
    const afterEnd = new Date('2026-05-20T00:00:00.000Z');
    expect(campaignStatus({ status: 'PUBLISHED', startsAt, endsAt }, exactEnd)).toBe('CLOSED');
    expect(campaignStatus({ status: 'PUBLISHED', startsAt, endsAt }, afterEnd)).toBe('CLOSED');
  });
});

describe('Unit Tests - Base de datos SQLite, Semilla y Consultas (db.js & seed-data.js)', () => {
  let db;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('crea todas las tablas requeridas y activa claves foráneas', () => {
    const fk = db.prepare('PRAGMA foreign_keys').get();
    expect(fk.foreign_keys).toBe(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(row => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'users',
        'burgers',
        'campaigns',
        'campaign_burgers',
        'votes',
        'user_roles',
        'orders',
        'order_items',
        'audit_logs'
      ])
    );
  });

  it('seedDatabase es idempotente y crea usuarios demo, hamburguesas y campaña inicial', () => {
    seedDatabase(db);
    seedDatabase(db); // Segunda ejecución no debe duplicar registros

    const usersCount = db.prepare('SELECT COUNT(*) total FROM users').get().total;
    const burgersCount = db.prepare('SELECT COUNT(*) total FROM burgers').get().total;
    const campaignsCount = db.prepare('SELECT COUNT(*) total FROM campaigns').get().total;

    expect(usersCount).toBe(3);
    expect(burgersCount).toBe(4);
    expect(campaignsCount).toBe(1);
  });

  it('getCampaign retorna null si no existe y calcula votos y voto propio cuando existe', () => {
    seedDatabase(db);
    expect(getCampaign(db, 9999)).toBeNull();

    const campaignRow = db.prepare('SELECT id FROM campaigns LIMIT 1').get();
    const client = db.prepare("SELECT id FROM users WHERE email='cliente@secretbite.co'").get();
    const candidate = db
      .prepare('SELECT burger_id FROM campaign_burgers WHERE campaign_id=? LIMIT 1')
      .get(campaignRow.id);

    db.prepare('INSERT INTO votes(user_id,campaign_id,burger_id,quantity) VALUES(?,?,?,?)').run(
      client.id,
      campaignRow.id,
      candidate.burger_id,
      3
    );

    const campaign = getCampaign(db, campaignRow.id, client.id);
    expect(campaign.userVoteBurgerId).toBe(candidate.burger_id);
    expect(campaign.userVoteQuantity).toBe(3);
    const votedCandidate = campaign.candidates.find(c => c.id === candidate.burger_id);
    expect(votedCandidate.voteCount).toBe(1);
    expect(votedCandidate.desiredQuantity).toBe(3);
  });

  it('listCampaigns cierra automáticamente campañas expiradas y asigna ganadora', () => {
    seedDatabase(db);
    const burgers = db.prepare('SELECT id FROM burgers LIMIT 2').all();
    const pastStart = new Date(Date.now() - 7200_000).toISOString();
    const pastEnd = new Date(Date.now() - 3600_000).toISOString();

    const result = db
      .prepare("INSERT INTO campaigns(name,starts_at,ends_at,published,status) VALUES('Expirada',?,?,1,'PUBLISHED')")
      .run(pastStart, pastEnd);
    const expiredId = Number(result.lastInsertRowid);

    db.prepare('INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)').run(expiredId, burgers[0].id);
    db.prepare('INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)').run(expiredId, burgers[1].id);

    const client = db.prepare("SELECT id FROM users WHERE email='cliente@secretbite.co'").get();
    db.prepare('INSERT INTO votes(user_id,campaign_id,burger_id) VALUES(?,?,?)').run(client.id, expiredId, burgers[1].id);

    const campaigns = listCampaigns(db);
    const closed = campaigns.find(c => c.id === expiredId);
    expect(closed.lifecycleStatus).toBe('CLOSED');
    expect(closed.published).toBe(false);
    expect(closed.winnerBurgerId).toBe(burgers[1].id);
  });
});

describe('Unit Tests - Módulos de Usuarios y Auditoría (users.js & audit.js)', () => {
  let db;

  beforeEach(() => {
    db = createDatabase(':memory:');
    seedDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  it('publicUser omite hashes de contraseña y prioriza app_role', () => {
    const rawUser = {
      id: 7,
      name: 'Chef Prueba',
      email: 'chef@test.co',
      password_hash: 'secret_hash',
      role: 'CLIENT',
      app_role: 'CHEF'
    };
    expect(publicUser(rawUser)).toEqual({
      id: 7,
      name: 'Chef Prueba',
      email: 'chef@test.co',
      role: 'CHEF'
    });
  });

  it('userWithRole recupera el rol extendido desde user_roles', () => {
    const chef = userWithRole(db, 'u.email=?', 'chef@secretbite.co');
    expect(chef).toBeDefined();
    expect(chef.app_role).toBe('CHEF');
  });

  it('listUsersPaginated separa STAFF (ADMIN y CHEF) de CLIENTS (CLIENT) y pagina resultados', () => {
    for (let i = 1; i <= 8; i += 1) {
      db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,'hash','CLIENT')").run(
        `Cliente Extra ${i}`,
        `cliente${i}@test.co`
      );
    }

    const staff = listUsersPaginated(db, { scope: 'STAFF', page: 1, pageSize: 10 });
    expect(staff.users).toHaveLength(2);
    expect(staff.users.every(u => u.role === 'ADMIN' || u.role === 'CHEF')).toBe(true);
    expect(staff.counts.STAFF).toBe(2);
    expect(staff.counts.CLIENT).toBe(9);

    const clientsPage1 = listUsersPaginated(db, { scope: 'CLIENTS', page: 1, pageSize: 4 });
    expect(clientsPage1.users).toHaveLength(4);
    expect(clientsPage1.users.every(u => u.role === 'CLIENT')).toBe(true);
    expect(clientsPage1.pagination).toEqual({
      page: 1,
      pageSize: 4,
      total: 9,
      totalPages: 3,
      hasPrev: false,
      hasNext: true
    });
  });

  it('writeAudit y listAudit registran y parsean metadatos JSON correctamente', () => {
    const admin = userWithRole(db, 'u.email=?', 'admin@secretbite.co');
    writeAudit(db, {
      actorUserId: admin.id,
      action: 'TEST_ACTION',
      entityType: 'BURGER',
      entityId: 42,
      metadata: { reason: 'unit-test' }
    });

    const entries = listAudit(db, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'TEST_ACTION',
      entityType: 'BURGER',
      entityId: '42',
      actorEmail: 'admin@secretbite.co',
      metadata: { reason: 'unit-test' }
    });
  });

  it('listAuditPaginated pagina, filtra por entidad y busca por texto correctamente', () => {
    const admin = userWithRole(db, 'u.email=?', 'admin@secretbite.co');
    for (let i = 1; i <= 15; i += 1) {
      writeAudit(db, {
        actorUserId: admin.id,
        action: i % 2 === 0 ? 'BURGER_UPDATED' : 'CAMPAIGN_CREATED',
        entityType: i % 2 === 0 ? 'BURGER' : 'CAMPAIGN',
        entityId: i,
        metadata: { batch: `lote-${i}` }
      });
    }

    const page1 = listAuditPaginated(db, { page: 1, pageSize: 5 });
    expect(page1.entries).toHaveLength(5);
    expect(page1.pagination).toEqual({
      page: 1,
      pageSize: 5,
      total: 15,
      totalPages: 3,
      hasPrev: false,
      hasNext: true
    });

    const page2 = listAuditPaginated(db, { page: 2, pageSize: 5 });
    expect(page2.entries).toHaveLength(5);
    expect(page2.pagination.hasPrev).toBe(true);
    expect(page2.pagination.hasNext).toBe(true);

    const onlyBurgers = listAuditPaginated(db, { page: 1, pageSize: 10, entityType: 'BURGER' });
    expect(onlyBurgers.pagination.total).toBe(7);
    expect(onlyBurgers.entries.every(e => e.entityType === 'BURGER')).toBe(true);

    const searched = listAuditPaginated(db, { page: 1, pageSize: 10, q: 'lote-14' });
    expect(searched.pagination.total).toBe(1);
    expect(searched.entries[0].entityId).toBe('14');
  });
});

describe('Unit Tests - Configuración y Utilidades (config.js & firestore)', () => {
  it('loadEnv carga variables desde un archivo .env temporal sin sobrescribir las existentes', () => {
    const tmpFile = path.join(os.tmpdir(), `secret-bite-test-${Date.now()}.env`);
    fs.writeFileSync(tmpFile, 'UNIT_TEST_VAR="valor_prueba"\nEXISTING_TEST_VAR=nuevo\n', 'utf8');
    process.env.EXISTING_TEST_VAR = 'original';
    delete process.env.UNIT_TEST_VAR;

    try {
      loadEnv(tmpFile);
      expect(process.env.UNIT_TEST_VAR).toBe('valor_prueba');
      expect(process.env.EXISTING_TEST_VAR).toBe('original');
    } finally {
      fs.unlinkSync(tmpFile);
      delete process.env.UNIT_TEST_VAR;
      delete process.env.EXISTING_TEST_VAR;
    }
  });

  it('documentIds y constantes de Firestore mantienen el contrato esperado', () => {
    expect(ROLES).toEqual(['CLIENT', 'CHEF', 'ADMIN']);
    expect(ORDER_STATUSES).toContain('PREPARING');
    expect(CAMPAIGN_STATUSES).toContain('PUBLISHED');
    expect(COLLECTIONS.votes).toBe('votes');
    expect(SUBCOLLECTIONS.orderItems).toBe('items');
    expect(documentIds.vote(10, 25)).toBe('10_25');
    expect(documentIds.user(99)).toBe('99');
  });

  it('normalizeTimestamp y auditDocument formatean datos de auditoría para Firestore', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp('2026-05-01T00:00:00.000Z')).toBe('2026-05-01T00:00:00.000Z');
    expect(normalizeTimestamp({ toDate: () => new Date('2026-05-01T00:00:00.000Z') })).toBe('2026-05-01T00:00:00.000Z');

    const doc = auditDocument({
      actorUserId: 5,
      action: 'VOTE_CAST',
      entityType: 'CAMPAIGN',
      entityId: 12,
      metadata: { burgerId: 3 }
    });
    expect(doc).toMatchObject({
      actorUserId: '5',
      action: 'VOTE_CAST',
      entityType: 'CAMPAIGN',
      entityId: '12',
      metadata: { burgerId: 3 },
      requestId: null
    });
  });
});

describe('Unit Tests - Cliente HTTP (client/src/api.js)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'jwt-demo-token')
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envía encabezado Authorization Bearer cuando hay token y retorna el JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api('/health');
    expect(result).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-demo-token'
        })
      })
    );
  });

  it('lanza un Error con el mensaje del servidor cuando la respuesta no es exitosa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Ya votaste en esta campaña.' })
      })
    );

    await expect(
      api('/campaigns/1/votes', { method: 'POST' })
    ).rejects.toThrow('Ya votaste en esta campaña.');
  });

  it('renueva automáticamente el accessToken usando el refreshToken cuando recibe 401 y reintenta la petición', async () => {
    const store = new Map([
      ['secret-bite-token', 'expired-access-token'],
      ['secret-bite-refresh-token', 'valid-refresh-token']
    ]);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => store.get(key) ?? null),
      setItem: vi.fn((key, val) => store.set(key, val)),
      removeItem: vi.fn(key => store.delete(key))
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'La sesión no es válida o expiró.' })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'fresh-access-token-15m',
          refreshToken: 'fresh-refresh-token-1d'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 3, email: 'cliente@secretbite.co' } })
      });

    vi.stubGlobal('fetch', fetchMock);

    const data = await api('/auth/me');
    expect(data).toEqual({ user: { id: 3, email: 'cliente@secretbite.co' } });
    expect(store.get('secret-bite-token')).toBe('fresh-access-token-15m');
    expect(store.get('secret-bite-refresh-token')).toBe('fresh-refresh-token-1d');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplica peticiones GET concurrentes hacia la misma ruta para evitar llamadas duplicadas', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ burgers: [{ id: 1, name: 'La Antioqueña' }] })
            });
          }, 15);
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([api('/burgers'), api('/burgers')]);
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

