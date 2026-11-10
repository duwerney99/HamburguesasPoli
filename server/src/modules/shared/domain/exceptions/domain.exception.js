/**
 * EXCEPCIÓN BASE DE DOMINIO (Arquitectura Hexagonal por Módulos)
 */
export class DomainException extends Error {
  constructor(message, { code = 'DOMAIN_ERROR', status = 400 } = {}) {
    super(message);
    this.name = 'DomainException';
    this.code = code;
    this.status = status;
    this.publicMessage = message;
  }

  static badRequest(message, code = 'BAD_REQUEST') {
    return new DomainException(message, { code, status: 400 });
  }

  static unauthorized(message = 'Debes iniciar sesión.', code = 'UNAUTHORIZED') {
    return new DomainException(message, { code, status: 401 });
  }

  static forbidden(message = 'No tienes permisos para esta acción.', code = 'FORBIDDEN') {
    return new DomainException(message, { code, status: 403 });
  }

  static notFound(message = 'Recurso no encontrado.', code = 'NOT_FOUND') {
    return new DomainException(message, { code, status: 404 });
  }

  static conflict(message, code = 'CONFLICT') {
    return new DomainException(message, { code, status: 409 });
  }
}

export { DomainException as DomainError };

