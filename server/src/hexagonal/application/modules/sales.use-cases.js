/**
 * MÓDULO DE APLICACIÓN: VENTAS Y PEDIDOS POR CAMPAÑA (Arquitectura Hexagonal)
 */

import { DomainError } from '../../domain/errors.js';

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
        throw DomainError.notFound('Pedido no encontrado.', 'ORDER_NOT_FOUND');
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
        throw DomainError.notFound(
          'Solicitud de campaña no encontrada.',
          'CAMPAIGN_VOTE_NOT_FOUND'
        );
      }
      return result;
    }
  };
}

