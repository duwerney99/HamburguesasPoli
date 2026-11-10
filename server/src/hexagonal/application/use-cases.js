/**
 * CAPA DE APLICACIÓN MODULAR (Arquitectura Hexagonal)
 * Ensambla todos los módulos de casos de uso conectándolos exclusivamente a los puertos de salida.
 */

import { assertRepositoryPortContract } from '../ports/repositories.port.js';
import { createAuditUseCases } from './modules/audit.use-cases.js';
import { createAuthUseCases } from './modules/auth.use-cases.js';
import { createBurgerUseCases } from './modules/burgers.use-cases.js';
import { createCampaignUseCases } from './modules/campaigns.use-cases.js';
import { createOrderUseCases } from './modules/orders.use-cases.js';
import { createSalesUseCases } from './modules/sales.use-cases.js';
import { createStatsUseCases } from './modules/stats.use-cases.js';
import { createUserUseCases } from './modules/users.use-cases.js';

export function createApplicationUseCases(
  repositories,
  { jwtSecret = 'dev-only-change-me', refreshSecret = `${jwtSecret}:refresh` } = {}
) {
  const ports = assertRepositoryPortContract(repositories);

  return {
    provider: ports.provider || 'unknown',
    ports,
    auth: createAuthUseCases({ ports, jwtSecret, refreshSecret }),
    users: createUserUseCases({ ports }),
    burgers: createBurgerUseCases({ ports }),
    campaigns: createCampaignUseCases({ ports }),
    orders: createOrderUseCases({ ports }),
    sales: createSalesUseCases({ ports }),
    audit: createAuditUseCases({ ports }),
    stats: createStatsUseCases({ ports })
  };
}
