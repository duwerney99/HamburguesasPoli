import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  createApplicationUseCases,
  createRepositoryAdapter,
  registerModularHttpControllers
} from './modules/index.js';

export { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS };

function parse(schema, body, res) {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message, issues: result.error.issues });
    return null;
  }
  return result.data;
}

/**
 * RAÍZ DE COMPOSICIÓN (Arquitectura Hexagonal por Módulos)
 *
 * Cada módulo (`server/src/modules/<modulo>/`) encapsula:
 *   - `domain/`         (entity, exceptions, repository, projections, interfaces, value-objects)
 *   - `application/`    (casos de uso desacoplados)
 *   - `infrastructure/` (adapters SQLite/Firestore, controllers HTTP, DTOs)
 */
export function createApp({
  db,
  provider = process.env.DB_PROVIDER || 'sqlite',
  firestoreDb = null,
  jwtSecret = 'dev-only-change-me',
  refreshSecret = `${jwtSecret}:refresh`,
  clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  rateLimitMax = 120,
  repositories = null
} = {}) {
  const app = express();

  const repositoryAdapter =
    repositories ||
    createRepositoryAdapter({
      provider,
      sqliteDb: db,
      firestoreDb
    });
  const useCases = createApplicationUseCases(repositoryAdapter, {
    jwtSecret,
    refreshSecret
  });

  app.locals.repositoryAdapter = repositoryAdapter;
  app.locals.useCases = useCases;

  app.use(helmet({ contentSecurityPolicy: false }));
  const allowedOrigins = String(clientOrigin)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(Object.assign(new Error('Origen CORS no permitido.'), { status: 403 }));
      },
      credentials: false
    })
  );
  app.use(express.json({ limit: '5mb' }));

  const limitedVote = rateLimit({
    windowMs: 60_000,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  });
  const limitedAuth = rateLimit({
    windowMs: 60_000,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  });

  function readAuth(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    try {
      const payload = jwt.verify(token, jwtSecret);
      if (payload.type && payload.type !== 'access') return null;
      const numericSub = Number(payload.sub);
      return {
        sub: Number.isFinite(numericSub) ? numericSub : payload.sub,
        role: payload.role
      };
    } catch {
      return null;
    }
  }

  function optionalAuth(req, _res, next) {
    req.auth = readAuth(req);
    next();
  }

  function requireAuth(req, res, next) {
    req.auth = readAuth(req);
    if (!req.auth) {
      return res.status(401).json({ error: 'Debes iniciar sesión.' });
    }
    return next();
  }

  function requireRole(role) {
    return (req, res, next) => {
      if (req.auth?.role !== role) {
        return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
      }
      return next();
    };
  }

  function requireAnyRole(...allowedRoles) {
    return (req, res, next) => {
      if (!allowedRoles.includes(req.auth?.role)) {
        return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
      }
      return next();
    };
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Registro de los Controladores HTTP de cada módulo (auth, burgers, campaigns, orders, sales, users, audit, stats)
  registerModularHttpControllers(app, {
    useCases,
    optionalAuth,
    requireAuth,
    requireRole,
    requireAnyRole,
    parse,
    limitedAuth,
    limitedVote
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  const clientDist = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res
      .status(err?.status || 500)
      .json({ error: err?.publicMessage || (err?.status ? err.message : 'Ocurrió un error interno. Intenta nuevamente.') });
  });

  return app;
}
