/**
 * APPLICATION LAYER: Casos de Uso del Módulo Orders & Kitchen
 * Ubicación: server/src/modules/orders/application/orders.use-cases.js
 */
import {
  canTransitionOrderStatus,
  computeKitchenProduction,
  ORDER_TRANSITIONS
} from '../../../hexagonal/domain/entities.js';
import { OrderNotFoundException } from '../domain/order.exceptions.js';
import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

export function createOrdersUseCases({ ports }) {
  return {
    async create(data, userId) {
      const campaigns = await ports.campaigns.list(userId);
      const activeCampaign = campaigns.find(campaign => campaign.status === 'ACTIVE');
      if (!activeCampaign?.userVoteBurgerId || !activeCampaign?.userVoteId) {
        throw DomainException.conflict(
          'Primero debes votar en la campaña activa antes de crear tu pedido.',
          'ACTIVE_CAMPAIGN_VOTE_REQUIRED'
        );
      }
      if (
        data.items.length !== 1 ||
        String(data.items[0].burgerId) !== String(activeCampaign.userVoteBurgerId)
      ) {
        throw DomainException.badRequest(
          'Solo puedes pedir la hamburguesa por la que votaste en la campaña activa.',
          'ORDER_MUST_MATCH_VOTE'
        );
      }
      if (activeCampaign.userVoteOrderId) {
        const linkedOrder = await ports.orders.get(activeCampaign.userVoteOrderId);
        if (linkedOrder && linkedOrder.status !== 'CANCELLED') {
          throw DomainException.conflict(
            'Tu voto ya tiene un pedido activo asociado.',
            'VOTE_ORDER_ALREADY_EXISTS'
          );
        }
      }

      const preparedItems = await Promise.all(
        data.items.map(async item => {
          const burger = await ports.burgers.get(item.burgerId);
          if (!burger || !burger.active || burger.deleted) {
            throw DomainException.conflict(
              'Una hamburguesa ya no está disponible.',
              'BURGER_UNAVAILABLE'
            );
          }
          const ingredients = String(burger.ingredients || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
          const allowed = new Set(ingredients.map(v => v.toLocaleLowerCase('es')));
          if ((item.removedIngredients || []).some(v => !allowed.has(v.toLocaleLowerCase('es')))) {
            throw DomainException.badRequest(
              `Solo puedes retirar ingredientes existentes de ${burger.name}.`,
              'INVALID_INGREDIENT'
            );
          }
          return {
            burgerId: burger.id,
            burgerName: burger.name,
            ingredients,
            removedIngredients: item.removedIngredients || [],
            notes: item.notes || '',
            quantity: Number(item.quantity || 1),
            unitPriceCop: Number(burger.priceCop || 0)
          };
        })
      );

      const totalCop = preparedItems.reduce(
        (sum, item) => sum + item.unitPriceCop * item.quantity,
        0
      );

      return ports.orders.create({
        userId,
        campaignId: activeCampaign.id,
        voteId: activeCampaign.userVoteId,
        phone: data.phone,
        deliveryAddress: data.deliveryAddress,
        notes: data.notes || '',
        items: preparedItems,
        totalCop
      });
    },

    async listMine(userId) {
      return ports.orders.listByUser(userId);
    },

    async getKitchenBoard() {
      const orders = await ports.orders.listKitchen();
      const { paidOrders, productionSummary, clientBreakdown } = computeKitchenProduction(orders);
      return {
        orders,
        paidOrders,
        productionSummary,
        clientBreakdown,
        transitions: ORDER_TRANSITIONS
      };
    },

    async advanceKitchenStatus({ orderId, nextStatus, actorUserId }) {
      const existing = await ports.orders.get(orderId);
      if (!existing) {
        throw new OrderNotFoundException();
      }
      if (!canTransitionOrderStatus(existing.status, nextStatus)) {
        throw DomainException.conflict(
          `No se puede cambiar de ${existing.status} a ${nextStatus}.`,
          'ORDER_STATUS_CONFLICT'
        );
      }
      return ports.orders.changeStatus({
        orderId,
        from: existing.status,
        to: nextStatus,
        actorUserId
      });
    },

    async cancelByClient({ orderId, userId }) {
      const existing = await ports.orders.get(orderId);
      if (!existing || String(existing.userId) !== String(userId)) {
        throw new OrderNotFoundException();
      }
      if (existing.status !== 'PENDING') {
        throw DomainException.conflict(
          'Sólo puedes cancelar un pedido pendiente.',
          'ORDER_NOT_PENDING'
        );
      }
      return ports.orders.cancelByClient({ orderId, userId });
    }
  };
}
