/**
 * ENTIDAD DE DOMINIO: Sesión de Autenticación (Módulo Auth)
 */
export class AuthSessionEntity {
  constructor({ user, token, accessToken, refreshToken, expiresIn, refreshExpiresIn }) {
    this.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || user.app_role || 'CLIENT'
    };
    this.token = token || accessToken;
    this.accessToken = accessToken || token;
    this.refreshToken = refreshToken;
    this.expiresIn = expiresIn || '15m';
    this.refreshExpiresIn = refreshExpiresIn || '1d';
  }

  toJSON() {
    return {
      token: this.token,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresIn: this.expiresIn,
      refreshExpiresIn: this.refreshExpiresIn,
      user: this.user
    };
  }
}

