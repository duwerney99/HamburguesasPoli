import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Burgers
 */
export class BurgerNotFoundException extends DomainException {
  constructor() {
    super('Hamburguesa no encontrada.', { code: 'BURGER_NOT_FOUND', status: 404 });
  }
}

