/**
 * APPLICATION LAYER: Casos de Uso del Módulo Stats
 * Ubicación: server/src/modules/stats/application/stats.use-cases.js
 */
export function createStatsUseCases({ ports }) {
  return {
    async getDashboardStats() {
      return ports.stats.getDashboardStats();
    }
  };
}
