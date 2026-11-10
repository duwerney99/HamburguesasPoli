/**
 * APPLICATION LAYER: Casos de Uso del Módulo Users
 * Ubicación: server/src/modules/users/application/users.use-cases.js
 */
import { toPublicUserProjection } from '../domain/user.projections.js';
import {
  SelfAdminRoleDemotionException,
  UserNotFoundException
} from '../domain/user.exceptions.js';

export function createUsersUseCases({ ports }) {
  return {
    async listStaffOrUsers(params) {
      return ports.users.listPaginated(params);
    },

    async listClients(params) {
      const result = await ports.users.listPaginated({
        ...params,
        scope: 'CLIENTS',
        role: 'CLIENT'
      });
      return {
        clients: result.users,
        users: result.users,
        counts: result.counts,
        pagination: result.pagination
      };
    },

    async changeRole({ userId, role, actorUserId }) {
      if (String(userId) === String(actorUserId) && role !== 'ADMIN') {
        throw new SelfAdminRoleDemotionException();
      }
      const updated = await ports.users.setRole({ userId, role, actorUserId });
      if (!updated) {
        throw new UserNotFoundException();
      }
      return toPublicUserProjection(updated);
    }
  };
}
