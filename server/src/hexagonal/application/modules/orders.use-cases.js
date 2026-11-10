/**
 * MÓDULO DE APLICACIÓN: PEDIDOS Y COCINA DEL CHEF (Arquitectura Hexagonal)
 */

import {
  canTransitionOrderStatus,
  computeKitchenProduction,
  ORDER_TRANSITIONS
} from '../../domain/entities.js';
import { DomainError } from '../../domain/errors.js';

export function createOrderUseCases({ ports }) {
  return {
    async create(data, userId) {
      const preparedItems = await Promise.all(
        data.items.map(async item => {
          const burger = await ports.burgers.get(item.burgerId);
          if (!burger || !burger.active || burger.deleted) {
            throw DomainError.conflict(
              'Una hamburguesa ya no está disponible.',
              'BURGER_UNAVAILABLE'
            );
          }
          const ingredients = String(burger.ingredients || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
          const allowed = new Set(ingredients.map(v => v.toLocaleLowerCase('es')));
          if (item.removedIngredients.some(v => !allowed.has(v.toLocaleLowerCase('es')))) {
            throw DomainError.badRequest(
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
        throw DomainError.notFound('Pedido no encontrado.', 'ORDER_NOT_FOUND');
      }
      if (!canTransitionOrderStatus(existing.status, nextStatus)) {
        throw DomainError.conflict(
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
        throw DomainError.notFound('Pedido no encontrado.', 'ORDER_NOT_FOUND');
      }
      if (existing.status !== 'PENDING') {
        throw DomainError.conflict(
          'Sólo puedes cancelar un pedido pendiente.',
          'ORDER_NOT_PENDING'
        );
      }
      return ports.orders.cancelByClient({ orderId, userId });
    }
  };
}

