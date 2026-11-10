import { UserRoleValueObject } from './role.value-object.js';

/**
 * ENTIDAD DE DOMINIO: Usuario (Módulo Users)
 */
export class UserEntity {
  constructor({ id, name, email, role, app_role, passwordHash, password_hash, createdAt, created_at }) {
    this.id = id;
    this.name = String(name || '').trim();
    this.email = String(email || '').trim().toLowerCase();
    this.roleVO = new UserRoleValueObject(app_role || role || 'CLIENT');
    this.role = this.roleVO.toString();
    this.passwordHash = passwordHash ?? password_hash ?? null;
    this.createdAt = createdAt ?? created_at ?? null;
  }

  toPublicJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role
    };
  }
}

