import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Orders & Kitchen
 */
export class OrderNotFoundException extends DomainException {
  constructor() {
    super('Pedido no encontrado.', { code: 'ORDER_NOT_FOUND', status: 404 });
  }
}

export class InvalidKitchenTransitionException extends DomainException {
  constructor(fromStatus, toStatus) {
    super(`Transición no permitida de ${fromStatus} a ${toStatus}.`, {
      code: 'INVALID_STATUS_TRANSITION',
      status: 409
    });
  }
}

