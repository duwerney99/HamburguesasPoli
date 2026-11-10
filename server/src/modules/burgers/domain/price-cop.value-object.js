import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * VALUE OBJECT: Precio en Pesos Colombianos (COP)
 */
export class PriceCopValueObject {
  constructor(rawPrice) {
    const parsed = Number(rawPrice);
    if (!Number.isInteger(parsed) || parsed < 5000 || parsed > 250000) {
      throw DomainException.badRequest(
        'El precio debe ser un entero entre $5.000 y $250.000 COP.',
        'INVALID_PRICE_COP'
      );
    }
    this.value = parsed;
  }

  toNumber() {
    return this.value;
  }
}

