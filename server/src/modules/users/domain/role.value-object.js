import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

export const USER_ROLES = ['CLIENT', 'CHEF', 'ADMIN'];

/**
 * VALUE OBJECT: Rol de Usuario (CLIENT, CHEF, ADMIN)
 */
export class UserRoleValueObject {
  constructor(rawRole) {
    const normalized = String(rawRole || 'CLIENT').trim().toUpperCase();
    if (!USER_ROLES.includes(normalized)) {
      throw DomainException.badRequest(`Rol inválido: ${rawRole}`, 'INVALID_USER_ROLE');
    }
    this.value = normalized;
  }

  isStaff() {
    return this.value === 'ADMIN' || this.value === 'CHEF';
  }

  toString() {
    return this.value;
  }
}

