/**
 * MÓDULO DE APLICACIÓN: AUTENTICACIÓN Y SESIONES (Arquitectura Hexagonal)
 */

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { formatPublicUser } from '../../domain/entities.js';
import { DomainError } from '../../domain/errors.js';

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '1d';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 24 * 60 * 60;

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function createAuthUseCases({
  ports,
  jwtSecret = 'dev-only-change-me',
  refreshSecret = `${jwtSecret}:refresh`
}) {
  function signAccessToken(user) {
    return jwt.sign(
      { sub: String(user.id), role: user.app_role || user.role, type: 'access' },
      jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL }
    );
  }

  async function issueAuthSession(user) {
    const accessToken = signAccessToken(user);
    const jti = crypto.randomUUID();
    const refreshToken = jwt.sign(
      { sub: String(user.id), jti, type: 'refresh' },
      refreshSecret,
      { expiresIn: REFRESH_TOKEN_TTL }
    );
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
    await ports.authTokens.saveRefreshToken({
      jti,
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt
    });
    return {
      token: accessToken,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
      user: formatPublicUser(user)
    };
  }

  return {
    async register({ name, email, password }) {
      const passwordHash = bcrypt.hashSync(password, 10);
      const user = await ports.users.createClient({ name, email, passwordHash });
      return issueAuthSession(user);
    },

    async login({ email, password }) {
      const user = await ports.users.findByEmail(email);
      const storedHash = user?.password_hash || user?.passwordHash;
      if (!user || !storedHash || !bcrypt.compareSync(password, storedHash)) {
        throw DomainError.unauthorized(
          'Correo o contraseña incorrectos.',
          'INVALID_CREDENTIALS'
        );
      }
      return issueAuthSession(user);
    },

    async refresh({ refreshToken }) {
      let payload;
      try {
        payload = jwt.verify(refreshToken, refreshSecret);
      } catch {
        throw DomainError.unauthorized(
          'El refresh token no es válido o expiró.',
          'INVALID_REFRESH_TOKEN'
        );
      }
      if (payload?.type !== 'refresh' || !payload?.jti || !payload?.sub) {
        throw DomainError.unauthorized('El refresh token no es válido.', 'INVALID_REFRESH_TOKEN');
      }

      const stored = await ports.authTokens.findRefreshToken(payload.jti);
      if (
        !stored ||
        stored.revoked ||
        Date.parse(stored.expiresAt) <= Date.now() ||
        stored.tokenHash !== hashRefreshToken(refreshToken)
      ) {
        throw DomainError.unauthorized(
          'El refresh token fue revocado o expiró.',
          'REVOKED_REFRESH_TOKEN'
        );
      }

      const user = await ports.users.findById(payload.sub);
      await ports.authTokens.revokeByJti(payload.jti);
      if (!user) {
        throw DomainError.unauthorized('El usuario ya no existe.', 'USER_DELETED');
      }
      return issueAuthSession(user);
    },

    async logout({ refreshToken, userId }) {
      const rawRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';
      if (rawRefresh) {
        await ports.authTokens.revokeByHash(hashRefreshToken(rawRefresh));
      }
      if (userId != null) {
        await ports.authTokens.revokeByUser(userId);
      }
    },

    async getProfile(userId) {
      const user = await ports.users.findById(userId);
      if (!user) {
        throw DomainError.unauthorized('El usuario ya no existe.', 'USER_DELETED');
      }
      return formatPublicUser(user);
    }
  };
}

