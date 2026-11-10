/**
 * INTERFACES / CONTRATOS DE DOMINIO: Módulo Auth
 */
export const AUTH_TOKEN_REPOSITORY_INTERFACE = [
  'saveRefreshToken',
  'findActiveByJti',
  'revokeByJti'
];

