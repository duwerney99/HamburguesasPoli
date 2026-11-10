import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Audit
 */
export function registerAuditController(app, { useCases, requireAuth, requireRole }) {
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
      handleModuleControllerError(error, res, next);
    }
  });
}
