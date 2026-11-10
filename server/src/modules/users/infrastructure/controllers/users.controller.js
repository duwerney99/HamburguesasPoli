import { roleUpdateDtoSchema } from '../dtos/users.dto.js';
import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Users
 */
export function registerUsersController(app, { useCases, requireAuth, requireRole, parse }) {
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
      handleModuleControllerError(error, res, next);
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
      handleModuleControllerError(error, res, next);
    }
  });

  app.put(
    '/api/admin/users/:id/role',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      const data = parse(roleUpdateDtoSchema, req.body, res);
      if (!data) return;
      try {
        const user = await useCases.users.changeRole({
          userId: req.params.id,
          role: data.role,
          actorUserId: req.auth.sub
        });
        res.json({ user });
      } catch (error) {
        handleModuleControllerError(error, res, next);
      }
    }
  );
}
