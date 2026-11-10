import {
  campaignVoteOrderUpdateDtoSchema,
  saleOrderUpdateDtoSchema
} from '../dtos/sales.dto.js';
import { handleModuleControllerError } from '../../../shared/infrastructure/http/error-handler.js';

/**
 * INFRASTRUCTURE INBOUND ADAPTER (Express HTTP Controller): Módulo Sales
 */
export function registerSalesController(app, { useCases, requireAuth, requireRole, parse }) {
  app.get('/api/admin/sales', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const dashboard = await useCases.sales.getDashboard({
        campaignId: req.query.campaignId
      });
      res.json(dashboard);
    } catch (error) {
      handleModuleControllerError(error, res, next);
    }
  });

  app.put(
    '/api/admin/sales/orders/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      const data = parse(saleOrderUpdateDtoSchema, req.body, res);
      if (!data) return;
      try {
        const order = await useCases.sales.updateSaleOrder({
          orderId: req.params.id,
          paymentStatus: data.paymentStatus,
          status: data.status,
          actorUserId: req.auth.sub
        });
        res.json({ order });
      } catch (error) {
        handleModuleControllerError(error, res, next);
      }
    }
  );

  app.put(
    '/api/admin/sales/campaign-votes/:voteId',
    requireAuth,
    requireRole('ADMIN'),
    async (req, res, next) => {
      const data = parse(campaignVoteOrderUpdateDtoSchema, req.body, res);
      if (!data) return;
      try {
        const result = await useCases.sales.updateCampaignVoteSale({
          voteId: req.params.voteId,
          ...data,
          actorUserId: req.auth.sub
        });
        res.json(result);
      } catch (error) {
        handleModuleControllerError(error, res, next);
      }
    }
  );
}
