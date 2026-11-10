/**
 * CAPA DE DOMINIO: Errores de Dominio y Aplicación (independientes del transporte HTTP)
 */

export class DomainError extends Error {
  constructor(code, publicMessage, status = 400) {
    super(publicMessage || code);
    this.name = 'DomainError';
    this.code = code;
    this.publicMessage = publicMessage || code;
    this.status = status;
  }

  static badRequest(message, code = 'BAD_REQUEST') {
    return new DomainError(code, message, 400);
  }

  static unauthorized(message = 'Debes iniciar sesión.', code = 'UNAUTHORIZED') {
    return new DomainError(code, message, 401);
  }

  static forbidden(
    message = 'No tienes permiso para realizar esta acción.',
    code = 'FORBIDDEN'
  ) {
    return new DomainError(code, message, 403);
  }

  static notFound(message = 'Recurso no encontrado.', code = 'NOT_FOUND') {
    return new DomainError(code, message, 404);
  }

  static conflict(message = 'Conflicto con el estado actual del recurso.', code = 'CONFLICT') {
    return new DomainError(code, message, 409);
  }
}

