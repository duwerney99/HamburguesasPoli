import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED'
];

export const KITCHEN_NEXT_STATUS = {
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED']
};

/**
 * VALUE OBJECT: Estado del Pedido
 */
export class OrderStatusValueObject {
  constructor(rawStatus) {
    const normalized = String(rawStatus || 'PENDING').trim().toUpperCase();
    if (!ORDER_STATUSES.includes(normalized)) {
      throw DomainException.badRequest(`Estado de pedido inválido: ${rawStatus}`, 'INVALID_ORDER_STATUS');
    }
    this.value = normalized;
  }

  canTransitionInKitchenTo(nextStatus) {
    const allowed = KITCHEN_NEXT_STATUS[this.value] || [];
    return allowed.includes(nextStatus);
  }

  toString() {
    return this.value;
  }
}

export function canTransitionKitchenOrder(currentStatus, nextStatus) {
  return new OrderStatusValueObject(currentStatus).canTransitionInKitchenTo(nextStatus);
}

