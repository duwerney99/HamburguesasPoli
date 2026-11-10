/**
 * APPLICATION LAYER: Casos de Uso del Módulo Burgers
 * Ubicación: server/src/modules/burgers/application/burgers.use-cases.js
 */
import { BurgerNotFoundException } from '../domain/burger.exceptions.js';

export function createBurgersUseCases({ ports }) {
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
        throw new BurgerNotFoundException();
      }
      return updated;
    },

    async remove(id, actorUserId) {
      const deleted = await ports.burgers.delete(id, actorUserId);
      if (!deleted) {
        throw new BurgerNotFoundException();
      }
      return deleted;
    }
  };
}
