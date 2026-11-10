/**
 * MÓDULO DE APLICACIÓN: CATÁLOGO DE HAMBURGUESAS (Arquitectura Hexagonal)
 */

import { DomainError } from '../../domain/errors.js';

export function createBurgerUseCases({ ports }) {
  return {
    async list({ isAdmin = false } = {}) {
      return ports.burgers.list({ includeInactive: Boolean(isAdmin) });
    },

    async create(data, actorUserId) {
      return ports.burgers.create(data, actorUserId);
    },

    async update(id, data, actorUserId) {
      const updated = await ports.burgers.update(id, data, actorUserId);
      if (!updated) {
        throw DomainError.notFound('Hamburguesa no encontrada.', 'BURGER_NOT_FOUND');
      }
      return updated;
    },

    async remove(id, actorUserId) {
      const deleted = await ports.burgers.delete(id, actorUserId);
      if (!deleted) {
        throw DomainError.notFound('Hamburguesa no encontrada.', 'BURGER_NOT_FOUND');
      }
      return deleted;
    }
  };
}

