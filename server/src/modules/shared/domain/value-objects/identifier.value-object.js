import { DomainException } from '../exceptions/domain.exception.js';

/**
 * VALUE OBJECT: Identificador de Entidad (Soporta IDs numéricos de SQLite o strings de Firestore)
 */
export class EntityIdValueObject {
  constructor(rawId, label = 'Identificador') {
    if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
      throw DomainException.badRequest(`${label} es obligatorio.`, 'INVALID_ENTITY_ID');
    }
    const asNumber = Number(rawId);
    this.value = Number.isFinite(asNumber) && String(asNumber) === String(rawId).trim() ? asNumber : String(rawId).trim();
  }

  toNumber() {
    return Number(this.value);
  }

  toString() {
    return String(this.value);
  }
}

