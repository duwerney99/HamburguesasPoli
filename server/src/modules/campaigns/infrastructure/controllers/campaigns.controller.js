import { campaignDtoSchema, voteDtoSchema } from '../dtos/campaigns.dto.js';
import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Campaigns
 */
export function registerCampaignsController(
  app,
  { useCases, optionalAuth, requireAuth, requireRole, parse, limitedVote }
) {
  app.get('/api/campaigns', optionalAuth, async (req, res, next) => {
    try {
      const campaigns = await useCases.campaigns.list({
        userId: req.auth?.sub,
        isAdmin: req.auth?.role === 'ADMIN'
      });
      res.json({ campaigns });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.get('/api/campaigns/active', optionalAuth, async (req, res, next) => {
    try {
      const campaign = await useCases.campaigns.getActive(req.auth?.sub);
      res.json({ campaign });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.post('/api/campaigns', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(campaignDtoSchema, req.body, res);
    if (!data) return;
    try {
      const campaign = await useCases.campaigns.create(data, req.auth.sub);
      res.status(201).json({ campaign });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.put('/api/campaigns/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    const data = parse(campaignDtoSchema, req.body, res);
    if (!data) return;
    try {
      const campaign = await useCases.campaigns.update(req.params.id, data, req.auth.sub);
      res.json({ campaign });
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.post(
    '/api/campaigns/:id/close',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      try {
        const result = await useCases.campaigns.close(req.params.id, req.auth.sub);
        res.json(result);
      } catch (error) {
        handleModuleControllerError(error, res, next);
      }
    }
  );

  app.post(
    '/api/campaigns/:id/votes',
    limitedVote,
    requireAuth,
    requireRole('CLIENT'),
    async (req, res, next) => {
      const data = parse(voteDtoSchema, req.body, res);
      if (!data) return;
      try {
        const result = await useCases.campaigns.castVote({
          campaignId: req.params.id,
          burgerId: data.burgerId,
          quantity: data.quantity,
          userId: req.auth.sub
        });
        res.status(201).json(result);
      } catch (error) {
        handleModuleControllerError(error, res, next);
      }
    }
  );

  app.get(
    '/api/campaigns/:id/votes',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      try {
        const result = await useCases.campaigns.listVotes(req.params.id);
        res.json(result);
      } catch (error) {
        handleModuleControllerError(error, res, next);
      }
    }
  );
}
