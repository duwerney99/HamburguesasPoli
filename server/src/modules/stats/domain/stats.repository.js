import { STATS_REPOSITORY_INTERFACE } from './stats.interfaces.js';

/**
 * REPOSITORY PORT: Puerto de persistencia de Estadísticas
 */
export function assertStatsRepositoryPort(port) {
  for (const method of STATS_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`StatsRepositoryPort incumple el método requerido: stats.${method}()`);
    }
  }
  return port;
}

