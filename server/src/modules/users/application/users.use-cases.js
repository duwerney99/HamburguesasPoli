/**
 * APPLICATION LAYER: Casos de Uso del Módulo Users
 * Ubicación: server/src/modules/users/application/users.use-cases.js
 */
import bcrypt from 'bcryptjs';
import { toPublicUserProjection } from '../domain/user.projections.js';
import {
  SelfAdminRoleDemotionException,
  UserNotFoundException
} from '../domain/user.exceptions.js';
import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

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

    async createStaffUser({ name, email, password, role, actorUserId }) {
      if (!['ADMIN', 'CHEF'].includes(role)) {
        throw DomainException.badRequest(
          'Solo se pueden crear usuarios internos con rol ADMIN o CHEF.',
          'INVALID_STAFF_ROLE'
        );
      }
      const passwordHash = bcrypt.hashSync(password, 10);
      const created = await ports.users.createClient({
        name,
        email,
        passwordHash,
        role,
        actorUserId
      });
      return toPublicUserProjection(created);
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
