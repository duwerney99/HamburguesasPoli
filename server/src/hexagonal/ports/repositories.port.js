/**
 * CAPA DE PUERTOS (Arquitectura Hexagonal Modular - Ports & Adapters)
 * Define los contratos que debe implementar cualquier adaptador secundario de base de datos
 * (Firebase Cloud Firestore, SQLite, PostgreSQL, MongoDB, etc.).
 */

export const REQUIRED_PORT_METHODS = Object.freeze({
  authTokens: [
    'saveRefreshToken',
    'findRefreshToken',
    'revokeByJti',
    'revokeByHash',
    'revokeByUser'
  ],
  users: ['findById', 'findByEmail', 'createClient', 'setRole', 'listPaginated'],
  burgers: ['list', 'get', 'countActiveByIds', 'create', 'update', 'delete'],
  campaigns: [
    'list',
    'get',
    'findOverlappingPublished',
    'getMetaForUpdate',
    'create',
    'update',
    'close',
    'listVotes'
  ],
  votes: ['create'],
  orders: [
    'create',
    'get',
    'listByUser',
    'listKitchen',
    'changeStatus',
    'cancelByClient',
    'getSalesDashboard',
    'updateSaleOrder',
    'updateCampaignVoteSale'
  ],
  audit: ['write', 'list', 'listPaginated'],
  stats: ['getDashboardStats']
});

export function assertRepositoryPortContract(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Se requiere un adaptador de repositorios válido.');
  }
  for (const [portName, methods] of Object.entries(REQUIRED_PORT_METHODS)) {
    const port = adapter[portName];
    if (!port || typeof port !== 'object') {
      throw new Error(`El adaptador no implementa el puerto requerido: "${portName}".`);
    }
    for (const method of methods) {
      if (typeof port[method] !== 'function') {
        throw new Error(
          `El puerto "${portName}" del adaptador no implementa el método requerido "${method}()".`
        );
      }
    }
  }
  return adapter;
}
