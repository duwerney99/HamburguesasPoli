import { burgerDtoSchema } from '../dtos/burgers.dto.js';
import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Burgers
 */
export function registerBurgersController(
  app,
  { useCases, optionalAuth, requireAuth, requireRole, parse }
) {
  app.get('/api/burgers', optionalAuth, async (req, res, next) => {
    try {
      const isAdmin = req.auth?.role === 'ADMIN';
      const burgers = await useCases.burgers.list({ isAdmin });
      res.json({ burgers });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.post('/api/burgers', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(burgerDtoSchema, req.body, res);
    if (!data) return;
    try {
      const burger = await useCases.burgers.create(data, req.auth.sub);
      res.status(201).json({ burger });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.put('/api/burgers/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(burgerDtoSchema, req.body, res);
    if (!data) return;
    try {
      const burger = await useCases.burgers.update(req.params.id, data, req.auth.sub);
      res.json({ burger });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.delete('/api/burgers/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      await useCases.burgers.remove(req.params.id, req.auth.sub);
      res.status(204).end();
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });
}
