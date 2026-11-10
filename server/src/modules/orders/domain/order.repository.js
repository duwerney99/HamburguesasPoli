import { ORDER_REPOSITORY_INTERFACE } from './order.interfaces.js';

/**
 * REPOSITORY PORT: Puerto de persistencia de Pedidos
 */
export function assertOrderRepositoryPort(port) {
  for (const method of ORDER_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`OrderRepositoryPort incumple el método requerido: orders.${method}()`);
    }
  }
  return port;
}

