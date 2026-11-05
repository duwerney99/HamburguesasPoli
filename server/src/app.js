import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getCampaign, listCampaigns } from './db.js';
import { installOrderRoutes } from './modules/orders.js';
import { installUserRoutes, publicUser, userWithRole } from './modules/users.js';
import { listAudit, listAuditPaginated, writeAudit } from './modules/audit.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(160).transform(value => value.toLowerCase()),
  password: z.string().min(8).max(72)
});
const burgerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(500),
  ingredients: z.string().trim().min(3).max(500),
  imageUrl: z.string().trim().min(1).max(2500000).default('/assets/hero-burger.jpeg'),
  priceCop: z.number().int().min(1000).max(500000),
  active: z.boolean().default(true)
});
const campaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  burgerIds: z.array(z.number().int().positive()).min(2).max(8)
}).refine(data => Date.parse(data.endsAt) > Date.parse(data.startsAt), { message: 'La fecha final debe ser posterior a la inicial.' });

const voteSchema = z.object({
  burgerId: z.number().int().positive(),
  quantity: z
    .number({ invalid_type_error: 'La cantidad debe ser un número entero.' })
    .int('La cantidad debe ser un número entero.')
    .min(1, 'Debes indicar al menos 1 hamburguesa.')
    .max(50, 'El máximo permitido por voto es de 50 hamburguesas.')
    .default(1)
});

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '1d';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 24 * 60 * 60;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function createApp({ db, jwtSecret = 'dev-only-change-me', refreshSecret = `${jwtSecret}:refresh`, clientOrigin = 'http://localhost:5173', rateLimits = true } = {}) {
  if (!db) throw new Error('Se requiere una base de datos.');
  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'data:', 'https:'] } } }));
  app.use(cors({ origin: clientOrigin, credentials: false }));
  app.use(express.json({ limit: '5mb' }));

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  const voteLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  const limited = middleware => rateLimits ? middleware : (_req, _res, next) => next();

  function tokenFor(user) {
    return jwt.sign({ sub: String(user.id), role: user.app_role || user.role, type: 'access' }, jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });
  }
  function refreshTokenFor(user) {
    const jti = crypto.randomUUID();
    const refreshToken = jwt.sign({ sub: String(user.id), jti, type: 'refresh' }, refreshSecret, { expiresIn: REFRESH_TOKEN_TTL });
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
    db.prepare('INSERT INTO refresh_tokens(jti,user_id,token_hash,expires_at,revoked) VALUES(?,?,?,?,0)').run(jti, Number(user.id), hashToken(refreshToken), expiresAt);
    return refreshToken;
  }
  function issueAuthSession(user) {
    const accessToken = tokenFor(user);
    const refreshToken = refreshTokenFor(user);
    return {
      token: accessToken,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
      user: publicUser(user)
    };
  }
  function optionalAuth(req, _res, next) {
    const value = req.headers.authorization;
    if (!value?.startsWith('Bearer ')) return next();
    try {
      const payload = jwt.verify(value.slice(7), jwtSecret);
      if (payload?.type !== 'refresh') req.auth = payload;
    } catch { /* recurso público */ }
    next();
  }
  function requireAuth(req, res, next) {
    const value = req.headers.authorization;
    if (!value?.startsWith('Bearer ')) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    try {
      const payload = jwt.verify(value.slice(7), jwtSecret);
      if (payload?.type === 'refresh') return res.status(401).json({ error: 'El token de acceso no es válido.' });
      req.auth = payload;
      return next();
    } catch {
      return res.status(401).json({ error: 'La sesión no es válida o expiró.' });
    }
  }
  const requireAnyRole = (...roles) => (req, res, next) => roles.includes(req.auth?.role) ? next() : res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
  const requireRole = role => requireAnyRole(role);
  const parse = (schema, value, res) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      res.status(400).json({ error: result.error.issues[0]?.message || 'Datos inválidos.' });
      return null;
    }
    return result.data;
  };

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/register', limited(limiter), (req, res) => {
    const data = parse(credentialsSchema.extend({ name: z.string().trim().min(2).max(80) }), req.body, res);
    if (!data) return;
    try {
      const result = db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,\'CLIENT\')').run(data.name, data.email, bcrypt.hashSync(data.password, 10));
      db.prepare("INSERT INTO user_roles(user_id,role) VALUES(?,'CLIENT')").run(result.lastInsertRowid);
      const user = userWithRole(db, 'u.id=?', result.lastInsertRowid);
      res.status(201).json(issueAuthSession(user));
    } catch (error) {
      if (String(error).includes('UNIQUE')) return res.status(409).json({ error: 'Ese correo ya está registrado.' });
      throw error;
    }
  });

  app.post('/api/auth/login', limited(limiter), (req, res) => {
    const data = parse(credentialsSchema, req.body, res);
    if (!data) return;
    const user = userWithRole(db, 'u.email=?', data.email);
    if (!user || !bcrypt.compareSync(data.password, user.password_hash)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    res.json(issueAuthSession(user));
  });

  app.post('/api/auth/refresh', limited(limiter), (req, res) => {
    const data = parse(z.object({ refreshToken: z.string().trim().min(10) }), req.body, res);
    if (!data) return;
    let payload;
    try {
      payload = jwt.verify(data.refreshToken, refreshSecret);
    } catch {
      return res.status(401).json({ error: 'El refresh token no es válido o expiró.' });
    }
    if (payload?.type !== 'refresh' || !payload?.jti || !payload?.sub) {
      return res.status(401).json({ error: 'El refresh token no es válido.' });
    }
    const stored = db.prepare('SELECT jti,user_id userId,token_hash tokenHash,expires_at expiresAt,revoked FROM refresh_tokens WHERE jti=?').get(payload.jti);
    if (!stored || stored.revoked || Date.parse(stored.expiresAt) <= Date.now() || stored.tokenHash !== hashToken(data.refreshToken)) {
      return res.status(401).json({ error: 'El refresh token fue revocado o expiró.' });
    }
    const user = userWithRole(db, 'u.id=?', Number(payload.sub));
    if (!user) {
      db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE jti=?').run(payload.jti);
      return res.status(401).json({ error: 'El usuario ya no existe.' });
    }
    db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE jti=?').run(payload.jti);
    res.json(issueAuthSession(user));
  });

  app.post('/api/auth/logout', optionalAuth, (req, res) => {
    const rawRefresh = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
    if (rawRefresh) {
      db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE token_hash=?').run(hashToken(rawRefresh));
    }
    if (req.auth?.sub) {
      db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(Number(req.auth.sub));
    }
    res.status(204).end();
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = userWithRole(db, 'u.id=?', Number(req.auth.sub));
    if (!user) return res.status(401).json({ error: 'El usuario ya no existe.' });
    res.json({ user: publicUser(user) });
  });

  app.get('/api/burgers', optionalAuth, (req, res) => {
    const isAdmin = req.auth?.role === 'ADMIN';
    const sql = isAdmin
      ? 'SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active,created_at createdAt FROM burgers WHERE deleted=0 ORDER BY id DESC'
      : 'SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active,created_at createdAt FROM burgers WHERE deleted=0 AND active=1 ORDER BY id DESC';
    const burgers = db.prepare(sql).all();
    res.json({ burgers: burgers.map(item => ({ ...item, active: Boolean(item.active) })) });
  });

  app.post('/api/burgers', requireAuth, requireRole('ADMIN'), (req, res) => {
    const data = parse(burgerSchema, req.body, res);
    if (!data) return;
    const result = db.prepare('INSERT INTO burgers(name,description,ingredients,image_url,price_cop,active) VALUES(?,?,?,?,?,?)').run(data.name, data.description, data.ingredients, data.imageUrl, data.priceCop, Number(data.active));
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'BURGER_CREATED', entityType: 'BURGER', entityId: result.lastInsertRowid });
    res.status(201).json({ burger: db.prepare('SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active FROM burgers WHERE id=?').get(result.lastInsertRowid) });
  });

  app.put('/api/burgers/:id', requireAuth, requireRole('ADMIN'), (req, res) => {
    const data = parse(burgerSchema, req.body, res);
    if (!data) return;
    const result = db.prepare('UPDATE burgers SET name=?,description=?,ingredients=?,image_url=?,price_cop=?,active=? WHERE id=? AND deleted=0').run(data.name, data.description, data.ingredients, data.imageUrl, data.priceCop, Number(data.active), Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Hamburguesa no encontrada.' });
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'BURGER_UPDATED', entityType: 'BURGER', entityId: req.params.id });
    res.json({ burger: { id: Number(req.params.id), ...data } });
  });

  app.delete('/api/burgers/:id', requireAuth, requireRole('ADMIN'), (req, res) => {
    const burgerId = Number(req.params.id);
    const existing = db.prepare('SELECT id,name FROM burgers WHERE id=? AND deleted=0').get(burgerId);
    if (!existing) return res.status(404).json({ error: 'Hamburguesa no encontrada.' });
    db.prepare("DELETE FROM campaign_burgers WHERE burger_id=? AND campaign_id IN (SELECT id FROM campaigns WHERE status='DRAFT')").run(burgerId);
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
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'BURGER_DELETED', entityType: 'BURGER', entityId: burgerId, metadata: { name: existing.name, mode } });
    res.status(204).end();
  });

  app.get('/api/campaigns', optionalAuth, (req, res) => res.json({ campaigns: listCampaigns(db, Number(req.auth?.sub) || undefined).filter(item => item.published || req.auth?.role === 'ADMIN') }));
  app.get('/api/campaigns/active', optionalAuth, (req, res) => {
    const campaign = listCampaigns(db, Number(req.auth?.sub) || undefined).find(item => item.published && item.status === 'ACTIVE');
    if (!campaign) return res.status(404).json({ error: 'No hay una campaña activa.' });
    res.json({ campaign });
  });

  function saveCampaign(req, res, updating = false) {
    const data = parse(campaignSchema, req.body, res);
    if (!data) return;
    const uniqueIds = [...new Set(data.burgerIds)];
    if (uniqueIds.length !== data.burgerIds.length) return res.status(400).json({ error: 'No repitas candidatas.' });
    const placeholders = uniqueIds.map(() => '?').join(',');
    if (db.prepare(`SELECT COUNT(*) total FROM burgers WHERE active=1 AND deleted=0 AND id IN (${placeholders})`).get(...uniqueIds).total !== uniqueIds.length) return res.status(400).json({ error: 'Alguna hamburguesa no existe o está inactiva.' });
    if (data.status === 'PUBLISHED') {
      const overlap = db.prepare(`SELECT id FROM campaigns WHERE status='PUBLISHED' AND id<>? AND starts_at < ? AND ends_at > ? LIMIT 1`).get(updating ? Number(req.params.id) : 0, data.endsAt, data.startsAt);
      if (overlap) return res.status(409).json({ error: 'Ya existe una campaña publicada que se cruza con esas fechas.' });
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      let campaignId;
      if (updating) {
        campaignId = Number(req.params.id);
        const current = db.prepare('SELECT starts_at startsAt,status,(SELECT COUNT(*) FROM votes WHERE campaign_id=campaigns.id) voteCount FROM campaigns WHERE id=?').get(campaignId);
        if (!current) { db.exec('ROLLBACK'); return res.status(404).json({ error: 'Campaña no encontrada.' }); }
        if (current.voteCount > 0 || (current.status === 'PUBLISHED' && Date.now() >= Date.parse(current.startsAt))) { db.exec('ROLLBACK'); return res.status(409).json({ error: 'Una campaña iniciada o con votos ya no puede modificar fechas ni candidatas.' }); }
        const update = db.prepare('UPDATE campaigns SET name=?,starts_at=?,ends_at=?,published=?,status=? WHERE id=?').run(data.name, data.startsAt, data.endsAt, Number(data.status === 'PUBLISHED'), data.status, campaignId);
        if (!update.changes) { db.exec('ROLLBACK'); return res.status(404).json({ error: 'Campaña no encontrada.' }); }
        db.prepare('DELETE FROM campaign_burgers WHERE campaign_id=?').run(campaignId);
      } else {
        campaignId = Number(db.prepare('INSERT INTO campaigns(name,starts_at,ends_at,published,status) VALUES(?,?,?,?,?)').run(data.name, data.startsAt, data.endsAt, Number(data.status === 'PUBLISHED'), data.status).lastInsertRowid);
      }
      const add = db.prepare('INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)');
      uniqueIds.forEach(id => add.run(campaignId, id));
      writeAudit(db, { actorUserId: Number(req.auth.sub), action: updating ? 'CAMPAIGN_UPDATED' : 'CAMPAIGN_CREATED', entityType: 'CAMPAIGN', entityId: campaignId, metadata: { status: data.status } });
      db.exec('COMMIT');
      res.status(updating ? 200 : 201).json({ campaign: getCampaign(db, campaignId) });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  app.post('/api/campaigns', requireAuth, requireRole('ADMIN'), (req, res) => saveCampaign(req, res));
  app.put('/api/campaigns/:id', requireAuth, requireRole('ADMIN'), (req, res) => saveCampaign(req, res, true));

  app.post('/api/campaigns/:id/close', requireAuth, requireRole('ADMIN'), (req, res) => {
    const campaignId = Number(req.params.id);
    const campaign = getCampaign(db, campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada.' });
    if (campaign.lifecycleStatus !== 'PUBLISHED') return res.status(409).json({ error: 'Sólo se puede cerrar una campaña publicada.' });
    const winner = campaign.candidates.toSorted((a, b) => b.voteCount - a.voteCount || b.desiredQuantity - a.desiredQuantity || a.id - b.id)[0];
    if (!winner) return res.status(409).json({ error: 'La campaña no tiene candidatas.' });
    db.prepare("UPDATE campaigns SET status='CLOSED',published=0,winner_burger_id=?,closed_at=CURRENT_TIMESTAMP WHERE id=?").run(winner.id, campaignId);
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'CAMPAIGN_CLOSED', entityType: 'CAMPAIGN', entityId: campaignId, metadata: { winnerBurgerId: winner.id, tieRule: 'voteCount then desiredQuantity then candidate id' } });
    res.json({ campaign: getCampaign(db, campaignId), winner });
  });

  app.post('/api/campaigns/:id/votes', limited(voteLimiter), requireAuth, requireRole('CLIENT'), (req, res) => {
    const data = parse(voteSchema, req.body, res);
    if (!data) return;
    const campaignId = Number(req.params.id);
    db.exec('BEGIN IMMEDIATE');
    try {
      const campaign = db.prepare('SELECT starts_at startsAt,ends_at endsAt,published,status FROM campaigns WHERE id=?').get(campaignId);
      const now = Date.now();
      if (!campaign || !campaign.published || campaign.status !== 'PUBLISHED') { db.exec('ROLLBACK'); return res.status(404).json({ error: 'Campaña no encontrada.' }); }
      if (now < Date.parse(campaign.startsAt) || now >= Date.parse(campaign.endsAt)) { db.exec('ROLLBACK'); return res.status(409).json({ error: 'La campaña no está abierta para votación.' }); }
      const candidate = db.prepare('SELECT 1 FROM campaign_burgers cb JOIN burgers b ON b.id=cb.burger_id WHERE cb.campaign_id=? AND cb.burger_id=? AND b.active=1 AND b.deleted=0').get(campaignId, data.burgerId);
      if (!candidate) { db.exec('ROLLBACK'); return res.status(400).json({ error: 'La hamburguesa no pertenece a esta campaña o ya no está disponible.' }); }
      db.prepare('INSERT INTO votes(user_id,campaign_id,burger_id,quantity) VALUES(?,?,?,?)').run(Number(req.auth.sub), campaignId, data.burgerId, data.quantity);
      writeAudit(db, {
        actorUserId: Number(req.auth.sub),
        action: 'VOTE_CAST',
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        metadata: { burgerId: data.burgerId, quantity: data.quantity }
      });
      db.exec('COMMIT');
      const message =
        data.quantity === 1
          ? 'Tu voto por 1 hamburguesa fue registrado.'
          : `Tu voto y tu solicitud de ${data.quantity} hamburguesas fueron registrados.`;
      res.status(201).json({
        message,
        campaign: getCampaign(db, campaignId, Number(req.auth.sub))
      });
    } catch (error) {
      db.exec('ROLLBACK');
      if (String(error).includes('UNIQUE')) {
        writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'DUPLICATE_VOTE_REJECTED', entityType: 'CAMPAIGN', entityId: campaignId });
        return res.status(409).json({ error: 'Ya votaste en esta campaña.' });
      }
      throw error;
    }
  });

  app.get('/api/campaigns/:id/votes', requireAuth, requireRole('ADMIN'), (req, res) => {
    const campaignId = Number(req.params.id);
    const campaign = db.prepare('SELECT id, name FROM campaigns WHERE id=?').get(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada.' });
    const votes = db.prepare(`
      SELECT v.id,
             v.quantity,
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
      ORDER BY v.created_at DESC
    `).all(campaignId);
    res.json({ campaignId, votes });
  });

  app.get('/api/admin/stats', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const totals = {
      users: db.prepare("SELECT COUNT(*) total FROM users WHERE role='CLIENT'").get().total,
      staff: db.prepare("SELECT COUNT(*) total FROM user_roles WHERE role IN ('ADMIN','CHEF')").get().total,
      burgers: db.prepare('SELECT COUNT(*) total FROM burgers WHERE active=1 AND deleted=0').get().total,
      campaigns: db.prepare('SELECT COUNT(*) total FROM campaigns').get().total,
      votes: db.prepare('SELECT COUNT(*) total FROM votes').get().total,
      desiredBurgers: db.prepare('SELECT COALESCE(SUM(quantity), 0) total FROM votes').get().total,
      orders: db.prepare("SELECT COUNT(*) total FROM orders WHERE status NOT IN ('DELIVERED','CANCELLED')").get().total,
      totalOrders: db.prepare('SELECT COUNT(*) total FROM orders').get().total,
      revenueCop: db.prepare("SELECT COALESCE(SUM(total_cop), 0) total FROM orders WHERE status <> 'CANCELLED'").get().total
    };

    const orderStatusRows = db
      .prepare('SELECT status, COUNT(*) count, COALESCE(SUM(total_cop), 0) totalCop FROM orders GROUP BY status')
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
      .prepare('SELECT entity_type entityType, COUNT(*) count FROM audit_logs GROUP BY entity_type ORDER BY count DESC')
      .all();

    res.json({
      totals,
      campaigns: listCampaigns(db),
      charts: {
        ordersByStatus: orderStatusRows,
        topBurgers,
        auditByEntity
      }
    });
  });
  app.get('/api/admin/audit', requireAuth, requireRole('ADMIN'), (req, res) => {
    const result = listAuditPaginated(db, {
      page: req.query.page ?? 1,
      pageSize: req.query.pageSize ?? 50,
      q: req.query.q ?? '',
      entityType: req.query.entityType ?? 'ALL',
      sortBy: req.query.sortBy ?? 'id',
      sortDir: req.query.sortDir ?? 'desc'
    });
    res.json(result);
  });

  installUserRoutes(app, { db, requireAuth, requireRole, parse });
  installOrderRoutes(app, { db, requireAuth, requireAnyRole, parse });

  const dist = path.resolve('dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Ocurrió un error inesperado.' });
  });
  return app;
}
