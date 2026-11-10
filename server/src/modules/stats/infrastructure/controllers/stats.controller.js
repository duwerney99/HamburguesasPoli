import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Stats
 */
export function registerStatsController(app, { useCases, requireAuth, requireRole }) {
  app.get('/api/admin/stats', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
    try {
      const stats = await useCases.stats.getDashboardStats();
      res.json(stats);
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });
}
