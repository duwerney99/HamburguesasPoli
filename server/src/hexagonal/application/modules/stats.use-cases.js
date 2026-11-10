/**
 * MÓDULO DE APLICACIÓN: ESTADÍSTICAS Y DASHBOARD EJECUTIVO (Arquitectura Hexagonal)
 */

export function createStatsUseCases({ ports }) {
  return {
    async getDashboardStats() {
      return ports.stats.getDashboardStats();
    }
  };
}

