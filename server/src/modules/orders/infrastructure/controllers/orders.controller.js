import { kitchenStatusDtoSchema, orderDtoSchema } from '../dtos/orders.dto.js';
import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Orders & Kitchen
 */
export function registerOrdersController(
  app,
  { useCases, requireAuth, requireAnyRole, parse }
) {
  app.post('/api/orders', requireAuth, requireAnyRole('CLIENT'), async (req, res, next) => {
    const data = parse(orderDtoSchema, req.body, res);
    if (!data) return;
    try {
      const order = await useCases.orders.create(data, req.auth.sub);
      res.status(201).json({ order });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.get('/api/orders/mine', requireAuth, requireAnyRole('CLIENT'), async (req, res, next) => {
    try {
      const orders = await useCases.orders.listMine(req.auth.sub);
      res.json({ orders });
    } catch (error) {
      handleModuleControllerError(error, res, next);
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
        handleModuleControllerError(error, res, next);
      }
    }
  );

  app.put(
    '/api/kitchen/orders/:id/status',
    requireAuth,
    requireAnyRole('CHEF', 'ADMIN'),
    async (req, res, next) => {
      const data = parse(kitchenStatusDtoSchema, req.body, res);
      if (!data) return;
      try {
        const order = await useCases.orders.advanceKitchenStatus({
          orderId: req.params.id,
          nextStatus: data.status,
          actorUserId: req.auth.sub
        });
        res.json({ order });
      } catch (error) {
        handleModuleControllerError(error, res, next);
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
        handleModuleControllerError(error, res, next);
      }
    }
  );
}
