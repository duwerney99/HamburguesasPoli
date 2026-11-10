import { USER_ROLES } from './role.value-object.js';

/**
 * PROYECCIONES DE DOMINIO: Módulo Users
 */
export function toPublicUserProjection(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.app_role || user.role || 'CLIENT'
  };
}

export function buildPaginatedUsersProjection({ users, counts, page, pageSize, total, totalPages }) {
  return {
    users,
    roles: USER_ROLES,
    counts,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    }
  };
}

