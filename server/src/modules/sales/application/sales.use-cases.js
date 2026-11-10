/**
 * APPLICATION LAYER: Casos de Uso del Módulo Sales
 * Ubicación: server/src/modules/sales/application/sales.use-cases.js
 */
import { CampaignVoteOrderNotFoundException } from '../domain/sale.exceptions.js';
import { OrderNotFoundException } from '../../orders/domain/order.exceptions.js';

export function createSalesUseCases({ ports }) {
  return {
    async getDashboard({ campaignId } = {}) {
      return ports.orders.getSalesDashboard({ campaignId });
    },

    async updateSaleOrder({ orderId, paymentStatus, status, actorUserId }) {
      const updated = await ports.orders.updateSaleOrder({
        orderId,
        paymentStatus,
        status,
        actorUserId
      });
      if (!updated) {
        throw new OrderNotFoundException();
      }
      return updated;
    },

    async updateCampaignVoteSale({
      voteId,
      paymentStatus,
      status,
      phone,
      deliveryAddress,
      notes,
      actorUserId
    }) {
      const result = await ports.orders.updateCampaignVoteSale({
        voteId,
        paymentStatus,
        status,
        phone,
        deliveryAddress,
        notes,
        actorUserId
      });
      if (!result) {
        throw new CampaignVoteOrderNotFoundException();
      }
      return result;
    }
  };
}
