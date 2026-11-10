import { BURGER_REPOSITORY_INTERFACE } from './burger.interfaces.js';

/**
 * REPOSITORY PORT: Puerto de persistencia de Hamburguesas
 */
export function assertBurgerRepositoryPort(port) {
  for (const method of BURGER_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`BurgerRepositoryPort incumple el método requerido: burgers.${method}()`);
    }
  }
  return port;
}

