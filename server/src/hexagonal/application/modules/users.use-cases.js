/**
 * MÓDULO DE APLICACIÓN: USUARIOS Y CLIENTES (Arquitectura Hexagonal)
 */

import { formatPublicUser } from '../../domain/entities.js';
import { DomainError } from '../../domain/errors.js';

export function createUserUseCases({ ports }) {
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
        throw DomainError.conflict(
          'No puedes retirar tu propio rol de administrador.',
          'SELF_DEMOTION_FORBIDDEN'
        );
      }
      const updated = await ports.users.setRole({ userId, role, actorUserId });
      if (!updated) {
        throw DomainError.notFound('Usuario no encontrado.', 'USER_NOT_FOUND');
      }
      return formatPublicUser(updated);
    }
  };
}

