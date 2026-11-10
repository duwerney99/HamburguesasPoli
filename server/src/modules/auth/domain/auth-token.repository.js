import { AUTH_TOKEN_REPOSITORY_INTERFACE } from './auth.interfaces.js';

/**
 * REPOSITORY PORT: Puerto de persistencia de Tokens de Autenticación
 */
export function assertAuthTokenRepositoryPort(port) {
  for (const method of AUTH_TOKEN_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`AuthTokenRepositoryPort incumple el método requerido: authTokens.${method}()`);
    }
  }
  return port;
}

