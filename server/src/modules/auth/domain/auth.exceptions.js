import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Auth
 */
export class EmailAlreadyRegisteredException extends DomainException {
  constructor() {
    super('Ese correo ya está registrado.', { code: 'EMAIL_ALREADY_REGISTERED', status: 409 });
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('Correo o contraseña incorrectos.', { code: 'INVALID_CREDENTIALS', status: 401 });
  }
}

export class InvalidOrExpiredSessionException extends DomainException {
  constructor() {
    super('La sesión expiró o fue revocada. Inicia sesión nuevamente.', {
      code: 'INVALID_OR_EXPIRED_SESSION',
      status: 401
    });
  }
}

