/**
 * PROYECCIONES DE DOMINIO: Módulo Auth
 */
export function toPublicAuthUserProjection(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || user.app_role || 'CLIENT'
  };
}

export function toSessionProjection(sessionEntity) {
  return sessionEntity instanceof Object && typeof sessionEntity.toJSON === 'function'
    ? sessionEntity.toJSON()
    : sessionEntity;
}

