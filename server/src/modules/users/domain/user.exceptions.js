import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Users
 */
export class SelfAdminRoleDemotionException extends DomainException {
  constructor() {
    super('No puedes retirar tu propio rol de administrador.', {
      code: 'SELF_ROLE_DEMOTION',
      status: 409
    });
  }
}

export class UserNotFoundException extends DomainException {
  constructor() {
    super('Usuario no encontrado.', { code: 'USER_NOT_FOUND', status: 404 });
  }
}

