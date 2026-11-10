/**
 * ADAPTADOR PRIMARIO / ENTRADA: CONTROLADORES HTTP EXPRESS (Arquitectura Hexagonal Modular)
 * Conecta las rutas REST de Express exclusivamente con la capa de Casos de Uso (`useCases`),
 * sin acoplarse a SQLite, Firestore ni a ninguna consulta de base de datos directa.
 */

import {
  burgerSchema,
  campaignSchema,
  campaignVoteOrderUpdateSchema,
  credentialsSchema,
  kitchenStatusSchema,
  orderSchema,
  refreshSchema,
  registerSchema,
  roleUpdateSchema,
  saleOrderUpdateSchema,
  voteSchema
} from '../../domain/schemas.js';

function handleControllerError(error, res, next) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.publicMessage || error.message });
  }
  return next(error);
}

export function registerHexagonalArchitectureRoutes(app, { useCases }) {
  app.get('/api/architecture', (_req, res) => {
    res.json({
      architecture: 'hexagonal-modular',
      pattern: 'Modular Hexagonal Architecture (Ports & Adapters)',
      provider: useCases.provider,
      ports: ['authTokens', 'users', 'burgers', 'campaigns', 'votes', 'orders', 'audit', 'stats'],
      modules: ['auth', 'users', 'burgers', 'campaigns', 'orders', 'sales', 'audit', 'stats'],
      layers: {
        domain: [
          'server/src/hexagonal/domain/entities.js',
          'server/src/hexagonal/domain/schemas.js',
          'server/src/hexagonal/domain/errors.js'
        ],
        ports: ['server/src/hexagonal/ports/repositories.port.js'],
        application: [
          'server/src/hexagonal/application/use-cases.js',
          'server/src/hexagonal/application/modules/auth.use-cases.js',
          'server/src/hexagonal/application/modules/burgers.use-cases.js',
          'server/src/hexagonal/application/modules/campaigns.use-cases.js',
          'server/src/hexagonal/application/modules/orders.use-cases.js',
          'server/src/hexagonal/application/modules/sales.use-cases.js',
          'server/src/hexagonal/application/modules/users.use-cases.js',
          'server/src/hexagonal/application/modules/audit.use-cases.js',
          'server/src/hexagonal/application/modules/stats.use-cases.js'
        ],
        inboundAdapters: ['server/src/hexagonal/adapters/inbound/http.controller.js'],
        outboundAdapters: [
          'server/src/hexagonal/adapters/outbound/firestore.adapter.js',
          'server/src/hexagonal/adapters/outbound/sqlite.adapter.js',
          'server/src/hexagonal/adapters/outbound/repository.factory.js'
        ]
      }
    });
  });
}

export function registerHexagonalHttpAdapters(
  app,
  {
    useCases,
    optionalAuth,
    requireAuth,
    requireRole,
    requireAnyRole,
    parse,
    limitedAuth,
    limitedVote
  }
) {
  registerHexagonalArchitectureRoutes(app, { useCases });

  // =========================================================================
  // 1. MÓDULO AUTH (/api/auth/*)
  // =========================================================================
  app.post('/api/auth/register', limitedAuth, async (req, res, next) => {
    const data = parse(registerSchema, req.body, res);
    if (!data) return;
    try {
      const session = await useCases.auth.register(data);
      res.status(201).json(session);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.post('/api/auth/login', limitedAuth, async (req, res, next) => {
    const data = parse(credentialsSchema, req.body, res);
    if (!data) return;
    try {
      const session = await useCases.auth.login(data);
      res.json(session);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.post('/api/auth/refresh', limitedAuth, async (req, res, next) => {
    const data = parse(refreshSchema, req.body, res);
    if (!data) return;
    try {
      const session = await useCases.auth.refresh(data);
      res.json(session);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.post('/api/auth/logout', optionalAuth, async (req, res, next) => {
    try {
      await useCases.auth.logout({
        refreshToken: req.body?.refreshToken,
        userId: req.auth?.sub
      });
      res.status(204).end();
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res, next) => {
    try {
      const user = await useCases.auth.getProfile(req.auth.sub);
      res.json({ user });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  // =========================================================================
  // 2. MÓDULO BURGERS (/api/burgers/*)
  // =========================================================================
  app.get('/api/burgers', optionalAuth, async (req, res, next) => {
    try {
      const isAdmin = req.auth?.role === 'ADMIN';
      const burgers = await useCases.burgers.list({ isAdmin });
      res.json({ burgers });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.post('/api/burgers', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(burgerSchema, req.body, res);
    if (!data) return;
    try {
      const burger = await useCases.burgers.create(data, req.auth.sub);
      res.status(201).json({ burger });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.put('/api/burgers/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(burgerSchema, req.body, res);
    if (!data) return;
    try {
      const burger = await useCases.burgers.update(req.params.id, data, req.auth.sub);
      res.json({ burger });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.delete('/api/burgers/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      await useCases.burgers.remove(req.params.id, req.auth.sub);
      res.status(204).end();
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  // =========================================================================
  // 3. MÓDULO CAMPAIGNS Y VOTES (/api/campaigns/*)
  // =========================================================================
  app.get('/api/campaigns', optionalAuth, async (req, res, next) => {
    try {
      const campaigns = await useCases.campaigns.list({
        userId: req.auth?.sub,
        isAdmin: req.auth?.role === 'ADMIN'
      });
      res.json({ campaigns });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.get('/api/campaigns/active', optionalAuth, async (req, res, next) => {
    try {
      const campaign = await useCases.campaigns.getActive(req.auth?.sub);
      res.json({ campaign });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.post('/api/campaigns', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(campaignSchema, req.body, res);
    if (!data) return;
    try {
      const campaign = await useCases.campaigns.create(data, req.auth.sub);
      res.status(201).json({ campaign });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.put('/api/campaigns/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(campaignSchema, req.body, res);
    if (!data) return;
    try {
      const campaign = await useCases.campaigns.update(req.params.id, data, req.auth.sub);
      res.json({ campaign });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.post(
    '/api/campaigns/:id/close',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      try {
        const result = await useCases.campaigns.close(req.params.id, req.auth.sub);
        res.json(result);
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  app.post(
    '/api/campaigns/:id/votes',
    limitedVote,
    requireAuth,
    requireRole('CLIENT'),
    async (req, res, next) => {
      const data = parse(voteSchema, req.body, res);
      if (!data) return;
      try {
        const result = await useCases.campaigns.castVote({
          campaignId: req.params.id,
          burgerId: data.burgerId,
          quantity: data.quantity,
          userId: req.auth.sub
        });
        res.status(201).json(result);
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  app.get(
    '/api/campaigns/:id/votes',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      try {
        const result = await useCases.campaigns.listVotes(req.params.id);
        res.json(result);
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  // =========================================================================
  // 4. MÓDULO ORDERS Y KITCHEN (/api/orders/* & /api/kitchen/orders/*)
  // =========================================================================
  app.post('/api/orders', requireAuth, requireAnyRole('CLIENT'), async (req, res, next) => {
    const data = parse(orderSchema, req.body, res);
    if (!data) return;
    try {
      const order = await useCases.orders.create(data, req.auth.sub);
      res.status(201).json({ order });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.get('/api/orders/mine', requireAuth, requireAnyRole('CLIENT'), async (req, res, next) => {
    try {
      const orders = await useCases.orders.listMine(req.auth.sub);
      res.json({ orders });
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.get(
    '/api/kitchen/orders',
    requireAuth,
    requireAnyRole('CHEF', 'ADMIN'),
    async (_req, res, next) => {
      try {
        const board = await useCases.orders.getKitchenBoard();
        res.json(board);
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  app.put(
    '/api/kitchen/orders/:id/status',
    requireAuth,
    requireAnyRole('CHEF', 'ADMIN'),
    async (req, res, next) => {
      const data = parse(kitchenStatusSchema, req.body, res);
      if (!data) return;
      try {
        const order = await useCases.orders.advanceKitchenStatus({
          orderId: req.params.id,
          nextStatus: data.status,
          actorUserId: req.auth.sub
        });
        res.json({ order });
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  app.put(
    '/api/orders/:id/cancel',
    requireAuth,
    requireAnyRole('CLIENT'),
    async (req, res, next) => {
      try {
        const order = await useCases.orders.cancelByClient({
          orderId: req.params.id,
          userId: req.auth.sub
        });
        res.json({ order });
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  // =========================================================================
  // 5. MÓDULO SALES Y CAMPAIGN ORDERS (/api/admin/sales/*)
  // =========================================================================
  app.get('/api/admin/sales', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const dashboard = await useCases.sales.getDashboard({
        campaignId: req.query.campaignId
      });
      res.json(dashboard);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.put(
    '/api/admin/sales/orders/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      const data = parse(saleOrderUpdateSchema, req.body, res);
      if (!data) return;
      try {
        const order = await useCases.sales.updateSaleOrder({
          orderId: req.params.id,
          paymentStatus: data.paymentStatus,
          status: data.status,
          actorUserId: req.auth.sub
        });
        res.json({ order });
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  app.put(
    '/api/admin/sales/campaign-votes/:voteId',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      const data = parse(campaignVoteOrderUpdateSchema, req.body, res);
      if (!data) return;
      try {
        const result = await useCases.sales.updateCampaignVoteSale({
          voteId: req.params.voteId,
          ...data,
          actorUserId: req.auth.sub
        });
        res.json(result);
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  // =========================================================================
  // 6. MÓDULO USERS Y CLIENTS (/api/admin/users/* & /api/admin/clients)
  // =========================================================================
  app.get('/api/admin/users', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const result = await useCases.users.listStaffOrUsers({
        page: req.query.page ?? 1,
        pageSize: req.query.pageSize ?? 10,
        q: req.query.q ?? '',
        scope: req.query.scope ?? 'ALL',
        role: req.query.role ?? 'ALL',
        sortBy: req.query.sortBy ?? 'id',
        sortDir: req.query.sortDir ?? 'desc'
      });
      res.json(result);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.get('/api/admin/clients', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const result = await useCases.users.listClients({
        page: req.query.page ?? 1,
        pageSize: req.query.pageSize ?? 10,
        q: req.query.q ?? '',
        sortBy: req.query.sortBy ?? 'id',
        sortDir: req.query.sortDir ?? 'desc'
      });
      res.json(result);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.put(
    '/api/admin/users/:id/role',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      const data = parse(roleUpdateSchema, req.body, res);
      if (!data) return;
      try {
        const user = await useCases.users.changeRole({
          userId: req.params.id,
          role: data.role,
          actorUserId: req.auth.sub
        });
        res.json({ user });
      } catch (error) {
        handleControllerError(error, res, next);
      }
    }
  );

  // =========================================================================
  // 7. MÓDULO STATS Y AUDIT (/api/admin/stats & /api/admin/audit)
  // =========================================================================
  app.get('/api/admin/stats', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
    try {
      const stats = await useCases.stats.getDashboardStats();
      res.json(stats);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });

  app.get('/api/admin/audit', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const result = await useCases.audit.listPaginated({
        page: req.query.page ?? 1,
        pageSize: req.query.pageSize ?? 50,
        q: req.query.q ?? '',
        entityType: req.query.entityType ?? 'ALL',
        sortBy: req.query.sortBy ?? 'id',
        sortDir: req.query.sortDir ?? 'desc'
      });
      res.json(result);
    } catch (error) {
      handleControllerError(error, res, next);
    }
  });
}
