import { USER_REPOSITORY_INTERFACE } from './user.interfaces.js';

/**
 * REPOSITORY PORT: Puerto de persistencia de Usuarios
 */
export function assertUserRepositoryPort(port) {
  for (const method of USER_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`UserRepositoryPort incumple el método requerido: users.${method}()`);
    }
  }
  return port;
}

