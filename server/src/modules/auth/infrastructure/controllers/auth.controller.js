import {
  credentialsDtoSchema,
  refreshDtoSchema,
  registerDtoSchema
} from '../dtos/auth.dto.js';
import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Auth
 */
export function registerAuthController(
  app,
  { useCases, optionalAuth, requireAuth, parse, limitedAuth }
) {
  app.post('/api/auth/register', limitedAuth, async (req, res, next) => {
    const data = parse(registerDtoSchema, req.body, res);
    if (!data) return;
    try {
      const session = await useCases.auth.register(data);
      res.status(201).json(session);
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.post('/api/auth/login', limitedAuth, async (req, res, next) => {
    const data = parse(credentialsDtoSchema, req.body, res);
    if (!data) return;
    try {
      const session = await useCases.auth.login(data);
      res.json(session);
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.post('/api/auth/refresh', limitedAuth, async (req, res, next) => {
    const data = parse(refreshDtoSchema, req.body, res);
    if (!data) return;
    try {
      const session = await useCases.auth.refresh(data);
      res.json(session);
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.post('/api/auth/logout', optionalAuth, async (req, res, next) => {
    try {
      await useCases.auth.logout({
        refreshToken: req.body?.refreshToken,
        userId: req.auth?.sub
      });
      res.status(204).end();
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res, next) => {
    try {
      const user = await useCases.auth.getProfile(req.auth.sub);
      res.json({ user });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });
}
