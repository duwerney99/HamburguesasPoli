/**
 * ARQUITECTURA HEXAGONAL POR MÓDULOS (Screaming / Vertical Slice Hexagonal Modules)
 *
 * Cada módulo en `server/src/modules/<modulo>/` contiene sus 3 capas desacopladas:
 *   - `domain/`         -> Entidades, Excepciones, Repositorios (Puertos), Proyecciones, Interfaces y Value Objects
 *   - `application/`    -> Casos de Uso del módulo (`*.use-cases.js`)
 *   - `infrastructure/` -> Adaptadores de persistencia (`sqlite`, `firestore`), Controladores HTTP y DTOs
 */

import {
  assertRepositoryPortContract,
  REQUIRED_PORT_METHODS
} from '../hexagonal/ports/repositories.port.js';
import { createSqliteRepositoryAdapter } from '../hexagonal/adapters/outbound/sqlite.adapter.js';
import { createFirestoreRepositoryAdapter } from '../hexagonal/adapters/outbound/firestore.adapter.js';
import { createRepositoryAdapter } from '../hexagonal/adapters/outbound/repository.factory.js';

import { createAuthUseCases, registerAuthController } from './auth/index.js';
import { createUsersUseCases, registerUsersController } from './users/index.js';
import { createBurgersUseCases, registerBurgersController } from './burgers/index.js';
import { createCampaignsUseCases, registerCampaignsController } from './campaigns/index.js';
import { createOrdersUseCases, registerOrdersController } from './orders/index.js';
import { createSalesUseCases, registerSalesController } from './sales/index.js';
import { createAuditUseCases, registerAuditController } from './audit/index.js';
import { createStatsUseCases, registerStatsController } from './stats/index.js';

export const MODULE_NAMES = [
  'auth',
  'users',
  'burgers',
  'campaigns',
  'orders',
  'sales',
  'audit',
  'stats'
];

export const REPOSITORY_PORT_NAMES = Object.keys(REQUIRED_PORT_METHODS);

export {
  REQUIRED_PORT_METHODS,
  assertRepositoryPortContract,
  createSqliteRepositoryAdapter,
  createFirestoreRepositoryAdapter,
  createRepositoryAdapter
};

/**
 * Ensambla la capa de Aplicación (`modules/<modulo>/application/<modulo>.use-cases.js`) de todos los módulos
 */
export function createApplicationUseCases(
  repositories,
  { jwtSecret = 'dev-only-change-me', refreshSecret = `${jwtSecret}:refresh` } = {}
) {
  const ports = assertRepositoryPortContract(repositories);

  return {
    provider: ports.provider || 'unknown',
    ports,
    auth: createAuthUseCases({ ports, jwtSecret, refreshSecret }),
    users: createUsersUseCases({ ports }),
    burgers: createBurgersUseCases({ ports }),
    campaigns: createCampaignsUseCases({ ports }),
    orders: createOrdersUseCases({ ports }),
    sales: createSalesUseCases({ ports }),
    audit: createAuditUseCases({ ports }),
    stats: createStatsUseCases({ ports })
  };
}

/**
 * Registra el endpoint de introspección arquitectónica por módulos (`GET /api/architecture`)
 */
export function registerHexagonalArchitectureRoutes(app, { useCases }) {
  app.get('/api/architecture', (_req, res) => {
    const moduleStructure = Object.fromEntries(
      MODULE_NAMES.map(mod => [
        mod,
        {
          application: `server/src/modules/${mod}/application/${mod}.use-cases.js`,
          domain: {
            entity: `server/src/modules/${mod}/domain/`,
            exceptions: `server/src/modules/${mod}/domain/`,
            repository: `server/src/modules/${mod}/domain/`,
            projections: `server/src/modules/${mod}/domain/`,
            interfaces: `server/src/modules/${mod}/domain/`,
            valueObjects: `server/src/modules/${mod}/domain/`
          },
          infrastructure: {
            adapters: [
              `server/src/modules/${mod}/infrastructure/adapters/${mod}-sqlite.adapter.js`,
              `server/src/modules/${mod}/infrastructure/adapters/${mod}-firestore.adapter.js`
            ],
            controllers: `server/src/modules/${mod}/infrastructure/controllers/${mod}.controller.js`,
            dtos: `server/src/modules/${mod}/infrastructure/dtos/${mod}.dto.js`
          }
        }
      ])
    );

    res.json({
      architecture: 'hexagonal-modular',
      pattern:
        'Modular Hexagonal Architecture by Feature Modules (application, domain, infrastructure)',
      provider: useCases.provider,
      ports: REPOSITORY_PORT_NAMES,
      modules: MODULE_NAMES,
      moduleStructure
    });
  });
}

/**
 * Registra todos los controladores HTTP de cada módulo (`modules/<modulo>/infrastructure/controllers/<modulo>.controller.js`)
 */
export function registerModularHttpControllers(app, deps) {
  registerHexagonalArchitectureRoutes(app, deps);
  registerAuthController(app, deps);
  registerBurgersController(app, deps);
  registerCampaignsController(app, deps);
  registerOrdersController(app, deps);
  registerSalesController(app, deps);
  registerUsersController(app, deps);
  registerAuditController(app, deps);
  registerStatsController(app, deps);
}

export { registerModularHttpControllers as registerHexagonalHttpAdapters };

export * from '../hexagonal/domain/entities.js';
export * from './shared/domain/exceptions/domain.exception.js';
export * from './shared/domain/value-objects/identifier.value-object.js';
export * from './auth/index.js';
export * from './users/index.js';
export * from './burgers/index.js';
export * from './campaigns/index.js';
export * from './orders/index.js';
export * from './sales/index.js';
export * from './audit/index.js';
export * from './stats/index.js';
