/**
 * VALUE OBJECTS: Credenciales y Correo Electrónico (Módulo Auth)
 */
import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

export class EmailValueObject {
  constructor(rawEmail) {
    const normalized = String(rawEmail || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw DomainException.badRequest('Ingresa un correo electrónico válido.', 'INVALID_EMAIL');
    }
    this.value = normalized;
  }

  toString() {
    return this.value;
  }
}

